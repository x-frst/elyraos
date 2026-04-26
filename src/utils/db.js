/**
 * ElyraOS Server API Client
 *
 * All user data is persisted on the Express + PostgreSQL server.
 * An in-memory cache makes reads synchronous (same API as the old localStorage approach).
 * A localStorage mirror (`${STORAGE_PREFIX}data:*` keys) acts as offline fallback.
 *
 * Flow:
 *   1. setJWT(token)  — call immediately after login / register
 *   2. dbInit()       — async: fetches ALL user data from server (or falls back to localStorage)
 *   3. dbGet(key)     — sync: reads from cache (instant)
 *   4. dbSet(key, v)  — updates cache + localStorage immediately, async PUT to server
 */

import { API_BASE, DEFAULT_QUOTA_BYTES, STORAGE_KEYS, STORAGE_PREFIX } from '../config.js'

const API       = API_BASE
const LS_PREFIX = `${STORAGE_PREFIX}data:`
const _cache    = new Map()
let   _jwt      = null
// Serialized queue for server KV writes — see dbSet() below
let   _savePending = Promise.resolve()

// NOTE: JWT is intentionally NOT loaded from localStorage on startup.
// Access tokens are short-lived (15 min). On page load, useAuthStore calls
// refreshAccessToken() which silently re-issues a fresh token via the
// httpOnly refresh cookie — no long-lived secret ever sits in localStorage.

// ── Eagerly warm cache from localStorage so dbGet works synchronously ─────────
// This runs at module load so the Zustand store gets correct initial values.
try {
  for (let i = 0; i < localStorage.length; i++) {
    const lsKey = localStorage.key(i)
    if (lsKey?.startsWith(LS_PREFIX)) {
      const raw = localStorage.getItem(lsKey)
      if (raw) try { _cache.set(lsKey.slice(LS_PREFIX.length), JSON.parse(raw)) } catch {}
    }
  }
} catch {}

// ── Auth token ───────────────────────────────────────────────────────────────

export function setJWT(token) {
  _jwt = token
  // Do NOT write to localStorage — short-lived access tokens don't belong there.
  // The httpOnly refresh cookie (managed by the browser) restores the session on reload.
  if (!token) try { localStorage.removeItem(STORAGE_KEYS.jwt) } catch {} // cleanup legacy
}

/** Returns the current in-memory access token. */
export function getJWT() { return _jwt }

/**
 * Silently requests a new 15-min access token using the httpOnly refresh cookie.
 * Call this on app startup (instead of reading JWT from localStorage).
 * Returns true on success, false if the cookie is missing or expired.
 */
export async function refreshAccessToken() {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method:      'POST',
      credentials: 'include',  // sends the httpOnly cookie
      headers:     { 'Content-Type': 'application/json' },
    })
    if (!res.ok) { setJWT(null); return false }
    const { token, qp } = await res.json()
    setJWT(token)
    if (qp) setQp(qp)
    return true
  } catch { setJWT(null); return false }
}

function _h() {
  const h = { 'Content-Type': 'application/json' }
  if (_jwt) h['Authorization'] = `Bearer ${_jwt}`
  return h
}

let _qp = null

/** Store the current one-time-use request pass issued by the server. */
export function setQp(val) { _qp = val }

/** Read the current pass (used by XHR upload which can't await a function). */
export function getQp()    { return _qp }

/** Headers for AI routes — includes Authorization and the one-time-use pass. */
async function _aiH() {
  const h = { 'Content-Type': 'application/json' }
  if (_jwt) h['Authorization'] = `Bearer ${_jwt}`
  if (_qp)  h['X-Nv-Qp']      = _qp
  return h
}

// ── Cache warm-up ─────────────────────────────────────────────────────────────

/**
 * Fetch ALL user data from the server and fill the local cache.
 * Falls back to localStorage mirror if server is unreachable.
 */
