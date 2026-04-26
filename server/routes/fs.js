/**
 * /api/fs  — Real on-disk file storage for this web desktop OS
 *
 * Each user's files live at:  server/storage/{userId}/{nodeId}
 * Content is raw text (or base64 data-URLs for binary files).
 * The file tree metadata (names, types, parent relationships) still lives in
 * user_data as "elyra-fs", but WITHOUT the content field — content is fetched
 * separately via these endpoints.
 *
 * Security:
 *  - All routes require a valid JWT (requireAuth middleware).
 *  - Node IDs are validated against a safe alphanumeric pattern before any
 *    filesystem operation — preventing path traversal attacks.
 *  - User dirs are fully isolated: server/storage/{userId}/
 */

import { Router }                                           from 'express'
import { mkdirSync, writeFileSync, readFileSync,
         unlinkSync, existsSync, statSync, readdirSync,
         createWriteStream, createReadStream, openSync,
         readSync, closeSync }                             from 'fs'
import { pipeline }                                       from 'stream'
import { promisify }                                      from 'util'
import path                                               from 'path'
import { fileURLToPath }                                  from 'url'
import { lookup as mimeLookup }                           from 'mime-types'
import pool                                               from '../db.js'
import { requireAuth, qpMiddleware }                      from './auth.js'
import { JWT_SECRET }                                     from '../config.js'
import jwt                                               from 'jsonwebtoken'

const pipelineAsync = promisify(pipeline)

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = path.join(__dirname, '..', 'storage')

// ── Helpers ──────────────────────────────────────────────────────────────────

function userDir(userId) {
  const dir = path.join(STORAGE_ROOT, userId)
  mkdirSync(dir, { recursive: true })
  return dir
}

// nodeId must be alphanumeric+dash — no slashes, dots, etc.
const SAFE_ID = /^[a-zA-Z0-9_-]{1,32}$/
function safeFilePath(userId, nodeId) {
  if (!SAFE_ID.test(nodeId)) throw new Error('Invalid node ID')
  return path.join(userDir(userId), nodeId)
}

async function getQuota(userId) {
  const { rows } = await pool.query(
    'SELECT quota_bytes FROM users WHERE id = $1', [userId]
  )
  return rows[0]?.quota_bytes ?? 1073741824 // default 1 GB
}

function calcUsed(userId) {
  const dir = path.join(STORAGE_ROOT, userId)
  if (!existsSync(dir)) return 0
  let used = 0
  for (const f of readdirSync(dir)) {
    try { used += statSync(path.join(dir, f)).size } catch {}
  }
  return used
}

// ── Router ───────────────────────────────────────────────────────────────────

const router = Router()
export { router as fsRouter }

