# Elyra — AI Technical Context

This document is written for an AI assistant (or a developer who prefers exhaustive documentation). It covers the full architecture, every API, the file system design, the state store, and important implementation decisions. Read this before touching any code.

---

## 1. What Is Elyra?

Elyra is a full-stack browser-based desktop operating system. Users log in and get a windowed desktop with draggable, resizable apps (Files, Notepad, Code Editor, Terminal, AI Assistant, Camera, Recorder, Video Player, Photo Viewer, Archive Manager, Music, App Center, Settings, Trash). The stack is:

- **Frontend:** React 18 + Vite 5 + Tailwind CSS + Zustand + framer-motion + react-rnd
- **Backend:** Express 5 (ESM) + PostgreSQL (via `pg`)
- **Auth:** bcryptjs password hashing + short-lived JWT access tokens (15 min) + httpOnly refresh cookie (7 days, token-rotation with reuse detection)
- **File storage:** Real UTF-8 / base64 files on disk at `server/storage/{userId}/{nodeId}`
- **Metadata:** PostgreSQL `user_data` table (JSONB key-value store per user)

The frontend runs on `:5173` (dev) and the backend on `:3001`. Vite proxies all `/api/*` calls to the backend so the browser only ever talks to one origin. In production both are served by the same Express process.

---

## 2. Directory Map

```
server/
  index.js          ← Express entry point
  db.js             ← PostgreSQL pool + schema bootstrap
  mailer.js         ← nodemailer wrapper; sendOtpEmail(), isSmtpConfigured()
  storage/          ← Per-user file content (runtime, gitignored)
    {userId}/
      {nodeId}      ← one file = one tree node's content
  routes/
    auth.js         ← /api/auth    — register (pending_reg flow), login, 2FA, verify-email, refresh, logout, me
    data.js         ← /api/data    — per-user JSON key-value store
    fs.js           ← /api/fs      — on-disk file content CRUD, quota, streaming upload
    admin.js        ← /api/admin   — user mgmt, quotas, AI quotas, system config
    ai.js           ← /api/ai      — chat, image, video, music, quota, agent
    chats.js        ← /api/chats   — AI chat history (account-scoped, cross-device)
    session.js      ← /api/session — SSE stream for server-push events
    proxy.js        ← /api/proxy   — URL proxy for iframe apps
    twofa.js        ← /api/twofa   — 2FA status, send OTP, enable, disable

src/
  config.js         ← Single source of truth: BRANDING, ACCENTS, WALLPAPERS,
                       STORAGE_KEYS, STORAGE_PREFIX, DND MIME types, AI defaults.
  main.jsx          ← ReactDOM.createRoot, Zustand init
  App.jsx           ← Root: renders <Desktop> when logged in, <LoginScreen> otherwise.
                       Also contains <NotificationToast> (quota error banner).
  index.css         ← Tailwind directives + custom keyframes (fadeInUp etc.)

  store/
    useStore.js     ← Main Zustand store. ALL FS operations, window management,
                       dock/desktop layout, clipboard, context menu, settings, notifications.
    useAuthStore.js ← Auth store: session restore, login, register, logout, admin ops,
                       SSE session watch, automatic token refresh scheduling.

  utils/
    db.js           ← API client. Wraps fetch() with JWT + one-time-pass headers.
                       Provides: dbGet/dbSet/dbDel, fsRead/fsWrite/fsDel/fsBulkDel/fsQuota,
                       fsRawUrl/fsUploadStream/fsCopy, refreshAccessToken,
                       aiChat/aiImage/aiVideo/aiMusic/aiAudio/aiQuota/aiSpend,
                       aiAgentPlan/aiAgentPatch/aiCreateFile/aiEditFile,
                       chatGetAll/chatPut/chatDel, adminSetQuota/adminGetUserDetail/
                       adminFreezeUser/adminRevokeTokens/adminSetAiQuota/adminChangePassword,
                       selfChangePassword.
    icons.jsx       ← App icon components
    welcomeContent.js ← Generates HTML content for the WelcomeApp
    termsAndConditions.js ← Terms sections displayed in LoginScreen

  hooks/
    useFileUpload.js ← Drag-and-drop / file picker upload hook

  workers/
    pyodide.worker.js ← Web Worker for in-browser Python execution (CodeEditor)

  apps/             ← One component per app. Each is opened in a <Window>.
    AIAssistant.jsx   # Chat UI — text, image, video, music, agent modes
    AppCenter.jsx     # App catalog browser
    ArchiveManager.jsx # ZIP viewer/extractor
    Browser.jsx       # In-app browser (iframe + URL bar)
    Calculator.jsx    # Basic calculator
    Calendar.jsx      # Event calendar with local persistence
    Camera.jsx        # Webcam photo/video capture
    CodeEditor.jsx    # Syntax-highlighted editor (Python runs via Pyodide)
    DocumentViewer.jsx # PDF / document viewer
    Files.jsx         # File manager
    IframeApp.jsx     # Wrapper for catalog iframe apps
    Music.jsx         # Music player
    Notepad.jsx       # Plain text editor
    Paint.jsx         # Canvas drawing app
    PhotoViewer.jsx   # Image viewer with zoom, rotate, flip
    Recorder.jsx      # Audio recorder
    Settings.jsx      # System settings + admin panel
    Terminal.jsx      # In-browser terminal (simulated)
    Trash.jsx         # Trash bin
    VideoPlayer.jsx   # Video playback (mp4, webm, ogg, mov)
    WelcomeApp.jsx    # First-run welcome screen
    renderApp.jsx     # Switch-case: appType → component

  components/       ← Shell chrome (Desktop, Dock, Window, WindowManager, etc.)
```