export async function dbInit() {
  if (_jwt) {
    try {
      const res = await fetch(`${API}/data`, { headers: await _aiH() })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
      if (res.ok) {
        const data = await res.json()
        _cache.clear()
        for (const [k, v] of Object.entries(data)) _cache.set(k, v)
        return  // server loaded — skip fallback
      }
    } catch { /* server down — fall through to localStorage */ }
  }
  // Fallback: warm cache from localStorage copies written by dbSet
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (lsKey?.startsWith(LS_PREFIX)) {
        const k   = lsKey.slice(LS_PREFIX.length)
        const raw = localStorage.getItem(lsKey)
        if (raw) try { _cache.set(k, JSON.parse(raw)) } catch {}
      }
    }
  } catch {}
}

// ── Sync KV reads / writes ────────────────────────────────────────────────────

/** Sync read from the in-memory cache. Returns `def` when the key doesn't exist. */
export function dbGet(key, def = null) {
  if (!_cache.has(key)) return def
  const v = _cache.get(key)
  return (v !== null && v !== undefined) ? v : def
}

/** Update cache immediately; async-persist to server (fire-and-forget). */
export function dbSet(key, value) {
  _cache.set(key, value)
  if (!_jwt) return          // guest mode — in-memory only, no localStorage mirror, no server writes
  // Mirror to localStorage so data survives server outages / page refreshes
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)) } catch {}
  // Serialize server writes — each save waits for the previous to complete so that
  // the one-time-use pass is always refreshed before the next request fires.
  // Without this, concurrent dbSet calls (e.g. settings + wallpaper) both send the
  // same pass; the second gets 403 and the data is silently never saved to the server.
  _savePending = _savePending
    .then(async () => {
      const res = await fetch(`${API}/data/${encodeURIComponent(key)}`, {
        method: 'PUT', headers: await _aiH(), body: JSON.stringify({ value }),
      })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    })
    .catch(() => {})
}

/** Remove from cache and server. */
export function dbDel(key) {
  _cache.delete(key)
  try { localStorage.removeItem(LS_PREFIX + key) } catch {}
  if (!_jwt) return
  _savePending = _savePending
    .then(async () => {
      const res = await fetch(`${API}/data/${encodeURIComponent(key)}`, {
        method: 'DELETE', headers: await _aiH(),
      })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    })
    .catch(() => {})
}

// ── Raw localStorage helpers (for JWT, session ID etc.) ──────────────────────

export function rawGet(key)        { try { return localStorage.getItem(key)       } catch { return null } }
export function rawSet(key, value) { try { localStorage.setItem(key, String(value)) } catch {} }
export function rawDel(key)        { try { localStorage.removeItem(key)            } catch {} }

// ── AI Chat API (/api/chats) ──────────────────────────────────────────────────
// These use the same _savePending serialization queue as dbSet so single-use
// request passes are never double-consumed by concurrent write operations.

