import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { readdirSync, statSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pool from '../db.js'
import { requireAuth, qpMiddleware } from './auth.js'
import { pushToUser, pushToAll } from '../sseClients.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = Router()
export { router as adminRouter }

router.use(requireAuth)

function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' })
  next()
}
router.use(requireAdmin)
router.use(qpMiddleware)

function toPublic(u) {
  return {
    id: u.id,
    username: u.username,
    firstName: u.first_name || null,
    lastName: u.last_name || null,
    email: u.email || null,
    isAdmin: Boolean(u.is_admin),
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at || null,
    lastActiveAt: u.last_active_at || null,
    isFrozen: Boolean(u.is_frozen),
  }
}

router.get('/users', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, first_name, last_name, email, is_admin, created_at, quota_bytes, is_frozen, last_login_at, last_active_at, ai_quota_tokens, ai_used_tokens FROM users ORDER BY created_at ASC'
    )
    res.json(rows.map(u => ({ ...toPublic(u), quotaBytes: u.quota_bytes, aiQuotaTokens: u.ai_quota_tokens, aiUsedTokens: u.ai_used_tokens })))
  } catch { res.status(500).json({ error: 'Server error' }) }
})

router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot delete your own account.' })
    // Kick all active sessions before the DB record is gone
    pushToUser(req.params.id, 'logout', { reason: 'deleted' })
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id])
    const storageDir = join(__dirname, '..', 'storage', req.params.id)
    try { rmSync(storageDir, { recursive: true, force: true }) } catch {}
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

