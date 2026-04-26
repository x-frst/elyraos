import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
  Folder, FileText, ChevronRight, ChevronLeft, Home,
  FolderPlus, FilePlus, Trash2, Grid, List, Image,
  FileCode, Archive, Music, Video, X, Upload,
  Monitor, Download, Headphones, BookOpen, Camera,
} from "lucide-react"
import { zip as zipAsync } from "fflate"
import { useStore, findNode, SYSTEM_FOLDER_NAMES } from "../store/useStore"
import { useMusicStore } from "../store/useMusicStore"
import { useAuthStore } from "../store/useAuthStore"
import { useFileUpload } from "../hooks/useFileUpload"
import { DND_FILES_MIME } from "../config.js"
import { fsRawUrl, fsUploadStream } from "../utils/db"

const EXT_ICONS = {
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image, svg: Image,
  mp3: Music, wav: Music, ogg: Music,
  mp4: Video, mkv: Video, webm: Video,
  js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
  css: FileCode, html: FileCode, py: FileCode, sh: FileCode,
  zip: Archive, tar: Archive, gz: Archive,
}

const FOLDER_STYLES = {
  Desktop:   { gradient: 'linear-gradient(135deg,#8b5cf6,#5b21b6)', Icon: Monitor,   iconColor: 'text-violet-200' },
  Documents: { gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', Icon: FileText,  iconColor: 'text-blue-200'   },
  Pictures:  { gradient: 'linear-gradient(135deg,#ec4899,#be185d)', Icon: Image,      iconColor: 'text-pink-200'   },
  Videos:    { gradient: 'linear-gradient(135deg,#ef4444,#991b1b)', Icon: Video,      iconColor: 'text-red-200'    },
  Projects:  { gradient: 'linear-gradient(135deg,#10b981,#065f46)', Icon: FileCode,   iconColor: 'text-emerald-200'},
  Downloads: { gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)', Icon: Download,   iconColor: 'text-cyan-200'   },
  Music:     { gradient: 'linear-gradient(135deg,#f59e0b,#b45309)', Icon: Headphones, iconColor: 'text-amber-200'  },
  Books:     { gradient: 'linear-gradient(135deg,#84cc16,#3f6212)', Icon: BookOpen,   iconColor: 'text-lime-200'   },
  Camera:    { gradient: 'linear-gradient(135deg,#fb7185,#9f1239)', Icon: Camera,     iconColor: 'text-rose-200'   },
}

function getFolderStyle(name) {
  return FOLDER_STYLES[name] || { gradient: 'linear-gradient(135deg,#f59e0b,#ea580c)', Icon: Folder, iconColor: 'text-amber-200' }
}

function FileIcon({ node, size = 16 }) {
  if (node.type === "folder") {
    const { Icon, iconColor } = getFolderStyle(node.name)
    return <Icon size={size} className={`${iconColor} flex-shrink-0`} />
  }
  const ext = node.name.split(".").pop()?.toLowerCase()
  const Icon = EXT_ICONS[ext] || FileText
  return <Icon size={size} className="text-blue-300 flex-shrink-0" />
}

function GridItem({ node, selected, isCut, isDragging, isDropTarget, onSelect, onOpen, onContextMenu, iconRef, isRenaming, renameVal, onRenameChange, onRenameCommit, onRenameCancel, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, isTouchDevice }) {
  return (
    <motion.div ref={iconRef}
      draggable={!isRenaming && !isTouchDevice}
      onDragStart={!isTouchDevice ? onDragStart : undefined}
      onDragEnd={!isTouchDevice ? onDragEnd : undefined}
      onDragOver={node.type === 'folder' && !isTouchDevice ? onDragOver : undefined}
      onDragLeave={node.type === 'folder' && !isTouchDevice ? onDragLeave : undefined}
      onDrop={node.type === 'folder' && !isTouchDevice ? onDrop : undefined}
      className="flex flex-col items-center gap-2 p-2 rounded-xl cursor-pointer select-none"
      style={{
        background: isDropTarget ? 'rgba(59,130,246,0.28)' : selected ? 'rgba(var(--nova-accent-rgb,130,80,255),0.25)' : 'transparent',
        width: 88, flexShrink: 0,
        opacity: isCut || isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s',
        outline: isDropTarget ? '2px solid rgba(59,130,246,0.6)' : 'none',
        outlineOffset: 2, borderRadius: 12,
      }}
      onClick={onSelect} onDoubleClick={onOpen} onContextMenu={onContextMenu}
      whileHover={{ background: isDropTarget ? 'rgba(59,130,246,0.28)' : selected ? 'rgba(var(--nova-accent-rgb,130,80,255),0.25)' : 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-center rounded-2xl"
        style={{
          width: 52, height: 52,
          background: node.type === "folder" ? getFolderStyle(node.name).gradient : "linear-gradient(135deg,#3b82f6,#6366f1)",
        }}>
        <FileIcon node={node} size={26} />
      </div>
      {isRenaming ? (
        <input autoFocus
          className="w-full text-white text-[11px] text-center bg-transparent outline outline-1 outline-violet-400 rounded px-1"
          value={renameVal} onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={e => {
            if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); onRenameCommit() }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onRenameCancel() }
          }}
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()} />
      ) : (
        <span className="text-white/80 text-[11px] text-center leading-tight w-full break-all line-clamp-2" title={node.name}>{node.name}</span>
      )}
    </motion.div>
  )
}