/** Fetch all chats for the current user. Returns [] for guests or on error. */
export async function chatGetAll() {
  if (!_jwt) return []
  try {
    const res = await fetch(`${API}/chats`, { headers: _h() })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

/** Upsert a single chat to the server (fire-and-forget, serialized via _savePending). */
export function chatPut(chat) {
  if (!_jwt) return
  _savePending = _savePending.then(async () => {
    const res = await fetch(`${API}/chats/${encodeURIComponent(chat.id)}`, {
      method:  'PUT',
      headers: await _aiH(),
      body:    JSON.stringify({
        title:     chat.title,
        mode:      chat.mode,
        messages:  chat.messages,
        agentPlan: chat.agentPlan ?? null,
      }),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  }).catch(() => {})
}

/** Delete a single chat from the server (fire-and-forget, serialized via _savePending). */
export function chatDel(id) {
  if (!_jwt) return
  _savePending = _savePending.then(async () => {
    const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: await _aiH(),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  }).catch(() => {})
}

// ── Real file-storage API  (/api/fs) ─────────────────────────────────────────
// File content is stored on the server as individual files per node-id.
// These functions are used by useStore to read/write actual file content.

/** Fetch a single file's content from the server. Returns '' when not found. */
export async function fsRead(nodeId) {
  if (!_jwt) return ''
  try {
    const res = await fetch(`${API}/fs/content/${encodeURIComponent(nodeId)}`, { headers: await _aiH() })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    if (!res.ok) return ''
    const { content } = await res.json()
    return content ?? ''
  } catch { return '' }
}

/** Write a file's content to the server. Returns { ok:true } or { error:string }. */
export async function fsWrite(nodeId, content) {
  if (!_jwt) return { ok: true }
  try {
    const res = await fetch(`${API}/fs/content/${encodeURIComponent(nodeId)}`, {
      method:  'PUT',
      headers: await _aiH(),
      body:    JSON.stringify({ content }),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    return res.ok ? { ok: true } : await res.json()
  } catch { return { ok: true } }
}

/** Delete a single file from the server (fire-and-forget). */
export function fsDel(nodeId) {
  if (!_jwt) return
  ;(async () => {
    try {
      const res = await fetch(`${API}/fs/content/${encodeURIComponent(nodeId)}`, {
        method: 'DELETE', headers: await _aiH(),
      })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    } catch {}
  })()
}

/** Delete multiple files from the server (bulk, fire-and-forget). */
export function fsBulkDel(nodeIds) {
  if (!_jwt || !nodeIds.length) return
  ;(async () => {
    try {
      const res = await fetch(`${API}/fs/bulk-delete`, {
        method: 'POST', headers: await _aiH(), body: JSON.stringify({ nodeIds }),
      })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    } catch {}
  })()
}

/** Fetch ALL file contents for this user in one round-trip (used at login). */
export async function fsLoadAll() {
  if (!_jwt) return {}
  try {
    const res = await fetch(`${API}/fs/all`, { headers: await _aiH() })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    if (!res.ok) return {}
    return await res.json()
  } catch { return {} }
}

/**
 * Returns a URL that streams the file's raw bytes directly from the server.
 * Safe to use as `<video src>`, `<audio src>`, `<img src>` — the browser manages
 * buffering and range requests without loading anything into the JS heap.
 * @param {string} nodeId - the file's node ID
 * @param {string} [name]  - optional filename for MIME-type inference (e.g. "movie.mp4")
 */
export function fsRawUrl(nodeId, name) {
  const token  = _jwt || ''
  const params = new URLSearchParams({ t: token })
  if (name) params.set('name', name)
  return `${API}/fs/raw/${encodeURIComponent(nodeId)}?${params}`
}

/**
 * Upload a file via streaming XHR (no readAsDataURL, no base64 overhead).
 * Sends raw bytes directly — server writes them to disk without buffering.
 * Supports upload progress events and cancellation via AbortSignal.
 */
// 95 MB per chunk — stays safely under Cloudflare Tunnels' 100 MB request limit.
const CHUNK_SIZE = 95 * 1024 * 1024

export function fsUploadStream(nodeId, file, onProgress, signal) {
  // Guest sessions have no JWT — never write to the server
  if (!_jwt) return Promise.resolve({ ok: true })
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1
  if (totalChunks === 1) {
    return _fsChunk(nodeId, file, 0, 1, file.size, onProgress, signal)
  }
  // Multi-chunk: upload slices sequentially, each ≤ CHUNK_SIZE bytes.
  const uploadSeq = (seq) => {
    if (signal?.aborted) {
      return Promise.reject(Object.assign(new Error('Upload cancelled'), { cancelled: true }))
    }
    const start = seq * CHUNK_SIZE
    const end   = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)
    return _fsChunk(
      nodeId, chunk, seq, totalChunks, file.size,
      (p) => onProgress?.((start + (end - start) * p) / file.size),
      signal
    ).then(() => seq + 1 < totalChunks ? uploadSeq(seq + 1) : { ok: true })
  }
  return uploadSeq(0)
}

function _fsChunk(nodeId, blob, seq, total, fileSize, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      // Rotate the pass if the server issued a fresh one
      const qt = xhr.getResponseHeader('x-nv-qt');  if (qt) setQp(qt)
      if (xhr.status < 400) {
        try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({ ok: true }) }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed')) }
        catch { reject(new Error('Upload failed')) }
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { cancelled: true }))
    if (signal) signal.addEventListener('abort', () => xhr.abort())
    xhr.open('PUT', `${API}/fs/stream/${encodeURIComponent(nodeId)}?seq=${seq}&total=${total}`)
    if (_jwt) xhr.setRequestHeader('Authorization', `Bearer ${_jwt}`)
    if (_qp)  xhr.setRequestHeader('X-Nv-Qp', _qp)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-File-Size', String(fileSize))
    xhr.send(blob)
  })
}

/**
 * Server-side binary-safe file copy.
 * Copies the raw bytes of `sourceId` into a new file `destNodeId` without
 * routing the content through the JavaScript heap (no UTF-8 re-encoding).
 * Fire-and-forget — caller should optimistically update the tree first.
 */
export async function fsCopy(sourceId, destNodeId) {
  if (!_jwt) return { ok: true }
  try {
    const res = await fetch(`${API}/fs/copy/${encodeURIComponent(sourceId)}`, {
      method:  'POST',
      headers: await _aiH(),
      body:    JSON.stringify({ destNodeId }),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    return res.ok ? { ok: true } : await res.json()
  } catch { return { ok: true } }
}

/** Get quota info: { used, quota } in bytes. */
export async function fsQuota() {
  if (!_jwt) return { used: 0, quota: DEFAULT_QUOTA_BYTES }
  try {
    const res = await fetch(`${API}/fs/quota`, { headers: await _aiH() })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    if (!res.ok) return { used: 0, quota: DEFAULT_QUOTA_BYTES }
    return await res.json()
  } catch { return { used: 0, quota: DEFAULT_QUOTA_BYTES } }
}

/** Admin: set a user's quota in bytes. */
export async function adminSetQuota(userId, bytes) {
  if (!_jwt) return
  const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/quota`, {
    method: 'PUT', headers: await _aiH(), body: JSON.stringify({ bytes }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  return res.json()
}

/** Admin: get detailed user info including disk storage breakdown. */
export async function adminGetUserDetail(userId) {
  if (!_jwt) return null
  try {
    const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/detail`, { headers: await _aiH() })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** Admin: freeze or unfreeze a user account. */
export async function adminFreezeUser(userId, frozen) {
  if (!_jwt) return
  const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/freeze`, {
    method: 'PUT', headers: await _aiH(), body: JSON.stringify({ frozen }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  return res.json()
}

/** Admin: revoke all active sessions for a user (remote logout). */
export async function adminRevokeTokens(userId) {
  if (!_jwt) return
  const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/revoke-tokens`, {
    method: 'POST', headers: await _aiH(),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  return res.json()
}

/** Self: change own password (requires current password). Does NOT revoke sessions. */
export async function selfChangePassword(currentPassword, newPassword) {
  if (!_jwt) return { error: 'Not authenticated' }
  try {
    const res = await fetch(`${API}/auth/me/password`, {
      method: 'PUT', headers: _h(),
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    return await res.json()
  } catch { return { error: 'Network error' } }
}

/** Admin: change a user's password remotely (also revokes all sessions). */
export async function adminChangePassword(userId, password) {
  if (!_jwt) return { error: 'Not authenticated' }
  try {
    const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/password`, {
      method: 'PUT', headers: await _aiH(), body: JSON.stringify({ password }),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    return await res.json()
  } catch { return { error: 'Network error' } }
}

// ── AI API (/api/ai) ──────────────────────────────────────────────────────────

/** Get current user's AI quota usage: { used, quota, free } in tokens. */
export async function aiQuota() {
  if (!_jwt) return { used: 0, quota: 0, free: 0 }
  try {
    const res = await fetch(`${API}/ai/quota`, { headers: _h() })
    if (!res.ok) return { used: 0, quota: 0, free: 0 }
    return await res.json()
  } catch { return { used: 0, quota: 0, free: 0 } }
}

/**
 * Deduct credits for a locally-handled reply (no external AI call was made).
 * Cost is computed server-side from approximate token counts (chars / 4).
 * Fire-and-forget — quota UI updates via the normal refreshQuota() in finally.
 */
export async function aiSpend(inputChars, outputChars) {
  if (!_jwt) return
  try {
    const res = await fetch(`${API}/ai/spend`, {
      method:  'POST',
      headers: await _aiH(),
      body:    JSON.stringify({ inputChars, outputChars }),
    })
    const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  } catch { /* non-fatal */ }
}

/**
 * Stream a chat completion. Calls onDelta(text) for each streamed chunk,
 * resolves with the full concatenated text when done.
 * Rejects with an Error on quota exhaustion or API errors.
 */
export async function aiChat(messages, system, onDelta) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/chat`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ messages, system }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI error ${res.status}`)
  }
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   full    = ''
  let   buf     = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const delta  = parsed.choices?.[0]?.delta?.content || ''
        if (delta) { full += delta; onDelta?.(delta) }
      } catch { /* skip */ }
    }
  }
  return full
}

/** Generate an image. Returns { dataUrl, revisedPrompt } or throws. */
export async function aiImage(prompt) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/image`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ prompt }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Image generation failed`)
  return data
}

/** Generate speech from text. Returns { dataUrl } (audio/mpeg base64) or throws. */
export async function aiAudio(text, voice = 'alloy', speed = 1.0) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/audio`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ text, voice, speed }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Audio generation failed`)
  return data
}

/** Plan a project. Returns { projectName, description, todos, files } or throws. */
export async function aiAgentPlan(request) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/agent-plan`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ request }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Planning failed`)
  return data
}

/** Patch an existing project. Returns { files } with only changed/new files or throws. */
export async function aiAgentPatch(request, existingPlan, history = []) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/agent-patch`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ request, existingPlan, history }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Patch failed`)
  return data
}

/** Create a single named file using the streaming chat endpoint.
 * Returns { fileName, folder, content } or throws.
 * Uses the SSE /api/ai/chat route (proven reliable) rather than a dedicated route.
 */
/** Create a single named file.
 * For .pdf: generates a real binary PDF using jsPDF and returns a data URL.
 * For all others: two-step streaming approach (meta JSON + raw content).
 * Returns { fileName, folder, content } or throws.
 */
export async function aiCreateFile(request) {
  const ALLOWED_FOLDERS = ['Desktop', 'Documents', 'Pictures', 'Videos', 'Music']

  // ── Step 1: extract or invent filename + folder ────────────────────────────
  const explicitMatch = request.match(/\b([\w-]+\.(?:pdf|txt|md|json|csv|html|htm|css|js|ts|py|xml|yaml|yml|log|sh|bat|ini|toml|jsx|tsx|rb|java|cpp|c|h|php|sql|go|rs|swift|kt|dart|env))\b/i)
  const explicitName  = explicitMatch ? explicitMatch[1] : null

  const metaSystem = [
    'You are a file-naming assistant.',
    'Valid save folders: Desktop, Documents, Pictures, Videos, Music.',
    'INSTRUCTIONS:',
    '- Output ONLY raw JSON, nothing else. No prose, no fences.',
    '- Shape: {"fileName":"name.ext","folder":"Documents"}',
    explicitName
      ? `- The user explicitly requested the file be named "${explicitName}". Use that EXACT name in fileName.`
      : '- If no filename is given, invent a short descriptive snake_case name.',
    '- PDF is a supported format. Keep .pdf extension as-is.',
    '- CSV/JSON/XML/YAML/MD/TXT/HTML/PDF → Documents. Images → Pictures. Audio → Music. Code/scripts → Desktop.',
  ].join('\n')

  const metaFull = await aiChat([{ role: 'user', content: request }], metaSystem, null)

  const ms = metaFull.indexOf('{')
  let mDepth = 0, mEnd = -1
  if (ms !== -1) {
    for (let i = ms; i < metaFull.length; i++) {
      if (metaFull[i] === '{') mDepth++
      else if (metaFull[i] === '}') { mDepth--; if (mDepth === 0) { mEnd = i; break } }
    }
  }
  let meta = {}
  if (ms !== -1 && mEnd !== -1) {
    try { meta = JSON.parse(metaFull.slice(ms, mEnd + 1)) } catch { /* use defaults */ }
  }

  let fileName = explicitName || (meta.fileName || 'file.txt').trim()
  let folder   = meta.folder || 'Documents'
  if (!ALLOWED_FOLDERS.includes(folder)) folder = 'Documents'

  const ext = fileName.split('.').pop().toLowerCase()

  // ── PDF path: generate a real binary PDF with jsPDF ───────────────────────
  if (ext === 'pdf') {
    const contentSystem = [
      `Generate the text content for a PDF document named "${fileName}".`,
      'Output ONLY plain text. No markdown, no JSON, no code fences.',
      'First line should be the document title.',
      'CRITICAL: Include ONLY the exact data/text the user specified. Do NOT add filler or invented content.',
    ].join('\n')
    const rawText   = await aiChat([{ role: 'user', content: request }], contentSystem, null)
    const plainText = rawText.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```\s*$/, '').trim()

    const { jsPDF } = await import('jspdf')
    const doc      = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageW    = doc.internal.pageSize.getWidth()
    const pageH    = doc.internal.pageSize.getHeight()
    const margin   = 15
    const usableW  = pageW - margin * 2
    let   y        = margin
    let   firstLine = true

    for (const para of plainText.split('\n')) {
      if (para.trim() === '') { y += 3; continue }
      if (firstLine) {
        doc.setFontSize(16); doc.setFont('helvetica', 'bold')
        firstLine = false
      } else {
        doc.setFontSize(11); doc.setFont('helvetica', 'normal')
      }
      const lineH = firstLine ? 8 : 6
      const lines = doc.splitTextToSize(para.trim(), usableW)
      if (y + lines.length * lineH > pageH - margin) { doc.addPage(); y = margin }
      doc.text(lines, margin, y)
      y += lines.length * lineH + 2
    }

    return { fileName, folder, content: doc.output('datauristring') }
  }

  // ── All other formats: stream raw content ─────────────────────────────────
  const contentHint =
    ext === 'html' ? 'Produce a complete, well-styled HTML5 document with a <style> block for CSS. Do NOT use LaTeX. Include all requested data inside the HTML body.' :
    ext === 'csv'  ? 'Produce valid CSV. First line is the header row. Output ONLY the exact rows the user specified — do NOT add extra example rows, placeholder rows, or invented data.' :
    ext === 'json' ? 'Produce valid, pretty-printed JSON. Include only the exact data the user specified.' :
    ext === 'py'   ? 'Produce complete, runnable Python code.' :
    ext === 'md'   ? 'Produce formatted Markdown.' :
    'Produce complete content. Include only what the user explicitly asked for.'

  const contentSystem = [
    `Generate the complete content for a file named "${fileName}".`,
    'Output ONLY the raw file content. No explanations, no markdown code fences, no JSON wrapper.',
    'CRITICAL: Include ONLY the exact data the user specified. Do NOT invent, pad, or add extra rows/entries.',
    contentHint,
  ].join('\n')

  const raw      = await aiChat([{ role: 'user', content: request }], contentSystem, null)
  const stripped = raw.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```\s*$/, '').trim()

  return { fileName, folder, content: stripped }
}

/** Edit an existing file. Returns the updated content string or throws. */
export async function aiEditFile(existingContent, editInstruction, fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  const contentHint =
    ext === 'csv'  ? 'Output valid CSV (header row + data rows). Do NOT add commentary, notes, or explanatory text outside the CSV data.' :
    ext === 'json' ? 'Output valid JSON only. No explanation.' :
    ext === 'html' ? 'Output a complete HTML document only.' :
    'Output the complete updated file content only.'

  const system = [
    `You are a file editor. The user wants to modify "${fileName}".`,
    'Output ONLY the complete updated raw file content.',
    'Do NOT include any explanation, commentary, notes, or text outside the file content itself.',
    'Do NOT wrap output in markdown fences.',
    contentHint,
  ].join('\n')

  const userMsg = `Current file content:\n${existingContent}\n\nInstruction: ${editInstruction}`
  const raw = await aiChat([{ role: 'user', content: userMsg }], system, null)
  // Strip markdown fences and any trailing commentary lines (lines starting with * or # after file content)
  let out = raw.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```[\s\S]*$/, '').trim()
  // For CSV: remove any non-CSV lines (lines that contain words but no commas after the data starts)
  if (ext === 'csv') {
    const lines = out.split('\n')
    const csvLines = lines.filter((l, i) => i === 0 || l.includes(',') || l.trim() === '')
    out = csvLines.join('\n').trim()
  }
  return out
}