router.put('/users/:id/promote', async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body || {}
    if (!password || password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters' })
    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE users SET password_hash = $1, tokens_invalidated_at = NOW() WHERE id = $2', [hash, req.params.id])
    // Force all active sessions off immediately via SSE
    pushToUser(req.params.id, 'logout', { reason: 'password_changed' })
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

router.get('/config', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_config WHERE key = 'admin'`)
    res.json(rows[0]?.value || { allowSignup: true, allowGuest: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

router.put('/config', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO app_config (key, value) VALUES ('admin', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(req.body || {})]
    )
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// View any user's full storage (admin-only)
router.get('/data/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM user_data WHERE user_id = $1', [req.params.userId]
    )
    const result = {}
    for (const row of rows) result[row.key] = row.value
    res.json(result)
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// PUT /api/admin/users/:id/quota — set storage quota in bytes
router.put('/users/:id/quota', async (req, res) => {
  try {
    const { MIN_QUOTA_BYTES } = await import('../config.js')
    const bytes = parseInt(req.body?.bytes)
    if (!bytes || bytes < MIN_QUOTA_BYTES)
      return res.status(400).json({ error: `quota must be at least 1 MB (${MIN_QUOTA_BYTES} bytes)` })
    await pool.query('UPDATE users SET quota_bytes = $1 WHERE id = $2', [bytes, req.params.id])
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// PUT /api/admin/users/:id/ai-quota — set per-user AI token quota
router.put('/users/:id/ai-quota', async (req, res) => {
  try {
    const { MIN_AI_QUOTA_TOKENS } = await import('../config.js')
    const tokens = parseInt(req.body?.tokens)
    if (!tokens || tokens < MIN_AI_QUOTA_TOKENS)
      return res.status(400).json({ error: `AI quota must be at least ${MIN_AI_QUOTA_TOKENS} tokens` })
    await pool.query('UPDATE users SET ai_quota_tokens = $1 WHERE id = $2', [tokens, req.params.id])
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// PUT /api/admin/users/:id/freeze — freeze or unfreeze an account
router.put('/users/:id/freeze', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot freeze your own account.' })
    const frozen = req.body?.frozen !== false
    await pool.query('UPDATE users SET is_frozen = $1 WHERE id = $2', [frozen, req.params.id])
    // Push immediate kick to all active sessions of the target user
    pushToUser(req.params.id, 'logout', { reason: frozen ? 'frozen' : 'unfrozen' })
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// POST /api/admin/users/:id/revoke-tokens — invalidate all active sessions (remote logout)
router.post('/users/:id/revoke-tokens', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot revoke your own session.' })
    await pool.query('UPDATE users SET tokens_invalidated_at = NOW() WHERE id = $1', [req.params.id])
    // Push immediate kick via SSE before the DB change propagates
    pushToUser(req.params.id, 'logout', { reason: 'revoked' })
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/admin/users/:id/detail — detailed info including disk storage breakdown
router.get('/users/:id/detail', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, first_name, last_name, email, is_admin, created_at, quota_bytes, is_frozen, last_login_at, last_active_at, ai_quota_tokens, ai_used_tokens FROM users WHERE id = $1',
      [req.params.id]
    )
    const u = rows[0]
    if (!u) return res.status(404).json({ error: 'User not found' })

    const storageDir = join(__dirname, '..', 'storage', u.id)
    let used = 0, fileCount = 0
    try {
      const files = readdirSync(storageDir)
      fileCount = files.length
      for (const f of files) {
        try { used += statSync(join(storageDir, f)).size } catch {}
      }
    } catch { /* directory may not exist yet for new users */ }

    res.json({
      ...toPublic(u),
      quotaBytes: u.quota_bytes,
      aiQuotaTokens: u.ai_quota_tokens,
      aiUsedTokens:  u.ai_used_tokens,
      storage: {
        used,
        quota: u.quota_bytes,
        free: Math.max(0, u.quota_bytes - used),
        pct: u.quota_bytes > 0 ? Math.min(100, (used / u.quota_bytes) * 100) : 0,
      },
      fileCount,
    })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// ── Catalog management ────────────────────────────────────────────────────────
export const CATALOG_PATH = join(__dirname, '..', '..', 'public', 'apps', 'catalog.json')

function readCatalog() {
  // Throw on failure so route handlers return 500 rather than silently
  // overwriting the catalog with an empty-apps list.
  try {
    let raw = readFileSync(CATALOG_PATH, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    return JSON.parse(raw)
  }
  catch (e) { throw new Error(`Failed to read catalog: ${e.message}`) }
}

function sanitizeApp(body) {
  const { name, description, url, allowIframe, showCursor, featured, tags, icon_url, cover_image, media } = body
  return {
    name:        String(name        || '').trim(),
    description: String(description || ''),
    url:         String(url         || '').trim(),
    allowIframe: Boolean(allowIframe),
    showCursor:  showCursor === false ? false : true,
    featured:    Boolean(featured),
    tags:        Array.isArray(tags)  ? tags.map(String)  : [],
    icon_url:    String(icon_url     || '').trim(),
    cover_image: String(cover_image  || '').trim(),
    media:       Array.isArray(media) ? media.map(String) : [],
  }
}

function writeCatalog(data) {
  writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2), 'utf8')
  pushToAll('catalog-update', data)
}

router.get('/catalog', (_req, res) => {
  res.json(readCatalog())
})

router.post('/catalog/apps', (req, res) => {
  try {
    const catalog = readCatalog()
    const app = sanitizeApp(req.body)
    if (!app.name) return res.status(400).json({ error: 'name is required' })
    if (!app.url)  return res.status(400).json({ error: 'url is required' })
    if (catalog.apps.some(a => a.name === app.name))
      return res.status(409).json({ error: 'An app with that name already exists' })
    catalog.apps.push(app)
    writeCatalog(catalog)
    res.json({ ok: true, catalog })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/catalog/apps/:name', (req, res) => {
  try {
    const catalog = readCatalog()
    const idx = catalog.apps.findIndex(a => a.name === decodeURIComponent(req.params.name))
    if (idx === -1) return res.status(404).json({ error: 'App not found' })
    const app = sanitizeApp(req.body)
    if (!app.name) return res.status(400).json({ error: 'name is required' })
    if (!app.url)  return res.status(400).json({ error: 'url is required' })
    catalog.apps[idx] = app
    writeCatalog(catalog)
    res.json({ ok: true, catalog })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/catalog/apps/:name', (req, res) => {
  try {
    const catalog = readCatalog()
    const idx = catalog.apps.findIndex(a => a.name === decodeURIComponent(req.params.name))
    if (idx === -1) return res.status(404).json({ error: 'App not found' })
    catalog.apps.splice(idx, 1)
    writeCatalog(catalog)
    res.json({ ok: true, catalog })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
