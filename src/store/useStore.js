import { create } from "zustand"
import { dbGet, dbSet, dbInit, fsWrite, fsDel, fsRead, fsCopy, getJWT, getQp, setQp } from '../utils/db'
import {
  DEFAULT_DOCK, DEFAULT_DESKTOP,
  DEFAULT_WINDOW_SIZE, STORAGE_KEYS,
} from '../config.js'

const uid = () => Math.random().toString(36).slice(2, 10)
const WINDOW_CLOSE_DELAY_MS = 180

// ── Tree helpers ──────────────────────────────────────────────────────────────
function mapNode(node, id, fn) {
  if (node.id === id) return fn(node)
  if (!node.children) return node
  return { ...node, children: node.children.map(c => mapNode(c, id, fn)) }
}
function removeNode(root, id) {
  if (!root.children) return [root, null]
  const idx = root.children.findIndex(c => c.id === id)
  if (idx >= 0) {
    const removed = root.children[idx]
    return [{ ...root, children: root.children.filter(c => c.id !== id) }, removed]
  }
  let found = null
  const newChildren = root.children.map(c => {
    if (found) return c
    const [nc, r] = removeNode(c, id)
    if (r) found = r
    return nc
  })
  return [{ ...root, children: newChildren }, found]
}
export function findNode(node, id) {
  if (node.id === id) return node
  if (!node.children) return null
  for (const c of node.children) { const f = findNode(c, id); if (f) return f }
  return null
}

export const DESKTOP_FOLDER_ID = "desktop-files"
export const SYSTEM_FOLDER_NAMES = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'Projects']
const SYSTEM_FOLDER_SET = new Set(SYSTEM_FOLDER_NAMES)

function deepCopyNode(node) {
  const newId = uid()
  if (node.type === "file") {
    return { ...node, id: newId, name: "Copy of " + node.name, updatedAt: new Date().toISOString() }
  }
  return { ...node, id: newId, updatedAt: new Date().toISOString(), children: (node.children || []).map(deepCopyNode) }
}