/** Generate a video. Returns { url } or throws. May take up to 120s (server polls). */
export async function aiVideo(prompt, duration = 8) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/video`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ prompt, duration }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Video generation failed')
  return data
}

/** Admin: set a user's AI token quota. */
export async function adminSetAiQuota(userId, tokens) {
  if (!_jwt) return
  const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}/ai-quota`, {
    method: 'PUT', headers: await _aiH(), body: JSON.stringify({ tokens }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  return res.json()
}

/** Generate music via Lyria (Gemini only). Returns { dataUrl } (audio/wav base64) or throws. */
export async function aiMusic(prompt) {
  if (!_jwt) throw new Error('Not authenticated')
  const res = await fetch(`${API}/ai/music`, {
    method:  'POST',
    headers: await _aiH(),
    body:    JSON.stringify({ prompt }),
  })
  const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Music generation failed')
  return data
}

// ── Email verification ────────────────────────────────────────────────────────

/** Verify email address with the 6-digit OTP received after registration.
 * Requires the pendingToken returned by /register (not a regular access token).
 * On success returns { ok, token, user, qp } to complete the session.
 */
export async function verifyEmailOtp(otp, pendingToken) {
  if (!pendingToken) return { error: 'Verification session missing. Please register again.' }
  try {
    const res = await fetch(`${API}/auth/verify-email`, {
      method:      'POST',
      credentials: 'include',   // receive the httpOnly refresh cookie on success
      headers:     { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
      body:        JSON.stringify({ otp }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Invalid code.' }
    return { ok: true, token: data.token, user: data.user, qp: data.qp }
  } catch { return { error: 'Cannot reach server.' } }
}

/** Re-send the email verification OTP.
 * Requires the same pendingToken — not a regular access token.
 */
export async function resendVerifyEmailOtp(pendingToken) {
  if (!pendingToken) return { error: 'Verification session missing. Please register again.' }
  try {
    const res = await fetch(`${API}/auth/verify-email/resend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Failed to send code.' }
    return { ok: true }
  } catch { return { error: 'Cannot reach server.' } }
}

// ── Two-factor authentication ─────────────────────────────────────────────────

/** Get 2FA status for the current user. */
export async function twoFaStatus() {
  if (!_jwt) return { enabled: false, hasEmail: false }
  try {
    const res = await fetch(`${API}/twofa/status`, { headers: _h() })
    if (!res.ok) return { enabled: false, hasEmail: false }
    return await res.json()
  } catch { return { enabled: false, hasEmail: false } }
}

/** Send a 6-digit OTP to the account email to begin enable/disable flow. */
export async function twoFaSendOtp(purpose) {
  if (!_jwt) return { error: 'Not authenticated.' }
  try {
    const res = await fetch(`${API}/twofa/send-otp`, {
      method:  'POST',
      headers: _h(),
      body:    JSON.stringify({ purpose }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Failed to send code.' }
    return { ok: true, expiresIn: data.expiresIn }
  } catch { return { error: 'Cannot reach server.' } }
}

/** Verify OTP and enable 2FA. */
export async function twoFaEnable(otp) {
  if (!_jwt) return { error: 'Not authenticated.' }
  try {
    const res = await fetch(`${API}/twofa/enable`, {
      method: 'POST', headers: _h(), body: JSON.stringify({ otp }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Invalid code.' }
    return { ok: true }
  } catch { return { error: 'Cannot reach server.' } }
}

/** Verify OTP and disable 2FA. */
export async function twoFaDisable(otp) {
  if (!_jwt) return { error: 'Not authenticated.' }
  try {
    const res = await fetch(`${API}/twofa/disable`, {
      method: 'POST', headers: _h(), body: JSON.stringify({ otp }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Invalid code.' }
    return { ok: true }
  } catch { return { error: 'Cannot reach server.' } }
}