---

## 3. Database Schema

Three tables (plus migrations), all created idempotently in `server/db.js` on startup:

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- random uid() from the client
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,               -- bcrypt, cost 10
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quota_bytes   BIGINT NOT NULL DEFAULT 1073741824,  -- 1 GB
  -- Added via ALTER TABLE IF NOT EXISTS migrations:
  is_frozen          BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at      TIMESTAMPTZ,
  tokens_invalidated_at TIMESTAMPTZ,         -- revoking all sessions sets this
  last_active_at     TIMESTAMPTZ,
  first_name         TEXT,
  last_name          TEXT,
  email              TEXT,
  ai_quota_tokens    BIGINT NOT NULL DEFAULT 1000000,
  ai_used_tokens     BIGINT NOT NULL DEFAULT 0,
  ai_quota_renewed_at TIMESTAMPTZ,
  email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  two_fa_enabled     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS user_data (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,    -- currently only 'admin'
  value JSONB NOT NULL       -- { allowSignup: bool, allowGuest: bool }
);

-- Refresh token sessions (token-rotation with reuse detection)
CREATE TABLE IF NOT EXISTS refresh_sessions (
  id           TEXT PRIMARY KEY,       -- random session ID
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,   -- SHA-256(raw_token) — never store raw
  family_id    TEXT NOT NULL,          -- shared by all rotations of the same login
  expires_at   TIMESTAMPTZ NOT NULL,
  replaced     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-use request pass per AI call (anti-replay)
CREATE TABLE IF NOT EXISTS qp_pool (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qp_val     TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI chat histories (account-scoped, cross-device)
CREATE TABLE IF NOT EXISTS ai_chats (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  mode       TEXT NOT NULL DEFAULT 'text',
  messages   JSONB NOT NULL DEFAULT '[]',
  agent_plan JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

-- OTP codes for 2FA (enable/disable/login) — NOT used for signup verification
CREATE TABLE IF NOT EXISTS email_otps (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,  -- 'enable_2fa' | 'disable_2fa' | 'login_2fa'
  otp_hash   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending registrations — user is NOT inserted into users until OTP is verified
CREATE TABLE IF NOT EXISTS pending_registrations (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  otp_hash      TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Well-known `user_data` keys:**

| Key | Type | Description |
|-----|------|-------------|
| `{STORAGE_PREFIX}-fs` | FS tree object | File system tree metadata — **no content** (content is on disk) |
| `{STORAGE_PREFIX}-trash` | Array of nodes | Trashed nodes with `deletedAt` and `originalParentId` |
| `{STORAGE_PREFIX}-dock` | string[] | App IDs pinned to dock |
| `{STORAGE_PREFIX}-desktop` | string[] | App IDs shown on desktop |
| `{STORAGE_PREFIX}-settings` | object | Wallpaper, accent colour, transparency, dock prefs |
| `{STORAGE_PREFIX}-widgets` | Array | Desktop widgets config |
| `{STORAGE_PREFIX}-ai-config` | object | AI endpoint, model, API key |

---

## 4. API Reference

### Authentication — `/api/auth`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/api/auth/register` | — | `{ username, password, email?, firstName?, lastName? }` | If SMTP+email: `{ pendingToken, emailVerificationSent: true }` — no cookie, no JWT. Otherwise: `{ token, user, qp }` + refresh cookie. |
| POST | `/api/auth/verify-email` | `pending_reg` JWT | `{ otp }` | `{ ok, token, user, qp }` + refresh cookie. Creates user in DB only after OTP passes. |
| POST | `/api/auth/verify-email/resend` | `pending_reg` JWT | — | `{ ok }`. Regenerates OTP and resends. |
| POST | `/api/auth/login` | — | `{ username, password }` | If 2FA enabled: `{ twoFaPending: true, twoFaSessionId }`. Otherwise: `{ token, user, qp }` + refresh cookie. |
| POST | `/api/auth/login/verify-2fa` | — | `{ twoFaSessionId, otp }` | `{ token, user, qp }` + refresh cookie. |
| POST | `/api/auth/refresh` | cookie | — | `{ token, qp }` or 401; rotates refresh cookie |
| POST | `/api/auth/logout` | cookie | — | `{ ok: true }`; clears refresh cookie |
| GET | `/api/auth/me` | JWT | — | `{ id, username, isAdmin, emailVerified, twoFaEnabled, ... }` |
| PUT | `/api/auth/me/password` | JWT | `{ currentPassword, newPassword }` | `{ ok }` or 400/401 |
| DELETE | `/api/auth/me` | JWT | `{ password }` | `{ ok }` or 400 |
| GET | `/api/auth/config` | — | — | `{ allowSignup, allowGuest }` |

**`pending_reg` token:** A short-lived (30 min) JWT with `{ type: 'pending_reg', pendingId }`. It identifies a row in `pending_registrations`, **not** a user. `requireAuth` rejects it — it is only accepted by the `requirePendingEmail` middleware on `/verify-email` routes. The user is never inserted into the `users` table until the OTP is validated.

### Two-Factor Auth — `/api/twofa`

All routes require a standard JWT (`requireAuth`).

| Method | Path | Body | Returns |
|--------|------|---------|---------|
| GET | `/api/twofa/status` | — | `{ enabled, hasEmail, smtpConfigured }` |
| POST | `/api/twofa/send-otp` | `{ purpose: 'enable_2fa'\|'disable_2fa' }` | `{ ok }`. Sends OTP via email. |
| POST | `/api/twofa/enable` | `{ otp }` | `{ ok }`. Sets `two_fa_enabled=TRUE`. |
| POST | `/api/twofa/disable` | `{ otp }` | `{ ok }`. Sets `two_fa_enabled=FALSE`. |

**Token model:** Access tokens (`token`) are JWTs signed with `JWT_SECRET`, expiry **15 min** (configurable via `TOKEN_EXPIRY` env var). Refresh tokens are stored as SHA-256 hashes in `refresh_sessions` with a 7-day TTL, issued as an httpOnly `sameSite: lax` cookie. Refresh tokens rotate on every use; reuse of an already-rotated token invalidates the entire family. Access tokens are **never** written to `localStorage`.

**`requireAuth` middleware** (exported from `auth.js`, used by all other routes): reads `Authorization: Bearer <token>`, verifies it, checks `tokens_invalidated_at`, attaches `req.user = { id, username, isAdmin }`.

### User Data — `/api/data`

All routes require JWT.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data` | Returns all key-value pairs for the user as `{ key: value, ... }` |
| GET | `/api/data/:key` | Returns `{ value }` or 404 |
| PUT | `/api/data/:key` | Body: `{ value: <any JSON> }`. Upserts. Returns `{ ok: true }` |
| DELETE | `/api/data/:key` | Deletes key. Returns `{ ok: true }` |

### File System — `/api/fs`

All routes require JWT. Content is stored as raw UTF-8 strings (text files) or base64 data-URLs (images, videos, audio, binary).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fs/quota` | Returns `{ used: number, quota: number }` — bytes |
| GET | `/api/fs/content/:nodeId` | Returns `{ content: string }` or `{ content: '' }` if not found |
| PUT | `/api/fs/content/:nodeId` | Body: `{ content: string }`. Writes to disk. Returns `{ ok: true }` or **413** if quota exceeded |
| DELETE | `/api/fs/content/:nodeId` | Deletes file from disk. Returns `{ ok: true }` |
| POST | `/api/fs/bulk-delete` | Body: `{ nodeIds: string[] }`. Batch delete. Returns `{ ok: true }` |
| GET | `/api/fs/raw/:nodeId` | Streams raw bytes — safe for `<video src>`, `<audio src>`, `<img src>`. Accepts `?t=<jwt>&name=<filename>`. |
| POST | `/api/fs/copy/:sourceId` | Body: `{ destNodeId }`. Server-side binary copy — no JS heap involvement. |
| PUT | `/api/fs/stream/:nodeId` | Chunked streaming upload. Query: `?seq=<n>&total=<n>`. Header: `X-File-Size`. Accepts `application/octet-stream`. |

**IMPORTANT:** `/api/fs/content` has **no body size limit** (set to `Infinity` *before* the global 20 MB limit). This is intentional — quota is enforced per-user server-side.

**Security:** Node IDs are validated with `/^[a-zA-Z0-9_-]{1,32}$/` before any `path.join` call. This prevents path traversal attacks. User directories are fully isolated: `server/storage/{userId}/`.

**Quota enforcement (server):** `PUT /api/fs/content/:nodeId` calculates `used` by scanning `readdirSync(userDir)`, excluding the file being overwritten. If `used + newSize > quota`, responds with HTTP 413 and a human-readable JSON error.

**`calcUsed(userId)`:** Walks the user's storage directory and sums `statSync(f).size` for all files. No DB query needed — the ground truth is on disk.

### Admin — `/api/admin`

All routes require JWT **and** `is_admin = TRUE`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | Returns all users: `[{ id, username, isAdmin, createdAt, quotaBytes, isFrozen, ... }]` |
| DELETE | `/api/admin/users/:id` | Delete user (cannot delete self) |
| PUT | `/api/admin/users/:id/promote` | Set `is_admin = TRUE` |
| PUT | `/api/admin/users/:id/password` | Body: `{ password }`. Reset password + revoke sessions. |
| PUT | `/api/admin/users/:id/quota` | Body: `{ bytes: number }`. Min 1 MB. |
| PUT | `/api/admin/users/:id/ai-quota` | Body: `{ tokens: number }`. Set AI token quota. |
| PUT | `/api/admin/users/:id/freeze` | Body: `{ frozen: bool }`. Freeze / unfreeze account. |
| POST | `/api/admin/users/:id/revoke-tokens` | Invalidate all active sessions for a user. |
| GET | `/api/admin/users/:id/detail` | Returns disk storage breakdown + full user info. |
| GET | `/api/admin/config` | Returns `{ allowSignup, allowGuest }` |
| PUT | `/api/admin/config` | Body: `{ allowSignup, allowGuest }`. Updates `app_config`. |
| GET | `/api/admin/data/:userId` | View all `user_data` for any user. |

### AI — `/api/ai`

All routes require JWT + one-time-use request pass (`X-Nv-Qp` header).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/chat` | SSE streaming chat completion. Body: `{ messages, system }`. |
| POST | `/api/ai/image` | Image generation. Body: `{ prompt }`. Returns `{ dataUrl, revisedPrompt }`. |
| POST | `/api/ai/video` | Video generation (polls until ready). Body: `{ prompt, duration }`. Returns `{ url }`. |
| POST | `/api/ai/music` | Music generation. Body: `{ prompt }`. Returns `{ dataUrl }` (audio/wav). |
| POST | `/api/ai/audio` | Text-to-speech. Body: `{ text, voice, speed }`. Returns `{ dataUrl }` (audio/mpeg). |
| POST | `/api/ai/agent-plan` | Plan a project. Body: `{ request }`. Returns `{ projectName, todos, files }`. |
| POST | `/api/ai/agent-patch` | Patch an existing project. Body: `{ request, existingPlan, history }`. Returns `{ files }`. |
| GET | `/api/ai/quota` | Returns `{ used, quota, free }` in tokens for the current user. |
| POST | `/api/ai/spend` | Deduct credits for a local reply. Body: `{ inputChars, outputChars }`. |

### Chats — `/api/chats`

All routes require JWT.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chats` | Fetch all chats for the current user. |
| PUT | `/api/chats/:id` | Upsert a chat. Body: `{ title, mode, messages, agentPlan }`. |
| DELETE | `/api/chats/:id` | Delete a chat. |

---

## 5. Frontend API Client — `src/utils/db.js`

A module-level in-memory cache (`_cache: Map`) is populated by `dbInit()` on login. All reads (`dbGet`) are synchronous (no await needed). Writes (`dbSet`) update cache + `localStorage` immediately, then async-PUT to server via a serialized queue (so single-use passes are never double-consumed by concurrent calls).

```js
// Auth
setJWT(token)              // Store access token in module var only. NOT in localStorage.
getJWT()                   // Return current in-memory access token.
refreshAccessToken()       // async. Exchanges httpOnly refresh cookie for a new 15-min token.
setQp(val) / getQp()       // Manage the one-time-use AI request pass.
dbInit()                   // async. Fetches all /api/data into _cache. Falls back to localStorage.

// KV store
dbGet(key, def)            // sync. Returns cached value or `def`.
dbSet(key, value)          // sync-cache update + async PUT.
dbDel(key)                 // Remove from cache and server.

// Raw localStorage helpers (bypass cache — for session ID etc.)
rawGet(key) / rawSet(key, value) / rawDel(key)

// File system
fsRead(nodeId)             // GET /api/fs/content/:nodeId → string
fsWrite(nodeId, content)   // PUT /api/fs/content/:nodeId → { ok } | { error }
fsDel(nodeId)              // DELETE — fire and forget
fsBulkDel(nodeIds)         // POST /api/fs/bulk-delete — fire and forget
fsRawUrl(nodeId, name)     // Returns a URL for raw byte streaming (video/audio/image src)
fsUploadStream(nodeId, file, onProgress, signal)  // Chunked streaming upload, <=95 MB/chunk
fsCopy(sourceId, destNodeId)  // Server-side binary copy (no JS heap)
fsQuota()                  // GET /api/fs/quota → { used, quota }

// AI chats
chatGetAll()               // GET /api/chats → []
chatPut(chat)              // PUT /api/chats/:id — fire and forget, serialized queue
chatDel(id)                // DELETE /api/chats/:id — fire and forget, serialized queue

// AI generation
aiChat(messages, system, onDelta)   // SSE streaming chat → full text
aiImage(prompt)                     // → { dataUrl, revisedPrompt }
aiVideo(prompt, duration)           // → { url }
aiMusic(prompt)                     // → { dataUrl } (audio/wav)
aiAudio(text, voice, speed)         // → { dataUrl } (audio/mpeg)
aiAgentPlan(request)                // → { projectName, todos, files }
aiAgentPatch(request, plan, history) // → { files }
aiCreateFile(request)               // → { fileName, folder, content }
aiEditFile(content, instruction, name) // → updated content string
aiQuota()                           // → { used, quota, free }
aiSpend(inputChars, outputChars)    // Deduct credits for local reply

// Admin
adminSetQuota(userId, bytes)
adminGetUserDetail(userId)
adminFreezeUser(userId, frozen)
adminRevokeTokens(userId)
adminSetAiQuota(userId, tokens)
adminChangePassword(userId, password)
selfChangePassword(currentPassword, newPassword)
```

---

## 6. File System Design

### The Two-Layer Model

The file system is split into two orthogonal layers:

1. **Tree metadata** (`{STORAGE_PREFIX}-fs` in `user_data`): A recursive JSON object describing the folder/file hierarchy — names, IDs, types, timestamps, and `size` (byte count). **No actual file content.** This is what `useStore.fsRoot` holds.

2. **File content** (`server/storage/{userId}/{nodeId}`): The actual bytes of each file, stored as individual files on the server's disk. Content is fetched lazily on demand.

### Tree Node Schema

```js
// Folder node
{
  id: "abc123",            // random 8-char alphanumeric
  name: "Documents",
  type: "folder",
  updatedAt: "2025-01-...",
  children: [/* array of nodes */]
}

// File node
{
  id: "def456",
  name: "notes.txt",
  type: "file",
  updatedAt: "2025-01-...",
  size: 1024               // byte count of content (for display — set on write)
  // NO content field — content lives on disk
}
```

`size` is calculated via `new Blob([content]).size` which gives exact UTF-8 byte count. It is stored in the tree metadata for display purposes (file size in Files app) without needing to load file content.

### Special Nodes

- `"root"` — always the root folder node (id = `"root"`)
- `DESKTOP_FOLDER_ID = "desktop-files"` — the Desktop folder, always a direct child of root. Desktop file icons are shown on the desktop background.

### Lazy Loading Pattern

**Problem solved:** Loading all file content at login caused Out-of-Memory crashes for users with large files. There is NO `/api/fs/all` endpoint.

Instead:
1. `loadFile(id)` is called by each app when it opens a file.
2. If `_fileCache.has(id)` → returns immediately (synchronous read via `readFile(id)`).
3. Otherwise → fetches from server, populates cache, bumps `_fileCacheVersion`.
4. Apps that render file content subscribe to `_fileCacheVersion` so they re-render when the async load completes.

```js
// In any app component:
const _v = useStore(s => s._fileCacheVersion)  // triggers re-render on load
const readFile = useStore(s => s.readFile)
const loadFile = useStore(s => s.loadFile)

useEffect(() => {
  if (fileId) loadFile(fileId)
}, [fileId])

// Later in render:
const content = readFile(fileId)  // "" until loaded, then actual content
```

Failures are **not cached** — a retry after a server restart will succeed.

---

## 7. Main Store — `src/store/useStore.js`

### Module-level (not in Zustand state)

```js
const _fileCache = new Map()   // nodeId → string content. Lives outside Zustand.
```

Zustand state re-renders are triggered by `_fileCacheVersion` counter, not by putting content in the store (which would cause massive serialization).

### State Shape

```js
{
  // Windows
  windows: [],          // array of window objects
  zTop: 200,            // z-index ceiling

  // File system
  fsRoot: {},           // tree metadata (no content)
  trash: [],            // trashed nodes (with deletedAt, originalParentId)
  _fileCacheVersion: 0, // integer, bumped on every loadFile

  // UI
  clipboard: null,
  contextMenu: null,
  launcherOpen: false,
  notification: null,   // { message: string, id: string } — clears after 5s

  // Persisted (saved to server via dbSet)
  dockItems: [],
  desktopItems: [],
  settings: {},
  widgets: [],
  aiConfig: {},
}
```

### Window Object Schema

```js
{
  id: string,          // unique window instance id
  appId: string,       // logical app id (e.g. "files")
  appType: string,     // type string used by renderApp() (e.g. "files")
  title: string,
  context: object,     // app-specific: { fileId, folderId, etc. }
  x, y,               // position
  width, height,       // size
  zIndex: number,
  minimized: boolean,
  maximized: boolean,
  prevRect: object | null,  // saved rect before maximize
}
```

### Window Actions

| Action | Description |
|--------|-------------|
| `openWindow(appId, appType, title, context, defaultSize)` | Creates a new window. Deduplicates by appId. Singleton apps (files, ai, settings, trash, app-center) focus/toggle if already open. Returns window id. |
| `closeWindow(id)` | Removes from state. |
| `minimizeWindow(id)` | Sets `minimized: true`. |
| `restoreWindow(id)` | Clears `minimized`, bumps zIndex. |
| `focusWindow(id)` | Bumps zIndex. |
| `toggleMaximize(id)` | Saves current rect to `prevRect`, sets to full screen. Restores on second call. |
| `updateWindowPos/Size/Title(id, ...)` | In-place update. |
| `minimizeAll()` | Minimizes every window. |

### File System Actions

| Action | Sync? | Description |
|--------|-------|-------------|
| `readFile(id)` | sync | Returns `_fileCache.get(id) ?? ""`. Empty string if not yet loaded. |
| `loadFile(id)` | async | Fetches from server if not cached. Backfills `node.size` for legacy nodes. Bumps `_fileCacheVersion`. |
| `writeFile(id, content)` | sync+async | Updates cache immediately, fires async `fsWrite`. Rolls back cache on server error (413 or network failure). Shows notification on quota error. |
| `createNode(parentId, type, name, content)` | sync+async | Adds node to tree immediately. For files: writes content to disk async. Rolls back the entire node from tree + cache if server rejects. Returns node `id` (or rollback removes it, but id is already returned — caller should handle `null` case). |
| `deleteNode(id)` | sync | Removes from tree. Saves `originalParentId`. Adds to trash. **Does NOT delete from disk.** File still occupies quota. |
| `permanentDeleteNode(id)` | sync+async | Removes from tree + deletes disk file via `fsDel`. |
| `emptyTrash()` | sync+async | Clears all trash entries + deletes their disk files. |
| `copyNode(sourceId, targetFolderId)` | sync+async | Deep copies tree + writes all file content to new ids on disk. Rolls back individual files on server error. |
| `renameNode(id, newName)` | sync | Updates name + updatedAt in tree. Persists tree. |
| `moveNode(nodeId, targetFolderId)` | sync | Removes from current parent, adds to target. Persists tree. |
| `restoreFromTrash(id)` | sync | Restores to `originalParentId` if that folder still exists, else to `"root"`. |
| `listDir(folderId)` | sync | Returns `fsRoot.children` for that folder id. |

### `reinitForUser()`

Called by `useAuthStore` immediately after login/register. Sequence:
1. `await dbInit()` — re-fetches all user data from server, warms `_cache`
2. `_fileCache.clear()` — important: old user's content is wiped
3. Rebuilds state from freshly loaded data: `fsRoot`, `trash`, `dockItems`, `desktopItems`, `settings`, `widgets`, `aiConfig`
4. Resets `windows: []` and `clipboard: null`

**Do NOT call `fsLoadAll` here.** The OOM bug was caused by bulk-loading all file content at login. Content is loaded lazily per-file as apps open files.

### Trash System

- `deleteNode(id)` → node moved to `s.trash[]`, disk file kept
- Each trash entry has `originalParentId` (the folder it was in before deletion)
- `restoreFromTrash(id)` → restores to `originalParentId` if still in tree, else `"root"`
- `permanentDeleteNode` and `emptyTrash` are the only operations that call `fsDel`
- Trashed items **count toward storage quota** until permanently deleted

### Quota System

**Client-side quota tracking has been intentionally removed.** The server is the sole quota enforcer. The flow is:

1. Client calls `writeFile` or `createNode` with file content
2. Client optimistically updates cache and tree
3. `fsWrite` is called async in background
4. If server returns 413 (quota exceeded): rollback cache + tree, show notification toast
5. If network error: rollback cache + tree silently (no toast, will retry later)
6. `Settings → Storage` tab calls `fsQuota()` directly to display real usage

---

## 8. Auth Store — `src/store/useAuthStore.js`

```js
{
  currentUserId:      string | null,
  currentUsername:    string | null,
  currentUserIsAdmin: boolean,
  users: [],           // populated for admins
  adminConfig: { allowSignup: true, allowGuest: true },
  justRegistered: false,
  sessionLoading: true,  // true until initSession() completes on page load
  pendingToken: null,    // pending_reg JWT stored during email verification (no real session)
  twoFaSessionId: null,  // 2FA session ID stored during login 2FA step
}
```

**Actions:**
- `initSession()` → called automatically on module load. Calls `refreshAccessToken()` to silently restore session from httpOnly cookie. Calls `reinitForUser()` then `startSessionWatch()`. Sets `sessionLoading: false` when done.
- `login(username, password)` → POST. If response has `twoFaPending: true`, stores `twoFaSessionId` and returns `{ success: false, twoFaPending: true }`. Otherwise calls `reinitForUser()` and `startSessionWatch()`.
- `loginWith2fa(otp)` → Posts `{ twoFaSessionId, otp }` to `/auth/login/verify-2fa`. Completes session on success.
- `register(username, password, ...)` → If response has `emailVerificationSent: true`, stores `pendingToken` only (no session created). Returns `{ success: true, emailVerificationSent: true }`. Otherwise completes session immediately.
- `completeEmailVerification(token, user, qp)` → Called after OTP verified. Calls `setJWT(token)`, schedules refresh, sets Zustand state, starts session watch. This is the point at which the session begins.
- `loginGuest()` → no JWT. Stores `guest-<random>` in sessionStorage. `reinitForUser()` runs in memory-only mode.
- `logout()` → calls `POST /api/auth/logout` to clear the httpOnly cookie. Clears in-memory JWT. Reloads the page.
- `fetchUsers()` → `GET /api/admin/users` (admin only)
- `fetchAdminConfig()` → `GET /api/auth/config` (public)
- `promoteUser(id)`, `deleteUser(id)`, `setUserQuota(id, bytes)`, `freezeUser(id, frozen)`, `revokeUserTokens(id)` — admin actions
- `selfDeleteAccount(password)` → `DELETE /api/auth/me`. Calls `logout()` on success.
- `startSessionWatch()` / `stopSessionWatch()` → manages the SSE connection to `/api/session/events` for real-time `logout` and `catalog-update` events.

**JWT lifecycle:**
- Access token is **15 min**, stored only in the `db.js` module-level variable `_jwt`. Never in `localStorage`.
- Refresh token is **7 days**, stored server-side (hashed) and delivered as an httpOnly `sameSite: lax` cookie.
- On page reload: `initSession()` calls `refreshAccessToken()` which POSTs to `/api/auth/refresh` — the browser sends the cookie automatically. No `localStorage` read needed.
- Refresh tokens rotate on every use (token rotation). If a token is reused after rotation (reuse attack), the entire family is revoked — all devices for that user are logged out.
- `scheduleRefresh(token)` is called after login/refresh. It sets a `setTimeout` to fire 2 min before the access token expires and silently calls `refreshAccessToken()`, keeping the session alive indefinitely without user interaction.
- `tokens_invalidated_at` on the `users` row is checked by `requireAuth` middleware — admin revoke-all-sessions sets this, immediately invalidating all current access tokens.

**Guest mode:**
- No JWT. `dbSet` / `fsWrite` calls skip server writes silently.
- All data lives in-memory only (`_cache` Map, `_fileCache` Map, Zustand state).
- On guest → login, `reinitForUser()` is called which wipes all in-memory state and loads server data.

---

## 9. App Rendering

`src/apps/renderApp.jsx` is a switch-case that maps `window.appType` → React component. Each app receives `{ windowId, context }` as props.

The `context` object is app-specific:
- Files: `{ folderId }` — opens Files at a specific folder
- Notepad/CodeEditor: `{ fileId, folderId }` — opens a specific file
- VideoPlayer/PhotoViewer: `{ fileId }` — plays a specific media file
- IframeApp (catalog apps): `{ url, title }`

### App Components — Expected Patterns

**Opening a file in an app:**
```jsx
const { loadFile, readFile, _fileCacheVersion } = useStore(s => ({
  loadFile: s.loadFile, readFile: s.readFile, _fileCacheVersion: s._fileCacheVersion
}))

useEffect(() => {
  if (context?.fileId) loadFile(context.fileId)
}, [context?.fileId])

// In render — _fileCacheVersion subscription ensures re-render after async load
const content = readFile(context?.fileId ?? '')
```

**Saving a file:**
```jsx
const writeFile = useStore(s => s.writeFile)
writeFile(fileId, newContent)  // optimistic + async, handles 413 internally
```

**Creating a file:**
```jsx
const createNode = useStore(s => s.createNode)
const id = createNode(parentFolderId, "file", "untitled.txt", "")
// 'id' is returned immediately, but disk write is async
// If quota exceeded: node will be rolled back and toast shown
```

---

## 10. App Catalog (App Center)

`public/apps/catalog.json` — a static JSON array, fetched by `AppCenter.jsx`. No auth required.

```json
[
  {
    "name": "App Name",
    "description": "...",
    "url": "https://...",
    "allowIframe": true,
    "tags": ["productivity"]
  }
]
```

When opened, `allowIframe: true` apps render in `IframeApp.jsx` inside an Elyra window.
`allowIframe: false` apps open in a new browser tab.

---

## 11. Settings App

`src/apps/Settings.jsx` — tabbed settings UI:

| Tab | Contents |
|-----|----------|
| Appearance | Wallpaper picker, accent colour, transparency toggle |
| Dock | Dock size, magnification, auto-hide |
| Desktop | Desktop items management |
| Storage | Quota progress bar (calls `fsQuota()` on mount). For non-guest users only. |
| Account | Change password; 2FA section (shown only when SMTP is configured and user has an email) |
| About | System info |
| Admin | (admin users only) Per-user quota editor, promote/delete users, toggle signup/guest |

---

## 12. Component Architecture

### Shell Layer

```
App.jsx
  ├── LoginScreen.jsx          ← shown when not logged in
  └── Desktop.jsx              ← shown when logged in
        ├── QuickBar.jsx       ← top bar, clock, system tray
        ├── Widgets.jsx        ← desktop widgets (draggable)
        ├── Desktop icons      ← rendered from desktopItems array
        ├── WindowManager.jsx  ← maps windows[] → <Window> + renderApp()
        ├── Dock.jsx           ← bottom dock
        ├── StartMenu.jsx      ← launcher overlay
        └── ContextMenu.jsx    ← right-click overlay
```

### Window.jsx

Wraps `react-rnd` for drag + resize. Key props: `window` object from store. Calls `focusWindow` on mousedown. Title bar buttons: close, minimize, maximize. On mobile: full-screen mode, no drag.

### WindowManager.jsx

Renders one `<Window>` per entry in `useStore.windows`. Passes `context` down to the app component via `renderApp()`.

---

## 13. Known Edge Cases and Decisions

**Why no bulk file-content loading at login?**
Previously there was a `/api/fs/all` endpoint. It caused Node.js OOM when a user had large media files — `JSON.stringify` of a 800 MB payload killed the process. The endpoint was removed in favour of lazy per-file loading. A `fsLoadAll()` function remains in `db.js` as a dead stub; do not use or restore it.

**Why is `_fileCache` a module-level Map and not Zustand state?**
Putting large strings (base64 video, audio) into Zustand would cause massive re-renders and serialize/deserialize overhead. The Map is deliberately outside Zustand; `_fileCacheVersion` is the only store primitive that triggers re-renders.

**Why does `deleteNode` NOT delete the disk file?**
To preserve trash semantics: trashed items should still count toward quota (giving users a consistent storage picture) and remain recoverable until explicitly emptied. `permanentDeleteNode` and `emptyTrash` are the only operations that call `fsDel`.

**Why no client-side quota tracking?**
It inevitably diverged from reality (server restarts, multiple sessions, admin changes, direct DB edits). The server recalculates on every write by scanning the directory — always accurate.

**`copyNode` content source:**
Uses `_fileCache.get(n.id) ?? ""`. If the source file hasn't been loaded yet (not yet opened by user), the copy will be empty. To avoid this, Files.jsx calls `loadFile` before initiating a copy operation.

**Rollback on `createNode` — returned ID is still "used":**
`createNode` returns the ID immediately (before the async disk write). If the write fails and rollback occurs, the ID is gone from the tree. The caller may hold a stale ID. Safe pattern: call `findNode(fsRoot, id)` to confirm existence before using the returned ID for operations.

**CORS:** Express allows `http://localhost:5173`, `http://localhost:4173`, and `process.env.FRONTEND_ORIGIN`. The `credentials: true` flag is set. Vite dev server proxies `/api` so browsers never make cross-origin requests in dev.

---

## 14. Extending the OS — Patterns for New Apps

### 1. Create the component

Create `src/apps/MyApp.jsx`. Receive `{ windowId, context }` as props.

### 2. Register in renderApp

In `src/apps/renderApp.jsx`, add a case:
```js
case 'my-app': return <MyApp windowId={windowId} context={context} />
```

### 3. Register in SYSTEM_APPS

In `src/store/useStore.js`, add to `SYSTEM_APPS`:
```js
myapp: { id: "myapp", title: "My App", type: "my-app", gradient: "from-..." }
```

### 4. Add an icon

In `src/utils/icons.jsx`, add an icon case for `"myapp"`.

### 5. Open the app

```js
const openWindow = useStore(s => s.openWindow)
openWindow("myapp", "my-app", "My App", { /* context */ }, { width: 700, height: 500 })
```

### If the app needs to read/write files:

Follow the lazy loading pattern (section 9). Always use `loadFile` before `readFile`.

---

## 15. Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | No | `postgresql://localhost/elyra_db` | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** (prod) | — | JWT signing secret. Use 64+ random bytes. |
| `PORT` | No | `3001` | Express listen port |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173` | CORS allowed origin for the frontend |
| `NODE_ENV` | No | — | Set to `production` to serve `dist/` from Express || `SMTP_HOST` | No | `smtp.service.com` | SMTP server hostname |
| `SMTP_PORT` | No | `465` | SMTP port (465 = SSL, 587 = STARTTLS) |
| `SMTP_SECURE` | No | `true` | `true` for port 465 SSL, `false` for STARTTLS |
| `SMTP_USER` | No | — | SMTP login (usually the full from-address) |
| `SMTP_PASS` | No | — | SMTP password. **Quote in `.env` if it contains `#`** e.g. `SMTP_PASS="p@ss#1"` |
| `SMTP_FROM` | No | — | Friendly from address e.g. `Elyra <support@example.com>` |
| `OTP_EXPIRY_MINUTES` | No | `10` | How long OTP codes remain valid |

**SMTP is optional.** When `SMTP_USER`/`SMTP_PASS` are not set, `isSmtpConfigured()` returns false. Registration falls back to direct account creation (no email verification), and 2FA cannot be enabled. OTPs are logged to the server console for development.
---

## 16. Build and Deployment

**Development:**
```bash
npm run dev:full     # concurrently: node --watch server/index.js + vite
```

**Production:**
```bash
npm run build        # vite build → dist/
NODE_ENV=production npm run server   # serves dist/ + API on PORT
```

In production, Express serves `dist/` as static files and returns `dist/index.html` for any non-API route (SPA fallback).

**Storage directory:** `server/storage/` is created at runtime by `mkdirSync(..., { recursive: true })`. It is not committed to git. Back it up if self-hosting.

---

## 17. Security Notes

- **Path traversal:** Node IDs are validated with `/^[a-zA-Z0-9_-]{1,32}$/` before any filesystem operation.
- **User isolation:** Storage dirs are `server/storage/{userId}/` — no cross-user access is possible at the API layer.
- **JWT verification:** `requireAuth` middleware rejects expired/invalid tokens with 401.
- **Admin check:** All `/api/admin` routes verify `req.user.isAdmin === true` in addition to JWT.
- **Password hashing:** bcrypt cost factor 10.
- **No SQL injection risk:** All DB queries use parameterized placeholders (`$1`, `$2`).
- **CORS credentials:** Only whitelisted origins receive cookies/auth headers.
- **No body size abuse:** The global limit is 20 MB. Only `/api/fs/content` is unlimited (by design — user-uploaded media). Quota is enforced per-user server-side.