// ── FS ────────────────────────────────────────────────────────────────────────
// Strip content from tree nodes before saving to DB — content lives on disk.
function stripContent(node) {
  if (node.type === 'file') { const { content: _c, ...rest } = node; return rest }
  return { ...node, children: (node.children || []).map(stripContent) }
}
// Collect all file node IDs in a subtree (for bulk disk deletes)
function collectFileIds(node, out = []) {
  if (node.type === 'file') out.push(node.id)
  for (const c of (node.children || [])) collectFileIds(c, out)
  return out
}
const initialFs = {
  id: "root", name: "Home", type: "folder", updatedAt: new Date().toISOString(),
  children: [
    { id: DESKTOP_FOLDER_ID, name: "Desktop", type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Documents", type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Downloads", type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Pictures",  type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Videos",    type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Music",     type: "folder", updatedAt: new Date().toISOString(), children: [] },
    { id: uid(), name: "Projects",  type: "folder", updatedAt: new Date().toISOString(), children: [] },
  ],
}

// ── Default dock / desktop apps ───────────────────────────────────────────────
export const SYSTEM_APPS = {
  launcher:    { id: "launcher",    title: "Launcher",      type: "launcher",     gradient: "from-indigo-500 to-violet-600" },  // OS brand purple
  files:       { id: "files",       title: "My Files",      type: "files",        gradient: "from-amber-400 to-orange-500" },  // warm folder gold
  notes:       { id: "notes",       title: "Notepad",       type: "notes",        gradient: "from-yellow-400 to-lime-500" },   // sticky note yellow-lime
  terminal:    { id: "terminal",    title: "Terminal",      type: "terminal",     gradient: "from-neutral-800 to-black" },     // pure black terminal
  ai:          { id: "ai",          title: "AI Assistant",  type: "ai",           gradient: "from-purple-500 to-blue-700" },   // mystical purple → tech blue
  appcenter:   { id: "appcenter",   title: "App Center",    type: "app-center",   gradient: "from-pink-500 to-rose-700" },     // marketplace pink
  settings:    { id: "settings",    title: "Settings",      type: "settings",     gradient: "from-blue-600 to-slate-800" },    // professional blue → dark
  codeeditor:  { id: "codeeditor",  title: "Code Editor",   type: "code-editor",  gradient: "from-cyan-500 to-indigo-700" },   // IDE cyan → deep indigo
  camera:      { id: "camera",      title: "Camera",        type: "camera",       gradient: "from-sky-500 to-teal-700" },      // bright sky-teal like a clear photo
  recorder:    { id: "recorder",    title: "Recorder",      type: "recorder",     gradient: "from-red-500 to-red-800" },       // solid deep red (record button)
  trash:       { id: "trash",       title: "Trash",         type: "trash",        gradient: "from-gray-400 to-gray-700" },     // flat neutral gray
  photoviewer: { id: "photoviewer", title: "Photo Viewer",   type: "photo-viewer", gradient: "from-violet-400 to-pink-600" },  // artistic gallery violet-pink
  videoplayer: { id: "videoplayer", title: "Video Player",   type: "video-player", gradient: "from-stone-600 to-red-900" },    // cinema dark stone → deep red
  music:          { id: "music",          title: "Music",           type: "music",           gradient: "from-fuchsia-500 to-purple-800" }, // vibrant fuchsia-purple
  archivemanager: { id: "archivemanager", title: "Archive Manager", type: "archive-manager", gradient: "from-green-600 to-emerald-800" },  // compressed deep green
  browser:        { id: "browser",        title: "Browser",         type: "browser",         gradient: "from-sky-400 to-blue-600" },        // web sky blue
  calculator:     { id: "calculator",     title: "Calculator",      type: "calculator",      gradient: "from-rose-400 to-violet-700" },      // rose → violet
  paint:          { id: "paint",          title: "Paint",           type: "paint",           gradient: "from-orange-400 to-rose-600" },      // warm art palette
  docviewer:      { id: "docviewer",      title: "Doc Viewer",      type: "doc-viewer",      gradient: "from-teal-500 to-cyan-700" },        // clean document teal
  calendar:       { id: "calendar",       title: "Calendar",        type: "calendar",        gradient: "from-emerald-400 to-indigo-500" },   // fresh → scheduling indigo
}
export const TRASH_APP = SYSTEM_APPS.trash

// Keys are NOT user-scoped here — the server scopes by JWT user_id automatically.
// Guest sessions have no JWT so dbSet is a no-op; data lives only in-memory.
const loadFromLS = (key, def) => dbGet(key, def)
const saveToLS   = (key, value) => dbSet(key, value)

// DEFAULT_DOCK, DEFAULT_DESKTOP, DEFAULT_SETTINGS, DEFAULT_AI_CONFIG imported from config.js

// Builds (or re-builds) the initial FS, migrating old data if needed.
// Strips content from any legacy nodes that still have it embedded.
function _buildInitFs() {
  const raw = loadFromLS(STORAGE_KEYS.fs, initialFs)
  const clean = stripContent(raw)
  // Ensure Desktop folder exists
  let fs = findNode(clean, DESKTOP_FOLDER_ID)
    ? clean
    : { ...clean, children: [...(clean.children || []), { id: DESKTOP_FOLDER_ID, name: 'Desktop', type: 'folder', updatedAt: new Date().toISOString(), children: [] }] }
  // Respawn any other system folders that were accidentally deleted
  const existingNames = new Set((fs.children || []).map(n => n.name))
  const missing = SYSTEM_FOLDER_NAMES.filter(n => n !== 'Desktop' && !existingNames.has(n))
  if (missing.length) {
    fs = { ...fs, children: [...fs.children, ...missing.map(n => ({ id: uid(), name: n, type: 'folder', updatedAt: new Date().toISOString(), children: [] }))] }
  }
  return fs
}
const _initFs = _buildInitFs()

// In-memory content cache:  nodeId → string content
// Populated lazily on first open; kept in sync on every write.
const _fileCache = new Map()
function _saveFsTree(fsRoot) { saveToLS(STORAGE_KEYS.fs, stripContent(fsRoot)) }

// Exact UTF-8 byte count — used for node.size metadata in the tree
function _byteSize(content) { return new Blob([content ?? '']).size }

const DEFAULT_SETTINGS = {
  wallpaperPreset: 0, accentColor: "violet", transparency: true,
  dockSize: 52, dockMagnification: true, dockAutoHide: false, showClock: true,
  titlebarButtonsRight: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  customWallpaper: null,
  quickbarPosition: "right",
}

// ── Store ─────────────────────────────────────────────────────────────────────
// Returns a name that doesn't conflict with existing siblings, e.g. "New Folder (2)"
function uniqueName(siblings, desiredName) {
  const names = new Set((siblings || []).map(n => n.name))
  if (!names.has(desiredName)) return desiredName
  // Split into base + ext  e.g. "index.html" -> ["index", "html"]
  const dotIdx = desiredName.lastIndexOf('.')
  const hasExt = dotIdx > 0
  const base = hasExt ? desiredName.slice(0, dotIdx) : desiredName
  const ext  = hasExt ? desiredName.slice(dotIdx) : ''
  // Strip existing counter like "New Folder (2)" -> "New Folder"
  const stripped = base.replace(/ \(\d+\)$/, '')
  let i = 2
  while (names.has(`${stripped} (${i})${ext}`)) i++
  return `${stripped} (${i})${ext}`
}

export const useStore = create((set, get) => ({

  // Windows
  windows: [], zTop: 200,
  openWindow(appId, appType, title, context = {}, defaultSize = {}) {
    const state = get()
    // Deduplicate: if a window with the same appId already exists, focus it
    const existingById = state.windows.find(w => w.appId === appId)
    if (existingById) {
      if (existingById.minimized) { get().restoreWindow(existingById.id); return existingById.id }
      get().focusWindow(existingById.id); return existingById.id
    }
    const singletons = ["app-center","ai","trash","settings"]
    if (singletons.includes(appType)) {
      const ex = state.windows.find(w => w.appType === appType)
      if (ex) {
        if (ex.minimized) { get().restoreWindow(ex.id); return ex.id }
        // If already focused/visible — minimize it (toggle behaviour)
        const isTopmost = ex.zIndex === state.zTop
        if (isTopmost) { get().minimizeWindow(ex.id); return ex.id }
        get().focusWindow(ex.id); return ex.id
      }
    }
    const id = uid()
    const w = defaultSize.width || DEFAULT_WINDOW_SIZE.width, h = defaultSize.height || DEFAULT_WINDOW_SIZE.height
    const cascade = state.windows.length * 22
    const x = Math.max(60, (window.innerWidth - w) / 2 + cascade)
    const y = Math.max(40, (window.innerHeight - h) / 3 + cascade)
    set(s => ({ windows: [...s.windows, { id, appId, appType, title, context, x, y, width: w, height: h, zIndex: s.zTop + 1, minimized: false, maximized: false, prevRect: null }], zTop: s.zTop + 1 }))
    return id
  },
  closeWindow(id) { set(s => ({ windows: s.windows.filter(w => w.id !== id) })) },
  requestWindowClose(id) {
    const win = get().windows.find(w => w.id === id)
    if (!win || win.closing) return
    set(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, closing: true } : w) }))
    setTimeout(() => get().closeWindow(id), WINDOW_CLOSE_DELAY_MS)
  },
  minimizeWindow(id) { set(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, minimized: true } : w) })) },
  minimizeAll() { set(s => ({ windows: s.windows.map(w => ({ ...w, minimized: true })) })) },

  // Re-fetch the FS tree from the server and update the in-memory store.
  // Useful when another tab or external process may have modified the tree.
  async reloadFs() {
    await dbInit()
    // dbInit() fills _cache from the server — read via dbGet (not loadFromLS
    // which only reads stale localStorage copies).
    const freshFs    = dbGet(STORAGE_KEYS.fs,    null)
    const freshTrash = dbGet(STORAGE_KEYS.trash, null)
    set({
      ...(freshFs    ? { fsRoot: stripContent(freshFs) } : {}),
      ...(freshTrash ? { trash:  freshTrash            } : {}),
    })
  },

  // Reinitialise per-user state after a login/switch (called from AuthStore after login)
  async reinitForUser() {
    await dbInit()
    _fileCache.clear()
    // Merge settings + customWallpaper (stored separately to avoid localStorage overflow)
    const savedSettings = loadFromLS(STORAGE_KEYS.settings, {})
    const customWallpaper = loadFromLS(STORAGE_KEYS.wallpaper, null)
    set({
      fsRoot:       _buildInitFs(),
      trash:        loadFromLS(STORAGE_KEYS.trash, []),
      dockItems:    loadFromLS(STORAGE_KEYS.dock,    DEFAULT_DOCK),
      desktopItems: loadFromLS(STORAGE_KEYS.desktop, DEFAULT_DESKTOP),
      settings:     { ...DEFAULT_SETTINGS, ...savedSettings, customWallpaper },
      widgets:      loadFromLS(STORAGE_KEYS.widgets,  []),
      aiConfig:     {},
      recentApps:   loadFromLS(STORAGE_KEYS.recentApps, []),
      windows: [], clipboard: null,
    })
  },
  restoreWindow(id) { set(s => ({ zTop: s.zTop + 1, windows: s.windows.map(w => w.id === id ? { ...w, minimized: false, zIndex: s.zTop + 1 } : w) })) },
  focusWindow(id) { set(s => ({ zTop: s.zTop + 1, windows: s.windows.map(w => w.id === id ? { ...w, zIndex: s.zTop + 1 } : w) })) },
  toggleMaximize(id) {
    set(s => {
      const win = s.windows.find(w => w.id === id); if (!win) return {}
      if (win.maximized) return { windows: s.windows.map(w => w.id === id ? { ...w, maximized: false, ...(w.prevRect || {}), prevRect: null } : w) }
      return { windows: s.windows.map(w => w.id === id ? { ...w, maximized: true, prevRect: { x: w.x, y: w.y, width: w.width, height: w.height }, x: 0, y: 0, width: window.innerWidth, height: window.innerHeight - 80 } : w) }
    })
  },
  updateWindowPos(id, x, y) { set(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, x, y } : w) })) },
  updateWindowSize(id, width, height) { set(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, width, height } : w) })) },
  updateWindowTitle(id, title) { set(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, title } : w) })) },

  // Filesystem
  fsRoot: _initFs, trash: loadFromLS(STORAGE_KEYS.trash, []),
  // Version counter: bumped whenever a file is loaded into cache so render-time readFile calls re-run
  _fileCacheVersion: 0,
  listDir(folderId) { return findNode(get().fsRoot, folderId)?.children || [] },
  readFile(id) { return _fileCache.has(id) ? _fileCache.get(id) : null },
  // Async: loads a file from disk into _fileCache if not already there, then bumps version.
  // Backfills node.size for legacy nodes that were created before size tracking was added.
  // Does NOT cache failures — so a retry after a server restart will succeed.
  async loadFile(id) {
    if (_fileCache.has(id)) return _fileCache.get(id)
    try {
      const content = await fsRead(id)  // fsRead returns the string directly
      _fileCache.set(id, content)
      set(s => {
        const node = findNode(s.fsRoot, id)
        if (node && !node.size && content) {
          // Backfill missing size for legacy nodes
          const fsRoot = mapNode(s.fsRoot, id, n => ({ ...n, size: _byteSize(content) }))
          _saveFsTree(fsRoot)
          return { fsRoot, _fileCacheVersion: s._fileCacheVersion + 1 }
        }
        return { _fileCacheVersion: s._fileCacheVersion + 1 }
      })
      return content
    } catch {
      // Do NOT cache this — allow retries after server restart
      return ''
    }
  },
  // writeFile: update cache + persist to disk. Server is the ONLY quota enforcer.
  // On server rejection (413 quota or network error): rollback cache silently.
  writeFile(id, content) {
    const newSize    = _byteSize(content)
    const prevContent = _fileCache.get(id)
    _fileCache.set(id, content)
    const rollbackCache = () => {
      if (prevContent !== undefined) _fileCache.set(id, prevContent); else _fileCache.delete(id)
    }
    fsWrite(id, content).then(r => {
      if (r?.error) {
        rollbackCache()
        set({ notification: { message: r.error, id: uid() } })
      }
    }).catch(() => rollbackCache())
    set(s => {
      const fsRoot = mapNode(s.fsRoot, id, n => ({ ...n, updatedAt: new Date().toISOString(), size: newSize }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
  },
  createNode(parentId, type, name, content = "") {
    const id = uid()
    const sibs = findNode(get().fsRoot, parentId)?.children || []
    const finalName = uniqueName(sibs, name)
    const node = type === "folder"
      ? { id, name: finalName, type, updatedAt: new Date().toISOString(), children: [] }
      : { id, name: finalName, type, updatedAt: new Date().toISOString(), size: _byteSize(content) }
    if (type === "file") {
      _fileCache.set(id, content)
      // Rollback tree+cache if the server rejects (quota exceeded → 413, or network error)
      const rollback = (msg) => {
        _fileCache.delete(id)
        set(s => {
          const [newRoot] = removeNode(s.fsRoot, id)
          _saveFsTree(newRoot)
          return { fsRoot: newRoot, ...(msg ? { notification: { message: msg, id: uid() } } : {}) }
        })
      }
      fsWrite(id, content)
        .then(r => { if (r?.error) rollback(r.error) })
        .catch(() => rollback(null))
    }
    set(s => {
      const fsRoot = mapNode(s.fsRoot, parentId, p => ({ ...p, updatedAt: new Date().toISOString(), children: [...(p.children || []), node] }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
    return id
  },
  // Creates a tree-only node without writing content to the server.
  // Used when content is uploaded separately (e.g., streaming large files).
  // Size starts at 0; call updateNodeSize(id, bytes) once upload completes.
  createNodeEntry(parentId, name) {
    const id = uid()
    const sibs = findNode(get().fsRoot, parentId)?.children || []
    const finalName = uniqueName(sibs, name)
    const node = { id, name: finalName, type: 'file', updatedAt: new Date().toISOString(), size: 0 }
    set(s => {
      const fsRoot = mapNode(s.fsRoot, parentId, p => ({ ...p, updatedAt: new Date().toISOString(), children: [...(p.children || []), node] }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
    return id
  },

  // Update stored file size + last-modified timestamp after a streaming upload completes.
  updateNodeSize(id, bytes) {
    set(s => {
      const fsRoot = mapNode(s.fsRoot, id, n => ({ ...n, size: bytes, updatedAt: new Date().toISOString() }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
  },

  deleteNode(id) {
    set(s => {
      // Find the parent so we can restore to the exact same location later
      const findParent = (node, targetId) => {
        if (!node.children) return null
        if (node.children.some(c => c.id === targetId)) return node.id
        for (const c of node.children) { const p = findParent(c, targetId); if (p) return p }
        return null
      }
      const originalParentId = findParent(s.fsRoot, id) ?? "root"
      // Block deletion of system folders
      if (originalParentId === 'root' || id === DESKTOP_FOLDER_ID) {
        const candidate = id === DESKTOP_FOLDER_ID
          ? findNode(s.fsRoot, id)
          : (s.fsRoot.children || []).find(c => c.id === id)
        if (candidate?.type === 'folder' && SYSTEM_FOLDER_SET.has(candidate.name)) return {}
      }
      const [newRoot, removed] = removeNode(s.fsRoot, id); if (!removed) return {}
      // Do NOT delete from disk — the file stays on disk while in trash.
      // Only permanentDeleteNode / emptyTrash actually removes disk files.
      const trash = [...s.trash, { ...removed, deletedAt: new Date().toISOString(), originalParentId }]
      _saveFsTree(newRoot)
      saveToLS(STORAGE_KEYS.trash, trash)
      return { fsRoot: newRoot, trash }
    })
  },
  permanentDeleteNode(id) {
    set(s => {
      const [newRoot, removed] = removeNode(s.fsRoot, id)
      if (removed) for (const fid of collectFileIds(removed)) { _fileCache.delete(fid); fsDel(fid) }
      _saveFsTree(newRoot)
      return { fsRoot: newRoot }
    })
  },
  async copyNode(sourceId, targetFolderId) {
    const node = findNode(get().fsRoot, sourceId); if (!node) return
    // Build new tree nodes first so the copy appears in the UI immediately,
    // then copy disk files server-side (binary-safe, no UTF-8 re-encoding).
    const idMap = new Map()  // oldId → newId
    function buildCopyTree(n, topLevel = false) {
      const newId = uid()
      idMap.set(n.id, newId)
      if (n.type === "file") {
        // If content is already cached as text (e.g. Notepad), copy it in-memory too.
        if (_fileCache.has(n.id)) {
          const content = _fileCache.get(n.id)
          _fileCache.set(newId, content)
          fsWrite(newId, content)
            .then(r => { if (r?.error) { _fileCache.delete(newId); set({ notification: { message: r.error, id: uid() } }) } })
            .catch(() => { _fileCache.delete(newId) })
        } else {
          // Binary / streaming file — copy raw bytes on the server side.
          fsCopy(n.id, newId).catch(() => {})
        }
        return { ...n, id: newId, name: topLevel ? "Copy of " + n.name : n.name, updatedAt: new Date().toISOString() }
      }
      return { ...n, id: newId, updatedAt: new Date().toISOString(), children: (n.children || []).map(c => buildCopyTree(c)) }
    }
    const copy = buildCopyTree(node, true)
    set(s => {
      const fsRoot = mapNode(s.fsRoot, targetFolderId, p => ({ ...p, children: [...(p.children || []), copy] }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
  },
  renameNode(id, newName) {
    set(s => {
      const fsRoot = mapNode(s.fsRoot, id, n => ({ ...n, name: newName, updatedAt: new Date().toISOString() }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
  },
  moveNode(nodeId, targetFolderId) {
    set(s => {
      const [r1, node] = removeNode(s.fsRoot, nodeId); if (!node) return {}
      const fsRoot = mapNode(r1, targetFolderId, p => ({ ...p, children: [...(p.children || []), node] }))
      _saveFsTree(fsRoot)
      return { fsRoot }
    })
  },
  restoreFromTrash(id) {
    set(s => {
      const item = s.trash.find(t => t.id === id); if (!item) return {}
      const { deletedAt: _d, originalParentId, ...restored } = item
      // Restore to original parent if it still exists, otherwise fall back to root
      const targetId = originalParentId && findNode(s.fsRoot, originalParentId)
        ? originalParentId
        : "root"
      const fsRoot = mapNode(s.fsRoot, targetId, r => ({ ...r, children: [...(r.children || []), restored] }))
      const trash = s.trash.filter(t => t.id !== id)
      _saveFsTree(fsRoot)
      saveToLS(STORAGE_KEYS.trash, trash)
      return { trash, fsRoot }
    })
  },
  emptyTrash() {
    set(s => {
      for (const item of s.trash) for (const fid of collectFileIds(item)) { _fileCache.delete(fid); fsDel(fid) }
      saveToLS(STORAGE_KEYS.trash, [])
      return { trash: [] }
    })
  },

  // Notifications (quota errors, etc.)
  notification: null,
  clearNotification() { set({ notification: null }) },

  // Clipboard
  clipboard: null,
  setClipboard(data) { set({ clipboard: data }) },

  // Context menu
  contextMenu: null,
  showContextMenu(x, y, items) { set({ contextMenu: { x, y, items } }) },
  hideContextMenu() { set({ contextMenu: null }) },

  // Launcher
  launcherOpen: false,
  toggleLauncher() { set(s => ({ launcherOpen: !s.launcherOpen })) },
  closeLauncher() { set({ launcherOpen: false }) },

  // Dock items (persisted)
  dockItems: loadFromLS(STORAGE_KEYS.dock, DEFAULT_DOCK),
  pinToDock(appId) {
    const nonPinnable = ["launcher", "trash"]
    if (nonPinnable.includes(appId)) return
    set(s => {
      if (s.dockItems.includes(appId)) return {}
      const updated = [...s.dockItems, appId]
      saveToLS(STORAGE_KEYS.dock, updated)
      return { dockItems: updated }
    })
  },
  unpinFromDock(appId) {
    const nonRemovable = ["launcher", "trash"]
    if (nonRemovable.includes(appId)) return
    set(s => {
      const updated = s.dockItems.filter(id => id !== appId)
      saveToLS(STORAGE_KEYS.dock, updated)
      return { dockItems: updated }
    })
  },

  // Desktop items (persisted)
  desktopItems: loadFromLS(STORAGE_KEYS.desktop, DEFAULT_DESKTOP),
  addToDesktop(appId) {
    set(s => {
      if (s.desktopItems.includes(appId)) return {}
      const updated = [...s.desktopItems, appId]
      saveToLS(STORAGE_KEYS.desktop, updated)
      return { desktopItems: updated }
    })
  },
  removeFromDesktop(appId) {
    const pinned = ["trash"]
    if (pinned.includes(appId)) return
    set(s => {
      const updated = s.desktopItems.filter(id => id !== appId)
      saveToLS(STORAGE_KEYS.desktop, updated)
      return { desktopItems: updated }
    })
  },
  // Full uninstall: removes from Desktop AND Taskbar in one shot
  uninstallApp(appId) {
    set(s => {
      const desktopItems = s.desktopItems.filter(id => id !== appId)
      const dockItems    = s.dockItems.filter(id => id !== appId)
      saveToLS(STORAGE_KEYS.desktop, desktopItems)
      saveToLS(STORAGE_KEYS.dock, dockItems)
      return { desktopItems, dockItems }
    })
  },
  reorderDesktopItem(fromId, toId) {
    set(s => {
      const items = [...s.desktopItems]
      const fi = items.indexOf(fromId)
      const ti = items.indexOf(toId)
      if (fi === -1 || ti === -1 || fi === ti) return {}
      items.splice(fi, 1)
      items.splice(ti, 0, fromId)
      saveToLS(STORAGE_KEYS.desktop, items)
      return { desktopItems: items }
    })
  },
  reorderDockItem(fromId, toId) {
    const nonMovable = ["launcher", "trash"]
    if (nonMovable.includes(fromId) || nonMovable.includes(toId)) return
    set(s => {
      const items = [...s.dockItems]
      const fi = items.indexOf(fromId)
      const ti = items.indexOf(toId)
      if (fi === -1 || ti === -1 || fi === ti) return {}
      items.splice(fi, 1)
      items.splice(ti, 0, fromId)
      saveToLS(STORAGE_KEYS.dock, items)
      return { dockItems: items }
    })
  },

  // Settings
  settings: { ...DEFAULT_SETTINGS, ...loadFromLS(STORAGE_KEYS.settings, {}), customWallpaper: loadFromLS(STORAGE_KEYS.wallpaper, null) },
  updateSettings(patch) {
    set(s => {
      const ns = { ...DEFAULT_SETTINGS, ...s.settings, ...patch }
      // Split: write customWallpaper (potentially large base64) to a separate
      // server-only key so it never bloats / overflows localStorage.
      const { customWallpaper, ...settingsWithoutWallpaper } = ns
      saveToLS(STORAGE_KEYS.settings, settingsWithoutWallpaper)
      if ('customWallpaper' in patch) saveToLS(STORAGE_KEYS.wallpaper, customWallpaper)
      return { settings: ns }
    })
  },

  // Recent Apps (persisted per user — max 10 entries, includes catalog apps)
  recentApps: loadFromLS(STORAGE_KEYS.recentApps, []),
  addRecentApp(appEntry) {
    set(s => {
      const filtered = s.recentApps.filter(a => a.id !== appEntry.id)
      const updated = [appEntry, ...filtered].slice(0, 10)
      saveToLS(STORAGE_KEYS.recentApps, updated)
      return { recentApps: updated }
    })
  },

  // Catalog
  catalogApps: [],
  parseCatalogData(data) {
    return (data.apps || []).map((app, i) => ({
      id: 'cat-' + i, title: app.name, type: 'iframe',
      description: app.description || '', url: app.url,
      allowIframe: Boolean(app.allowIframe), featured: Boolean(app.featured),
      showCursor:  app.showCursor !== false,
      is_live:     app.is_live !== false,
      tags: app.tags || [],
      gradient: '', hue: (i * 47) % 360,
      icon:        app.icon_url  || app.icon  || null,
      icon_url:    app.icon_url  || app.icon  || null,
      cover_image: app.cover_image || null,
      media:       app.media || [],
    }))
  },
  applyCatalogUpdate(data) {
    set({ catalogApps: get().parseCatalogData(data) })
  },
  async loadCatalog(isAdmin = false) {
    try {
      // Admins load the full catalog (including non-live apps) from the admin endpoint.
      // Everyone else loads the public endpoint which only returns live apps.
      const jwt = getJWT()
      const url = isAdmin ? '/api/admin/catalog' : '/api/catalog'
      const headers = isAdmin && jwt ? { Authorization: `Bearer ${jwt}` } : {}
      const res = await fetch(url, { headers }); if (!res.ok) return
      const data = await res.json()
      set({ catalogApps: get().parseCatalogData(data) })
    } catch (_) {}
  },
  async addCatalogApp(appData) {
    try {
      const jwt = getJWT(); const qp = getQp()
      const res = await fetch('/api/admin/catalog/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          ...(qp  ? { 'X-Nv-Qp': qp } : {}),
        },
        body: JSON.stringify(appData),
      })
      const qt = res.headers.get('x-nv-qt'); if (qt) setQp(qt)
      const d = await res.json()
      if (!res.ok) return { ok: false, error: d.error }
      set({ catalogApps: get().parseCatalogData(d.catalog) })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  },
  async updateCatalogApp(originalName, appData) {
    try {
      const jwt = getJWT(); const qp = getQp()
      const res = await fetch(`/api/admin/catalog/apps/${encodeURIComponent(originalName)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          ...(qp  ? { 'X-Nv-Qp': qp } : {}),
        },
        body: JSON.stringify(appData),
      })
      const qt = res.headers.get('x-nv-qt'); if (qt) setQp(qt)
      const d = await res.json()
      if (!res.ok) return { ok: false, error: d.error }
      set({ catalogApps: get().parseCatalogData(d.catalog) })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  },
  async deleteCatalogApp(appName) {
    try {
      const jwt = getJWT(); const qp = getQp()
      const res = await fetch(`/api/admin/catalog/apps/${encodeURIComponent(appName)}`, {
        method: 'DELETE',
        headers: {
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          ...(qp  ? { 'X-Nv-Qp': qp } : {}),
        },
      })
      const qt = res.headers.get('x-nv-qt'); if (qt) setQp(qt)
      const d = await res.json()
      if (!res.ok) return { ok: false, error: d.error }
      set({ catalogApps: get().parseCatalogData(d.catalog) })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  },

  // Widgets
  widgets: loadFromLS(STORAGE_KEYS.widgets, []),
  addWidget(type) {
    const uid2 = () => Math.random().toString(36).slice(2,10)
    const defaults = {
      clock:   { x: 20,  y: 80,  w: 200, h: 130 },
      weather: { x: 240, y: 80,  w: 220, h: 150 },
      music:   { x: 480, y: 80,  w: 260, h: 130 },
      notes:   { x: 20,  y: 230, w: 240, h: 180 },
    }
    const pos = defaults[type] || { x: 80, y: 80, w: 200, h: 130 }
    // Clamp initial position so widgets are always visible on any screen size
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = Math.max(0, Math.min(pos.x, vw - pos.w))
    const cy = Math.max(44, Math.min(pos.y, vh - pos.h - 80))
    const widget = { id: uid2(), type, ...pos, x: cx, y: cy }
    set(s => {
      const updated = [...s.widgets, widget]
      saveToLS(STORAGE_KEYS.widgets, updated)
      return { widgets: updated }
    })
  },
  removeWidget(id) {
    set(s => {
      const updated = s.widgets.filter(w => w.id !== id)
      saveToLS(STORAGE_KEYS.widgets, updated)
      return { widgets: updated }
    })
  },
  moveWidget(id, x, y) {
    set(s => {
      const updated = s.widgets.map(w => w.id === id ? { ...w, x, y } : w)
      saveToLS(STORAGE_KEYS.widgets, updated)
      return { widgets: updated }
    })
  },

  // AI config
  aiConfig: {},
  setAiConfig(config) { saveToLS(STORAGE_KEYS.aiConfig, config); set({ aiConfig: config }) },
}))