// ── GET /api/fs/raw/:nodeId — direct binary streaming  ─────────────────────
// This route handles its own auth so it can accept a token in the ?t= query
// param, which is required for use in <video src="..."> tags (no custom headers).
// The file is served as raw binary, not JSON, so the browser receives real bytes.
// For legacy DataURL files on disk, base64 is decoded server-side before sending.
router.get('/raw/:nodeId', (req, res, next) => {
  // Allow token from query string (for <video src> / <img src> use cases)
  if (!req.headers.authorization && req.query.t) {
    req.headers.authorization = `Bearer ${req.query.t}`
  }
  requireAuth(req, res, next)
}, (req, res) => {
  try {
    const fp = safeFilePath(req.user.id, req.params.nodeId)
    if (!existsSync(fp)) return res.status(404).end()

    // Peek at the first 80 bytes to detect legacy DataURL format
    const peekBuf = Buffer.alloc(80)
    const fd = openSync(fp, 'r')
    const bytesRead = readSync(fd, peekBuf, 0, 80, 0)
    closeSync(fd)
    const peek = peekBuf.slice(0, bytesRead).toString('ascii')

    // Infer MIME type from the optional ?name= filename hint, or fall back to octet-stream
    const nameHint  = req.query.name || ''
    const guessedMime = (nameHint && mimeLookup(nameHint)) || 'application/octet-stream'

    if (peek.startsWith('data:')) {
      // Legacy format: file on disk is a DataURL string — decode and serve binary
      const raw   = readFileSync(fp, 'utf8')
      const match = raw.match(/^data:([^;,]+)(?:;[^,]*)?,/)
      const mime  = match ? match[1] : guessedMime
      const sep   = raw.indexOf(',')
      const b64   = sep !== -1 ? raw.slice(sep + 1) : raw
      const buf   = Buffer.from(b64.replace(/\s/g, ''), 'base64')
      res.setHeader('Content-Type', mime)
      res.setHeader('Content-Length', buf.length)
      res.setHeader('Cache-Control', 'private, no-cache')
      return res.end(buf)
    }

    // New format: raw bytes — pipe with range support via res.sendFile
    const absPath = path.resolve(fp)
    res.setHeader('Content-Type', guessedMime)
    res.setHeader('Cache-Control', 'private, no-cache')
    res.sendFile(absPath)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.use(requireAuth)

// Pass (qpMiddleware) is only enforced for structural mutations (move, rename, etc.).
// File CONTENT reads/writes (/content/:nodeId, /stream/:nodeId, /copy/:nodeId) are exempt:
//   - Reads are GET — idempotent, no state change.
//   - Writes use the per-user JWT for auth + the Authorization header prevents CSRF.
//     Exempting writes avoids a race where createNodeEntry fires fsUploadStream and
//     _saveFsTree (via dbSet/_savePending) simultaneously — both would grab the same
//     single-use pass, one 403s, and the upload silently fails.
//     /stream/:nodeId carries binary bodies so the Bearer JWT is the sole auth mechanism.
//     /copy/:nodeId is a server-side copy with no external content involved.
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  if (req.path.startsWith('/content/')) return next()
  if (req.path.startsWith('/stream/'))  return next()
  if (req.path.startsWith('/copy/'))    return next()
  return qpMiddleware(req, res, next)
})

// ── GET /api/fs/quota — used + total bytes for the current user ───────────────
router.get('/quota', async (req, res) => {
  try {
    const used  = calcUsed(req.user.id)
    const quota = await getQuota(req.user.id)
    res.json({ used, quota })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/fs/content/:nodeId ───────────────────────────────────────────────
router.get('/content/:nodeId', (req, res) => {
  try {
    const fp = safeFilePath(req.user.id, req.params.nodeId)
    if (!existsSync(fp)) return res.json({ content: '' })
    res.json({ content: readFileSync(fp, 'utf8') })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})


// ── PUT /api/fs/content/:nodeId ───────────────────────────────────────────────
router.put('/content/:nodeId', async (req, res) => {
  try {
    const { content = '' } = req.body
    const fp    = safeFilePath(req.user.id, req.params.nodeId)
    const quota = await getQuota(req.user.id)

    // Calculate used storage, excluding the file being overwritten
    const dir     = userDir(req.user.id)
    let   used    = 0
    for (const f of readdirSync(dir)) {
      if (f === req.params.nodeId) continue
      try { used += statSync(path.join(dir, f)).size } catch {}
    }
    const newSize = Buffer.byteLength(content, 'utf8')
    if (used + newSize > quota) {
      const usedMB  = ((used + newSize) / 1024 / 1024).toFixed(1)
      const quotaMB = (quota            / 1024 / 1024).toFixed(0)
      return res.status(413).json({
        error: `Storage quota exceeded (${usedMB} MB / ${quotaMB} MB)`
      })
    }

    writeFileSync(fp, content, 'utf8')
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── DELETE /api/fs/content/:nodeId ───────────────────────────────────────────
router.delete('/content/:nodeId', (req, res) => {
  try {
    const fp = safeFilePath(req.user.id, req.params.nodeId)
    if (existsSync(fp)) unlinkSync(fp)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── POST /api/fs/bulk-delete — delete multiple files at once ─────────────────
router.post('/bulk-delete', (req, res) => {
  const { nodeIds = [] } = req.body
  for (const nodeId of nodeIds) {
    try {
      const fp = safeFilePath(req.user.id, nodeId)
      if (existsSync(fp)) unlinkSync(fp)
    } catch {}
  }
  res.json({ ok: true })
})

// ── POST /api/fs/copy/:sourceId — server-side binary-safe file copy ──────────
router.post('/copy/:sourceId', (req, res) => {
  try {
    const { destNodeId } = req.body
    if (!destNodeId || !SAFE_ID.test(destNodeId)) return res.status(400).json({ error: 'Invalid destNodeId' })
    const src = safeFilePath(req.user.id, req.params.sourceId)
    const dst = safeFilePath(req.user.id, destNodeId)
    if (!existsSync(src)) return res.json({ ok: true })  // nothing to copy (e.g. empty node)
    const data = readFileSync(src)  // Buffer-based read — binary-safe regardless of content
    writeFileSync(dst, data)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── PUT /api/fs/stream/:nodeId — streaming upload for large files ─────────────
// The request body is piped directly to disk — no buffering in Node.js memory.
// Content-Type must NOT be application/json (so express.json() skips it).
// Supports chunked uploads via ?seq=<index>&total=<count>:
//   seq=0        → create/overwrite the file (first or only chunk)
//   seq>0        → append to the existing file (subsequent chunks)
// The client sends X-File-Size with the total file size so the quota check
// can validate against the full file on seq=0 without needing all chunks first.
router.put('/stream/:nodeId', async (req, res) => {
  try {
    const fp    = safeFilePath(req.user.id, req.params.nodeId)
    const seq   = parseInt(req.query.seq   ?? '0', 10)
    const total = parseInt(req.query.total ?? '1', 10)

    // Quota check only on the first chunk, using total file size from X-File-Size
    // (Content-Length only covers the single chunk, not the full file).
    if (seq === 0) {
      const quota    = await getQuota(req.user.id)
      const fileSize = parseInt(req.headers['x-file-size'] || req.headers['content-length'] || '0', 10)
      if (fileSize > 0) {
        const dir = userDir(req.user.id)
        let used  = 0
        for (const f of readdirSync(dir)) {
          if (f === req.params.nodeId) continue
          try { used += statSync(path.join(dir, f)).size } catch {}
        }
        if (used + fileSize > quota) {
          const usedMB  = ((used + fileSize) / 1024 / 1024).toFixed(1)
          const quotaMB = (quota             / 1024 / 1024).toFixed(0)
          req.resume()  // drain body to avoid ECONNRESET on the client
          return res.status(413).json({
            error: `Storage quota exceeded (${usedMB} MB / ${quotaMB} MB)`
          })
        }
      }
    }

    // seq=0 → write (create/overwrite); seq>0 → append subsequent chunks
    const ws = createWriteStream(fp, { flags: seq === 0 ? 'w' : 'a' })
    await pipelineAsync(req, ws)
    res.json({ ok: true, seq, done: seq === total - 1 })
  } catch (e) {
    if (e.code === 'ERR_STREAM_PREMATURE_CLOSE') return res.status(499).end()
    res.status(400).json({ error: e.message })
  }
})