export default function Files({ windowId, context }) {
  const fsRoot         = useStore(s => s.fsRoot)
  const listDir        = useStore(s => s.listDir)
  const createNode     = useStore(s => s.createNode)
  const createNodeEntry = useStore(s => s.createNodeEntry)
  const updateNodeSize  = useStore(s => s.updateNodeSize)
  const deleteNode     = useStore(s => s.deleteNode)
  const permanentDeleteNode = useStore(s => s.permanentDeleteNode)
  const openWindow     = useStore(s => s.openWindow)
  const showContextMenu = useStore(s => s.showContextMenu)
  const clipboard      = useStore(s => s.clipboard)
  const setClipboard   = useStore(s => s.setClipboard)
  const moveNode       = useStore(s => s.moveNode)
  const copyNode       = useStore(s => s.copyNode)
  const renameNode     = useStore(s => s.renameNode)

  const { currentUserId } = useAuthStore()
  const isGuest = !!currentUserId?.startsWith('guest-')

  const [history, setHistory]       = useState([context?.folderId || "root"])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [selectedIds, setSelectedIds] = useState([])
  const [viewMode, setViewMode]     = useState("grid")
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal]   = useState("")
  const [selRect, setSelRect]       = useState(null)
  const [propertiesNode, setPropertiesNode] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [urlDialog, setUrlDialog]         = useState(null)
  const [sortKey, setSortKey]     = useState("name")
  const [sortDir, setSortDir]     = useState("asc")
  const [showHidden, setShowHidden] = useState(false)
  // Drag & drop state
  const [draggingIds, setDraggingIds] = useState([])
  const [dropTarget,  setDropTarget]  = useState(null)
  const containerRef = useRef(null)
  const mainRef  = useRef(null)
  const iconRefs = useRef({})
  const didDrag  = useRef(false)
  // True on touch/stylus-only devices — disables HTML5 drag to restore long-press context menu
  const isTouchDevice = useRef(window.matchMedia('(pointer: coarse)').matches).current
  const { uploads, uploadFiles } = useFileUpload()

  const cwd   = history[historyIdx]
  const rawItems = listDir(cwd)
  const items = useMemo(() => {
    let arr = rawItems
    if (!showHidden) arr = arr.filter(n => !n.name.startsWith('.'))
    arr = [...arr]  // ensure we have a mutable copy before sorting
    if (sortKey === "name") {
      arr.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } else if (sortKey === "type") {
      arr.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        const extA = a.name.split('.').pop()?.toLowerCase() || ''
        const extB = b.name.split('.').pop()?.toLowerCase() || ''
        return extA.localeCompare(extB) || a.name.localeCompare(b.name)
      })
    } else if (sortKey === "size") {
      arr.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return (b.size ?? 0) - (a.size ?? 0)
      })
    } else if (sortKey === "date") {
      arr.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    }
    if (sortDir === 'desc') arr.reverse()
    return arr
  }, [rawItems, sortKey, sortDir, showHidden])

  const buildFavs = () => {
    const roots = listDir("root")
    const sidebarOrder = ['Documents', 'Pictures', 'Videos', 'Projects', 'Downloads', 'Music']
    const result = [{ id: "root", name: "Home", Icon: Home }]
    const matched = roots
      .filter(n => n.type === "folder" && sidebarOrder.includes(n.name))
      .sort((a, b) => sidebarOrder.indexOf(a.name) - sidebarOrder.indexOf(b.name))
    matched.forEach(n => result.push({ id: n.id, name: n.name, Icon: getFolderStyle(n.name).Icon }))
    return result
  }
  const favs = buildFavs()

  const navigate = (id) => {
    const nh = [...history.slice(0, historyIdx + 1), id]
    setHistory(nh); setHistoryIdx(nh.length - 1); setSelectedIds([])
    // Keep keyboard shortcuts working after sidebar/breadcrumb navigation
    setTimeout(() => containerRef.current?.focus(), 0)
  }
  const goBack = () => {
    if (historyIdx > 0) { setHistoryIdx(h => h - 1); setSelectedIds([]); setTimeout(() => containerRef.current?.focus(), 0) }
  }
  const goForward = () => {
    if (historyIdx < history.length - 1) { setHistoryIdx(h => h + 1); setSelectedIds([]); setTimeout(() => containerRef.current?.focus(), 0) }
  }
  const goUp = () => {
    if (cwd === "root") return
    const findParent = (node, targetId, parent = null) => {
      if (node.id === targetId) return parent
      for (const c of node.children || []) { const p = findParent(c, targetId, node); if (p) return p }
      return null
    }
    const parent = findParent(fsRoot, cwd) || fsRoot
    navigate(parent.id)
  }

  // ── Breadcrumb: find path from root to cwd ─────────────────────────────────
  const getBreadcrumb = () => {
    const findPath = (node, targetId, path = []) => {
      const curr = [...path, { id: node.id, name: node.name }]
      if (node.id === targetId) return curr
      for (const c of node.children || []) {
        const r = findPath(c, targetId, curr)
        if (r) return r
      }
      return null
    }
    return findPath(fsRoot, cwd) || [{ id: "root", name: "Home" }]
  }
  const crumbs = getBreadcrumb()

  // openNode: async to support lazy file loading before opening
  const openNode = useCallback(async (node) => {
    if (node.type === "folder") { navigate(node.id); return }
    const ext = node.name.split(".").pop()?.toLowerCase()
    const imgExts      = ["jpg","jpeg","png","gif","webp","svg","bmp"]
    const vidExts      = ["mp4","webm","ogg","mov"]
    const audioExts    = ["mp3","m4a","ogg","wav","flac","aac","opus"]
    const codeExts     = ["js","jsx","ts","tsx","css","json","py","sh"]
    const arcExts      = ["zip","rar","tar","gz","7z"]
    const docExts      = ["txt","log","md","markdown","csv","tsv","xml","html","htm","pdf","xlsx","xls","xlsm","ods"]
    // Helper: fetch raw text content for small text-based files (e.g. .url shortcuts)
    const getTextContent = async () => {
      try {
        const res = await fetch(fsRawUrl(node.id, node.name))
        return res.ok ? await res.text() : ''
      } catch { return '' }
    }
    if (ext === "url") {
      const content = await getTextContent()
      const match = content.match(/^URL=(.+)$/im)
      const rawUrl = match?.[1]?.trim()
      if (rawUrl) {
        const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
        const a = document.createElement("a")
        a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      }
      return
    }
    if (imgExts.includes(ext))        openWindow("photoviewer", "photo-viewer", node.name, { fileId: node.id, parentId: cwd })
    else if (vidExts.includes(ext))   openWindow("videoplayer", "video-player", node.name, { fileId: node.id, parentId: cwd })
    else if (audioExts.includes(ext)) {
      const trackName = node.name.replace(/\.[^.]+$/, '')
      useMusicStore.getState().playRawData(trackName, fsRawUrl(node.id, node.name))
      openWindow("music", "music", "Music")
    }
    else if (arcExts.includes(ext))   openWindow("archive-" + node.id, "archive-manager", node.name, { fileId: node.id, parentId: cwd })
    else if (codeExts.includes(ext))  openWindow("code-" + node.id, "code-editor", `Code Editor — ${node.name}`, { fileId: node.id })
    else if (docExts.includes(ext))   openWindow("docviewer-" + node.id, "doc-viewer", node.name, { fileId: node.id })
    else                              openWindow("notes-" + node.id, "notes", `Notepad — ${node.name}`, { fileId: node.id })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  // Lifted out of context-menu handler so the closure is stable and works for folders
  const createZipForIds = useCallback(async (nodeIds, zipName) => {
    // Fetch each file's raw bytes via the raw endpoint (binary-safe, no base64 encoding)
    const collectFiles = async (nodeObj, folderPath) => {
      const result = []
      for (const child of (nodeObj.children || [])) {
        const childPath = `${folderPath}/${child.name}`
        if (child.type === "folder") {
          result.push(...await collectFiles(child, childPath))
        } else {
          const res = await fetch(fsRawUrl(child.id, child.name))
          const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array(0)
          result.push({ path: childPath, bytes })
        }
      }
      return result
    }
    const { fsRoot: root } = useStore.getState()
    const fileList = (await Promise.all(nodeIds.map(async id => {
      const node = findNode(root, id)
      if (!node) return []
      if (node.type === "folder") return await collectFiles(node, node.name)
      const res = await fetch(fsRawUrl(node.id, node.name))
      const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array(0)
      return [{ path: node.name, bytes }]
    }))).flat()

    // Build a real ZIP using fflate
    const zipFiles = {}
    for (const { path, bytes } of fileList) zipFiles[path] = [bytes, { level: 6 }]

    const zipped = await new Promise((resolve, reject) =>
      zipAsync(zipFiles, (err, data) => err ? reject(err) : resolve(data))
    )
    const blob   = new Blob([zipped], { type: 'application/zip' })
    const nodeId = createNodeEntry(cwd, zipName + '.zip')
    await fsUploadStream(nodeId, blob, null, null)
    updateNodeSize(nodeId, blob.size)
    openWindow('archive-' + nodeId, 'archive-manager', zipName + '.zip', { fileId: nodeId, parentId: cwd })
  }, [createNodeEntry, updateNodeSize, openWindow, cwd])

  const startRename = useCallback((node) => { setRenamingId(node.id); setRenameVal(node.name) }, [])
  // Refs always mirror current rename state — safe to read inside stable useCallback
  const renamingIdRef = useRef(null)
  const renameValRef  = useRef('')
  renamingIdRef.current = renamingId
  renameValRef.current  = renameVal

  const commitRename = useCallback(() => {
    const id  = renamingIdRef.current
    const val = renameValRef.current.trim()
    if (id && val) renameNode(id, val)   // save first
    setRenamingId(null)                  // then exit rename mode
  }, [renameNode])

  const deleteSelected = () => { selectedIds.forEach(id => deleteNode(id)); setSelectedIds([]) }

  // pasteItems MUST be declared before the useEffect that uses it to avoid TDZ ReferenceError
  const pasteItems = useCallback(() => {
    if (!clipboard) return
    if (clipboard.type === 'cut') {
      clipboard.ids.forEach(id => moveNode(id, cwd))
      setClipboard(null)
    } else {
      clipboard.ids.forEach(id => copyNode(id, cwd))
    }
  }, [clipboard, cwd, moveNode, copyNode, setClipboard])

  // ── Keyboard shortcuts — scoped to this component via onKeyDown ──────────
  const handleKeyDown = useCallback((e) => {
    if (renamingId) return  // Don't fire during rename
    if (confirmDelete) return  // Dialog handles its own keys
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    const mod   = isMac ? e.metaKey : e.ctrlKey

    // ── Select All ────────────────────────────────────────────────
    if (mod && e.key === 'a') {
      e.preventDefault(); setSelectedIds(items.map(n => n.id)); return
    }

    // ── Paste ─────────────────────────────────────────────────────
    if (mod && e.key === 'v') { e.preventDefault(); pasteItems(); return }

    // ── Navigation shortcuts (macOS: Cmd+↑ = go up, Cmd+[ = back) ─
    if (isMac) {
      if (mod && e.key === 'ArrowUp')  { e.preventDefault(); goUp();      return }
      if (mod && (e.key === '[' || e.key === 'ArrowLeft'))  { e.preventDefault(); goBack();    return }
      if (mod && (e.key === ']' || e.key === 'ArrowRight')) { e.preventDefault(); goForward(); return }
    } else {
      // Windows/Linux: Alt+← / Alt+→ for back/forward
      if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack();    return }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return }
      // Backspace = go back (Windows Explorer behaviour)
      if (e.key === 'Backspace' && !selectedIds.length) { e.preventDefault(); goBack(); return }
    }

    // ── Shortcuts that need a selection ──────────────────────────
    if (selectedIds.length) {
      // Copy / Cut
      if (mod && e.key === 'c') { e.preventDefault(); setClipboard({ type: 'copy', ids: [...selectedIds] }); return }
      if (mod && e.key === 'x') {
        e.preventDefault()
        const safe = selectedIds.filter(id => {
          const n = items.find(i => i.id === id)
          return !(n?.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(n.name))
        })
        if (safe.length) setClipboard({ type: 'cut', ids: safe })
        return
      }

      // Open
      // Windows: Enter  |  macOS: Cmd+Down or Cmd+O
      if ((!isMac && e.key === 'Enter') || (isMac && mod && (e.key === 'ArrowDown' || e.key === 'o' || e.key === 'O'))) {
        if (selectedIds.length === 1) {
          e.preventDefault()
          const n = items.find(i => i.id === selectedIds[0]); if (n) openNode(n)
        }
        return
      }

      // Rename
      // Windows: F2  |  macOS: Enter / Return (Finder behaviour)
      if ((!isMac && e.key === 'F2') || (isMac && (e.key === 'Enter' || e.key === 'Return'))) {
        if (selectedIds.length === 1) {
          e.preventDefault()
          const n = items.find(i => i.id === selectedIds[0])
          const isSys = n?.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(n.name)
          if (n && !isSys) startRename(n)
        }
        return
      }

      // Move to Trash
      // Windows: Delete  |  macOS: Backspace (the Mac "Delete" key fires as Backspace)
      if ((!isMac && e.key === 'Delete' && !e.shiftKey) || (isMac && e.key === 'Backspace' && !mod)) {
        e.preventDefault()
        const safe = selectedIds.filter(id => {
          const n = items.find(i => i.id === id)
          return !(n?.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(n.name))
        })
        safe.forEach(id => deleteNode(id)); setSelectedIds([]); return
      }

      // Permanent delete
      // Windows: Shift+Delete  |  macOS: Cmd+Backspace
      if ((!isMac && e.key === 'Delete' && e.shiftKey) || (isMac && e.key === 'Backspace' && mod)) {
        e.preventDefault()
        const safe = selectedIds.filter(id => {
          const n = items.find(i => i.id === id)
          return !(n?.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(n.name))
        })
        if (safe.length) setConfirmDelete({ ids: safe }); return
      }
    }

    // ── No-selection: Backspace = go back on Windows when nothing selected ─
    if (!isMac && e.key === 'Backspace' && !selectedIds.length) {
      e.preventDefault(); goBack()
    }
  }, [renamingId, confirmDelete, items, selectedIds, deleteNode, setClipboard, pasteItems, openNode, startRename, goBack, goForward, goUp])

  // Escape closes the confirmDelete dialog
  useEffect(() => {
    if (!confirmDelete) return
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); setConfirmDelete(null) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmDelete])

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    containerRef.current?.focus()  // Ensure container has focus for keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    } else if (e.shiftKey && selectedIds.length > 0) {
      const ids = items.map(n => n.id)
      const last = ids.indexOf(selectedIds[selectedIds.length - 1])
      const cur  = ids.indexOf(id)
      const [a, b] = [Math.min(last, cur), Math.max(last, cur)]
      setSelectedIds(ids.slice(a, b + 1))
    } else {
      setSelectedIds([id])
    }
  }

  const handleMainMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const el = e.target
    if (el !== mainRef.current && !el.classList.contains("files-main") && !el.classList.contains("files-grid") && !el.classList.contains("files-list")) return
    e.preventDefault()
    didDrag.current = false
    containerRef.current?.focus()  // Keep keyboard shortcuts alive after background click
    setSelectedIds([])
    // Use container-relative coordinates so rubber-band aligns correctly
    // even when the Files window has a CSS transform applied by Framer Motion
    const mainRect = mainRef.current.getBoundingClientRect()
    const toRel = (ev) => ({
      x: ev.clientX - mainRect.left,
      y: ev.clientY - mainRect.top + mainRef.current.scrollTop,
    })
    const start = toRel(e)
    const mkRect = (a, b) => ({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) })
    const onMove = (ev) => {
      const cur = toRel(ev)
      const dx = cur.x - start.x, dy = cur.y - start.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true
      const r = mkRect(start, cur)
      setSelRect(r)
      const scrollTop = mainRef.current.scrollTop
      const sel = []
      Object.entries(iconRefs.current).forEach(([id, domEl]) => {
        if (!domEl) return
        const b = domEl.getBoundingClientRect()
        const rb = {
          left: b.left - mainRect.left, right: b.right - mainRect.left,
          top: b.top - mainRect.top + scrollTop, bottom: b.bottom - mainRect.top + scrollTop,
        }
        if (rb.right > r.left && rb.left < r.right && rb.bottom > r.top && rb.top < r.bottom) sel.push(id)
      })
      setSelectedIds(sel)
    }
    const onUp = () => {
      setSelRect(null)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      // Let click fire, then reset the drag flag after it's been handled
      setTimeout(() => { didDrag.current = false }, 10)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [])

  // ── Shared file-upload logic ─────────────────────────────────────────────────
  // uploadFiles and uploads come from the shared useFileUpload hook (see src/hooks/useFileUpload.js).

  // ── Drag & Drop handlers ─────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, node) => {
    // If the dragged node is part of a multi-selection, drag all selected; otherwise just this node
    const ids = selectedIds.includes(node.id) ? [...selectedIds] : [node.id]
    setDraggingIds(ids)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DND_FILES_MIME, JSON.stringify(ids))
  }, [selectedIds])

  const handleDragEnd = useCallback(() => {
    setDraggingIds([])
    setDropTarget(null)
  }, [])

  // Shared drop logic — called for both folder-item drops and main-area drops
  const commitDrop = useCallback((e, targetId) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    setDraggingIds([])

    const raw = e.dataTransfer.getData(DND_FILES_MIME)
    if (raw) {
      // Internal move: skip items that are already in the target, or ARE the target
      try {
        const ids = JSON.parse(raw)
        ids.filter(id => id !== targetId).forEach(id => moveNode(id, targetId))
        setSelectedIds([])
      } catch {}
      return
    }
    // External OS files dragged in from the browser — block for guests
    if (e.dataTransfer.files?.length) {
      if (!isGuest) uploadFiles(Array.from(e.dataTransfer.files), targetId)
    }
  }, [moveNode, uploadFiles, isGuest])

  const handleMainDrop = useCallback((e) => {
    if (cwd === 'root') { e.preventDefault(); return }  // root is read-only for drops
    commitDrop(e, cwd)
  }, [cwd, commitDrop])

  const handleMainDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget('main')
  }, [])

  const handleMainDragLeave = useCallback((e) => {
    // Only clear when leaving the container entirely, not when entering a child
    if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null)
  }, [])

  const handleItemContextMenu = (e, node) => {
    e.preventDefault(); e.stopPropagation()
    if (!selectedIds.includes(node.id)) setSelectedIds([node.id])
    const affected = selectedIds.includes(node.id) && selectedIds.length > 1 ? selectedIds : [node.id]
    const isSystemFolder = node.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(node.name)

    const ext      = node.name.split(".").pop()?.toLowerCase() || ""
    const isImg    = ["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext)
    const isVid    = ["mp4","webm","ogg","mov","mkv","avi","flv","wmv"].includes(ext)
    const isAud    = ["mp3","m4a","ogg","wav","flac","aac","opus"].includes(ext)
    const isArc    = ["zip","rar","tar","gz","7z"].includes(ext)
    const isSpreadsheet = ["xlsx","xls","xlsm","ods"].includes(ext)
    const isText   = ["txt","md","html","css","js","jsx","ts","tsx","json","py","sh","csv","xml","yaml","yml","ini","cfg","conf","log","url"].includes(ext)
    const isUrl    = ext === "url"
    const isDocViewable = ["txt","log","md","markdown","csv","tsv","json","xml","html","htm","svg","pdf","png","jpg","jpeg","gif","webp","bmp","xlsx","xls","xlsm","ods"].includes(ext)

    // Build "Open With" items based on file type
    const openWithItems = []
    if (isUrl) {
      openWithItems.push({ label: "Notepad (Edit URL)", action: () => openWindow("notes-" + node.id, "notes", `Notepad — ${node.name}`, { fileId: node.id }) })
    } else if (isImg) {
      openWithItems.push({ label: "Photo Viewer",    action: () => openWindow("photoviewer", "photo-viewer", node.name, { fileId: node.id, parentId: cwd }) })
      openWithItems.push({ label: "Document Viewer", action: () => openWindow("docviewer-" + node.id, "doc-viewer", node.name, { fileId: node.id }) })
      openWithItems.push({ label: "Paint",           action: () => openWindow("paint-" + node.id, "paint", node.name, { fileId: node.id }) })
      openWithItems.push({ label: "Notepad",         action: () => openWindow("notes-" + node.id, "notes", `Notepad — ${node.name}`, { fileId: node.id }) })
      openWithItems.push({ label: "Code Editor",     action: () => openWindow("code-" + node.id, "code-editor", `Code Editor — ${node.name}`, { fileId: node.id }) })
    } else if (isVid) {
      openWithItems.push({ label: "Video Player",  action: () => openWindow("vid-" + node.id, "video-player", node.name, { fileId: node.id, parentId: cwd }) })
    } else if (isAud) {
      openWithItems.push({ label: "Music Player",  action: () => {
        const url = fsRawUrl(node.id, node.name)
        useMusicStore.getState().playRawData(node.name.replace(/\.[^.]+$/, ""), url)
        openWindow("music", "music", "Music")
      }})
    } else if (isArc) {
      openWithItems.push({ label: "Archive Manager", action: () => openWindow("archive-" + node.id, "archive-manager", node.name, { fileId: node.id, parentId: cwd }) })
      openWithItems.push({ label: "Notepad",          action: () => openWindow("notes-" + node.id, "notes", `Notepad — ${node.name}`, { fileId: node.id }) })
      openWithItems.push({ label: "Code Editor",      action: () => openWindow("code-" + node.id, "code-editor", `Code Editor — ${node.name}`, { fileId: node.id }) })
    } else if (isSpreadsheet) {
      openWithItems.push({ label: "Document Viewer", action: () => openWindow("docviewer-" + node.id, "doc-viewer", node.name, { fileId: node.id }) })
    } else if (isText || !ext) {
      if (isDocViewable) openWithItems.push({ label: "Document Viewer", action: () => openWindow("docviewer-" + node.id, "doc-viewer", node.name, { fileId: node.id }) })
      openWithItems.push({ label: "Notepad",       action: () => openWindow("notes-" + node.id, "notes", `Notepad — ${node.name}`, { fileId: node.id }) })
      openWithItems.push({ label: "Code Editor",   action: () => openWindow("code-" + node.id, "code-editor", `Code Editor — ${node.name}`, { fileId: node.id }) })
    } else if (ext === "pdf") {
      openWithItems.push({ label: "Document Viewer", action: () => openWindow("docviewer-" + node.id, "doc-viewer", node.name, { fileId: node.id }) })
    } else {
      openWithItems.push({ label: "No supported apps", disabled: true })
    }

    showContextMenu(e.clientX, e.clientY, [
      { label: node.type === "folder" ? "Open Folder" : "Open", action: () => openNode(node) },
      ...(node.type === "file" ? [{ label: "Open With", children: openWithItems }] : []),
      { type: "separator" },
      { label: "Download", action: async () => {
        // Stream the file via the raw endpoint — works correctly for binary files,
        // images, zips etc. No base64 decoding needed.
        const url = fsRawUrl(node.id, node.name)
        const res = await fetch(url)
        if (!res.ok) return
        const blob = await res.blob()
        const objUrl = URL.createObjectURL(blob)
        const a = document.createElement("a"); a.href = objUrl; a.download = node.name; a.click()
        URL.revokeObjectURL(objUrl)
      }},
      { label: "Share With...", action: async () => {
        const url = fsRawUrl(node.id, node.name)
        if (navigator.share) {
          navigator.share({ title: node.name, url }).catch(() => {})
        } else {
          try { navigator.clipboard.writeText(url); alert('Link copied to clipboard') } catch {}
        }
      }},
      { type: "separator" },
      // Compress / Extract
      ...(isArc ? [
        { label: "Extract Here", action: () => {
          openWindow("archive-" + node.id, "archive-manager", node.name, {
            fileId:      node.id,
            parentId:    cwd,
            autoExtract: true,
          })
        }},
        { label: "Open in Archive Manager", action: () => openWindow("archive-" + node.id, "archive-manager", node.name, { fileId: node.id, parentId: cwd }) },
        { type: "separator" },
      ] : []),
      { label: affected.length > 1 ? `Compress ${affected.length} items as ZIP` : "Compress as ZIP",
        action: () => {
          const zipName = affected.length === 1
            ? (items.find(it => it.id === affected[0])?.name || "archive").replace(/\.[^.]+$/, "")
            : "archive"
          createZipForIds(affected, zipName)
        }
      },
      { type: "separator" },
      { label: "Copy", action: () => setClipboard({ type: "copy", ids: affected }), disabled: isSystemFolder },
      { label: "Cut",  action: () => setClipboard({ type: "cut",  ids: affected }), disabled: isSystemFolder },
      { type: "separator" },
      { label: "Create Shortcut", action: () => createNode(cwd, "file", node.name + ".lnk", `[Shortcut]\ntarget=${node.id}\nname=${node.name}`) },
      { label: "Delete", action: () => { affected.forEach(id => deleteNode(id)); setSelectedIds([]) }, disabled: isSystemFolder },
      { label: "Rename",   action: () => startRename(node), disabled: isSystemFolder },
      { type: "separator" },
      { label: "Properties", action: () => setPropertiesNode(node) },
    ])
  }

  const handleMainContextMenu = (e) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      { label: "Sort by", children: [
        { label: (sortKey === "name" ? "✓ " : "  ") + "Name",          action: () => setSortKey("name") },
        { label: (sortKey === "size" ? "✓ " : "  ") + "Size",          action: () => setSortKey("size") },
        { label: (sortKey === "type" ? "✓ " : "  ") + "Type",          action: () => setSortKey("type") },
        { label: (sortKey === "date" ? "✓ " : "  ") + "Date modified", action: () => setSortKey("date") },
        { type: "separator" },
        { label: (sortDir === "asc"  ? "✓ " : "  ") + "Ascending",     action: () => setSortDir("asc") },
        { label: (sortDir === "desc" ? "✓ " : "  ") + "Descending",    action: () => setSortDir("desc") },
      ]},
      { label: "Refresh",         action: async () => { setSelectedIds([]); await useStore.getState().reloadFs() } },
      { label: showHidden ? "Hide hidden files" : "Show hidden files", action: () => setShowHidden(v => !v) },
      { type: "separator" },
      { label: "New", children: [
        { label: "Folder",         action: () => createNode(cwd, "folder", "New Folder") },
        ...(!isGuest ? [
          { label: "Text document",  action: () => {
              const nodeId = createNode(cwd, "file", "Untitled.txt", "")
              openWindow("notes-" + nodeId, "notes", "Untitled.txt", { fileId: nodeId })
            }
          },
          { label: "HTML document",  action: () => {
              const nodeId = createNode(cwd, "file", "index.html", "<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body></body>\n</html>")
              openWindow("code-" + nodeId, "code-editor", "index.html", { fileId: nodeId })
            }
          },
          { label: "Web Link",       action: () => setUrlDialog({ url: "https://", name: "" }) },
          { label: "JPEG image",     action: () => {
              const nodeId = createNode(cwd, "file", "image.jpg", "")
              openWindow("photoviewer", "photo-viewer", "image.jpg", { fileId: nodeId, parentId: cwd })
            }
          },
        ] : []),
      ]},
      { type: "separator" },
      { label: "Paste", disabled: !clipboard, action: pasteItems },
      { type: "separator" },
      ...(!isGuest ? [{ label: "Upload here", disabled: cwd === "root", action: () => {
        if (cwd === "root") return
        const input = document.createElement("input"); input.type = "file"; input.multiple = true
        input.onchange = () => { if (input.files?.length) uploadFiles(Array.from(input.files), cwd) }
        input.click()
      }}] : []),
      { type: "separator" },
      { label: "View: Grid", action: () => setViewMode("grid") },
      { label: "View: List", action: () => setViewMode("list") },
    ])
  }

  return (
    <div ref={containerRef} className="flex h-full text-white select-none focus:outline-none" tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ background: "rgba(14,14,24,0.88)" }}>
      {/* Sidebar */}
      <div className="flex-shrink-0 w-44 flex flex-col py-3 overflow-y-auto"
        style={{ borderRight: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,10,20,0.65)" }}>
        <div className="px-3 mb-1.5 text-white/35 text-[10px] font-semibold uppercase tracking-widest">Favorites</div>
        {favs.map(({ id, name, Icon }) => {
          const active = cwd === id
          return (
            <button key={id} onClick={() => navigate(id)}
              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors rounded-lg mx-2 mb-0.5"
              style={{ background: active ? "rgba(var(--nova-accent-rgb,130,80,255),0.25)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,0.6)" }}>
              <Icon size={14} className="flex-shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          )
        })}
        <div className="px-3 mt-3 mb-1.5 text-white/35 text-[10px] font-semibold uppercase tracking-widest">Other</div>
        <button onClick={() => openWindow("trash", "trash", "Trash")}
          className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors rounded-lg mx-2"
          style={{ color: "rgba(255,255,255,0.5)" }}>
          <Trash2 size={14} className="flex-shrink-0" />
          <span>Trash</span>
        </button>
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(18,18,32,0.8)" }}>
          <button onClick={goBack} disabled={historyIdx === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={15} /></button>
          <button onClick={goForward} disabled={historyIdx === history.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight size={15} /></button>
          <button onClick={goUp} disabled={cwd === "root"} title="Up"
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 text-sm font-bold leading-none">↑</button>

          <div className="flex items-center gap-0.5 mx-2 flex-1 text-[13px] text-white/50 overflow-hidden min-w-0">
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-0.5 flex-shrink-0">
                {i > 0 && <ChevronRight size={10} className="text-white/25 flex-shrink-0" />}
                <button className="hover:text-white/80 truncate max-w-[90px] px-1" onClick={() => navigate(c.id)}>{c.name}</button>
              </span>
            ))}
          </div>

          <button onClick={() => createNode(cwd, "folder", "New Folder")} title="New Folder"
            className="p-1.5 rounded-lg hover:bg-white/10"><FolderPlus size={14} className="text-white/60" /></button>
          {!isGuest && (
            <button onClick={() => createNode(cwd, "file", "Untitled.txt", "")} title="New File"
              className="p-1.5 rounded-lg hover:bg-white/10"><FilePlus size={14} className="text-white/60" /></button>
          )}
          <button onClick={deleteSelected} disabled={!selectedIds.length} title="Delete"
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><Trash2 size={14} className="text-white/60" /></button>
          <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.12)" }} />
          <button onClick={() => setViewMode("grid")} title="Grid"
            className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white/15" : "hover:bg-white/10"}`}>
            <Grid size={13} className="text-white/70" /></button>
          <button onClick={() => setViewMode("list")} title="List"
            className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-white/15" : "hover:bg-white/10"}`}>
            <List size={13} className="text-white/70" /></button>
        </div>

        {/* File area */}
        <div ref={mainRef} className="files-main flex-1 overflow-y-auto relative"
          onClick={e => {
            // Don't wipe rubber-band selection with the trailing click event
            if (didDrag.current) return
            if (e.target === mainRef.current || e.target.classList.contains("files-main") || e.target.classList.contains("files-grid")) setSelectedIds([])
          }}
          onContextMenu={handleMainContextMenu}
          onMouseDown={handleMainMouseDown}
          onDragOver={!isTouchDevice ? handleMainDragOver : undefined}
          onDragLeave={!isTouchDevice ? handleMainDragLeave : undefined}
          onDrop={!isTouchDevice ? handleMainDrop : undefined}
          style={{ padding: viewMode === "grid" ? "12px" : "6px 8px",
            outline: dropTarget === 'main' && cwd !== 'root' ? '2px dashed rgba(59,130,246,0.5)' : 'none',
            outlineOffset: -4 }}>

          {items.length === 0 && (
            <div className="text-white/25 text-sm text-center py-16">This folder is empty</div>
          )}

          {viewMode === "grid" ? (
            <div className="files-grid flex flex-wrap gap-1">
              {items.map(node => (
                <GridItem key={node.id} node={node}
                  selected={selectedIds.includes(node.id)}
                  isCut={clipboard?.type === 'cut' && clipboard.ids.includes(node.id)}
                  isDragging={draggingIds.includes(node.id)}
                  isDropTarget={node.type === 'folder' && dropTarget === node.id}
                  iconRef={el => iconRefs.current[node.id] = el}
                  onSelect={e => toggleSelect(e, node.id)}
                  onOpen={() => openNode(node)}
                  onContextMenu={e => handleItemContextMenu(e, node)}
                  isRenaming={renamingId === node.id}
                  renameVal={renameVal}
                  onRenameChange={setRenameVal}
                  onRenameCommit={commitRename}
                  onRenameCancel={() => setRenamingId(null)}
                  isTouchDevice={isTouchDevice}
                  onDragStart={e => handleDragStart(e, node)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget(node.id) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }}
                  onDrop={e => commitDrop(e, node.id)} />
              ))}
            </div>
          ) : (
            <div className="files-list">
              <div className="flex items-center gap-3 px-3 py-1 text-[11px] text-white/30 font-semibold uppercase tracking-wider mb-1"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="w-4" /><span className="flex-1">Name</span>
                <span className="w-20 text-right">Size</span>
                <span className="w-24 text-right">Modified</span><span className="w-12 text-right">Type</span>
              </div>
              {items.map(node => {
                const isSel     = selectedIds.includes(node.id)
                const isCut     = clipboard?.type === 'cut' && clipboard.ids.includes(node.id)
                const isDraggingThis = draggingIds.includes(node.id)
                const isDropTgt = node.type === 'folder' && dropTarget === node.id
                return (
                  <motion.div key={node.id}
                    ref={el => iconRefs.current[node.id] = el}
                    draggable={!isTouchDevice}
                    onDragStart={!isTouchDevice ? e => handleDragStart(e, node) : undefined}
                    onDragEnd={!isTouchDevice ? handleDragEnd : undefined}
                    onDragOver={node.type === 'folder' && !isTouchDevice ? (e => { e.preventDefault(); e.stopPropagation(); setDropTarget(node.id) }) : undefined}
                    onDragLeave={node.type === 'folder' && !isTouchDevice ? (e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }) : undefined}
                    onDrop={node.type === 'folder' && !isTouchDevice ? (e => commitDrop(e, node.id)) : undefined}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                    style={{
                      background: isDropTgt ? 'rgba(59,130,246,0.22)' : isSel ? 'rgba(var(--nova-accent-rgb,130,80,255),0.22)' : 'transparent',
                      opacity: isCut || isDraggingThis ? 0.35 : 1,
                      transition: 'opacity 0.15s',
                      outline: isDropTgt ? '2px solid rgba(59,130,246,0.5)' : 'none',
                      outlineOffset: -1,
                    }}
                    onClick={e => toggleSelect(e, node.id)} onDoubleClick={() => openNode(node)}
                    onContextMenu={e => handleItemContextMenu(e, node)}
                    whileHover={{ background: isDropTgt ? 'rgba(59,130,246,0.22)' : isSel ? 'rgba(var(--nova-accent-rgb,130,80,255),0.22)' : 'rgba(255,255,255,0.04)' }}>
                    <FileIcon node={node} size={15} />
                    {renamingId === node.id ? (
                      <input autoFocus className="flex-1 bg-transparent text-white text-[13px] outline outline-1 outline-violet-400 rounded px-1"
                        value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); commitRename() }
                          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRenamingId(null) }
                        }}
                        onClick={e => e.stopPropagation()} />
                    ) : (
                      <>
                        <span className="flex-1 text-white/85 text-[13px] truncate" title={node.name}>{node.name}</span>
                        <span className="text-white/30 text-[11px] w-20 text-right flex-shrink-0">{node.type === 'folder' ? `${(node.children||[]).length} items` : (() => { const sz = node.size ?? 0; return sz < 1024 ? `${sz} B` : `${(sz/1024).toFixed(1)} KB` })()}</span>
                        <span className="text-white/30 text-[11px] w-24 text-right flex-shrink-0">{new Date(node.updatedAt).toLocaleDateString()}</span>
                        <span className="text-white/25 text-[11px] w-12 text-right flex-shrink-0">{node.type === "folder" ? "Folder" : (node.name.split(".").pop()?.toUpperCase() || "File")}</span>
                      </>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}

          {selRect && (
            <div style={{
              position: "absolute", left: selRect.left, top: selRect.top,
              width: selRect.right - selRect.left, height: selRect.bottom - selRect.top,
              background: "rgba(130,80,255,0.1)", border: "1px solid rgba(130,80,255,0.55)",
              borderRadius: 4, pointerEvents: "none", zIndex: 500,
            }} />
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-1 text-[11px] text-white/35 flex items-center gap-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
          {selectedIds.length > 0 && <span>· {selectedIds.length} selected</span>}
          {clipboard && <span className="text-violet-400/60 ml-auto">{clipboard.type === "cut" ? "✂ Cut" : "⧉ Copied"}: {clipboard.ids.length} item(s)</span>}
        </div>

        {/* ── Upload progress toasts ── */}
        {uploads.length > 0 && (
          <div className="absolute bottom-10 right-2 z-50 flex flex-col gap-1.5 w-64 pointer-events-none">
            {uploads.map(u => (
              <div key={u.id} className="rounded-xl p-2.5 pointer-events-auto"
                style={{ background: 'rgba(18,18,32,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Upload size={11} className="text-violet-400 flex-shrink-0" />
                    <span className="text-white/80 text-[11px] truncate">{u.name}</span>
                  </div>
                  <button onClick={u.cancel}
                    className="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors">
                    <X size={11} />
                  </button>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${Math.round(u.progress * 100)}%`, background: 'var(--nova-accent,#7c3aed)' }} />
                </div>
                <div className="text-white/30 text-[10px] mt-1 text-right">
                  {Math.round(u.progress * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Properties panel */}
      {propertiesNode && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setPropertiesNode(null)}>
          <div className="rounded-2xl p-5 w-72 text-sm" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-white text-base mb-4">Properties</div>
            <div className="flex flex-col gap-2 text-white/70">
              <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Name</span><span className="text-white break-all">{propertiesNode.name}</span></div>
              <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Type</span><span className="text-white capitalize">{propertiesNode.type}</span></div>
              {propertiesNode.type === "file" && <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Size</span><span className="text-white">{(propertiesNode.size ?? 0).toLocaleString()} bytes</span></div>}
              {propertiesNode.type === "folder" && <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Contents</span><span className="text-white">{(propertiesNode.children || []).length} items</span></div>}
              <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Modified</span><span className="text-white">{new Date(propertiesNode.updatedAt).toLocaleString()}</span></div>
            </div>
            <button onClick={() => setPropertiesNode(null)}
              className="mt-4 w-full py-1.5 rounded-lg text-sm font-medium text-white transition-all"
              style={{ background: "rgba(130,80,255,0.5)" }}>Close</button>
          </div>
        </div>
      )}

      {/* Permanent delete confirmation dialog */}
      {confirmDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="rounded-2xl p-5 w-80 text-sm" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,80,80,0.3)" }}>
            <div className="font-semibold text-white text-base mb-2">Permanently Delete?</div>
            <p className="text-white/55 text-[13px] mb-5">
              This will permanently delete {confirmDelete.ids.length} item(s). This action cannot be undone.
            </p>
            <div className="flex gap-2"
              onKeyDown={e => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  const btns = Array.from(e.currentTarget.querySelectorAll('button'))
                  const idx = btns.indexOf(document.activeElement)
                  if (idx !== -1) btns[(idx + 1) % btns.length].focus()
                }
              }}>
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white/70 transition-all"
                style={{ background: "rgba(255,255,255,0.08)" }}>Cancel</button>
              <button autoFocus onClick={() => {
                confirmDelete.ids.forEach(id => permanentDeleteNode(id))
                setSelectedIds([])
                setConfirmDelete(null)
              }}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{ background: "rgba(239,68,68,0.7)" }}>Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* ── URL creation dialog ──────────────────────────────── */}
      {urlDialog && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setUrlDialog(null)}>
          <div className="rounded-2xl p-5 w-80 text-sm"
            style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-white text-base mb-4">🔗 New Web Link</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">URL</label>
                <input autoFocus type="url" placeholder="https://example.com"
                  value={urlDialog.url}
                  onChange={e => setUrlDialog(d => ({ ...d, url: e.target.value }))}
                  className="w-full text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/15 focus:border-violet-400/50"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  onKeyDown={e => e.key === "Escape" && setUrlDialog(null)} />
              </div>
              <div>
                <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Display name <span className="normal-case text-white/30">(optional — defaults to hostname)</span></label>
                <input type="text" placeholder="e.g. GitHub"
                  value={urlDialog.name}
                  onChange={e => setUrlDialog(d => ({ ...d, name: e.target.value }))}
                  className="w-full text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/15 focus:border-violet-400/50"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  onKeyDown={e => e.key === "Escape" && setUrlDialog(null)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setUrlDialog(null)}
                className="flex-1 py-1.5 rounded-lg text-sm text-white/60"
                style={{ background: "rgba(255,255,255,0.08)" }}>Cancel</button>
              <button onClick={() => {
                const trimmed = urlDialog.url.trim()
                if (!trimmed || trimmed === "https://") return
                let siteName = urlDialog.name.trim()
                if (!siteName) {
                  try {
                    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
                    siteName = u.hostname.replace(/^www\./, "") || "link"
                  } catch { siteName = "link" }
                }
                createNode(cwd, "file", siteName + ".url", `[InternetShortcut]\nURL=${trimmed}\n`)
                setUrlDialog(null)
              }}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "rgba(130,80,255,0.6)" }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
