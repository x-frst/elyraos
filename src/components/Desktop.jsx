import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { Folder, FileText, Image, Video, FileCode, Archive, Music, Upload, X } from "lucide-react"
import { strToU8, zipSync } from "fflate"
import { useStore, SYSTEM_APPS, DESKTOP_FOLDER_ID, findNode } from "../store/useStore"
import { useAuthStore } from "../store/useAuthStore"
import { AppTile, CatalogTile } from "../utils/icons"
import { DND_FS_MIME, DND_APP_MIME } from "../config.js"
import { useFileUpload } from "../hooks/useFileUpload"
import { fsStatSize, fmtBytes } from "../utils/db"

// ── File icon for FS items on the desktop ──────────────────────────────────────────
const FS_EXT_ICONS = {
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image, svg: Image,
  mp3: Music, wav: Music, ogg: Music,
  mp4: Video, mkv: Video, webm: Video, mov: Video, avi: Video, m4v: Video,
  js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
  css: FileCode, html: FileCode, py: FileCode, sh: FileCode,
  zip: Archive, tar: Archive, gz: Archive, rar: Archive, '7z': Archive, tgz: Archive,
}
function FsItemIcon({ node, size = 52 }) {
  if (node.type === 'folder') {
    return (
      <div className="rounded-2xl flex items-center justify-center"
        style={{ width: size, height: size,
          background: 'linear-gradient(135deg,#f59e0b,#ea580c)' }}>
        <Folder size={Math.round(size * 0.5)} className="text-white/90" />
      </div>
    )
  }
  const ext = (node.name.split('.').pop() || '').toLowerCase()
  const IconComp = FS_EXT_ICONS[ext] || FileText
  return (
    <div className="rounded-2xl flex items-center justify-center"
      style={{ width: size, height: size,
        background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
      <IconComp size={Math.round(size * 0.5)} className="text-white/90" />
    </div>
  )
}

function getFileApp(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { appId: 'photoviewer', appType: 'photo-viewer' }
  if (['mp4','webm','ogg','mov'].includes(ext)) return { appId: 'videoplayer', appType: 'video-player' }
  if (['zip','rar','tar','gz','7z','tgz'].includes(ext)) return { appId: 'archive', appType: 'archive-manager' }
  if (['js','jsx','ts','tsx','css','json','py','sh'].includes(ext)) return { appId: 'codeeditor', appType: 'code-editor' }
  if (['txt','log','md','markdown','csv','tsv','xml','html','htm','pdf','xlsx','xls','xlsm','ods'].includes(ext)) return { appId: 'docviewer', appType: 'doc-viewer' }
  return { appId: 'notes', appType: 'notes' }
}

export default function Desktop() {
  const showContextMenu  = useStore(s => s.showContextMenu)
  const openWindow       = useStore(s => s.openWindow)
  const desktopItems     = useStore(s => s.desktopItems)
  const removeFromDesktop = useStore(s => s.removeFromDesktop)
  const reorderDesktopItem = useStore(s => s.reorderDesktopItem)
  const pinToDock        = useStore(s => s.pinToDock)
  const dockItems        = useStore(s => s.dockItems)
  const createNode       = useStore(s => s.createNode)
  const clipboard        = useStore(s => s.clipboard)
  const setClipboard     = useStore(s => s.setClipboard)
  const catalogApps      = useStore(s => s.catalogApps)
  const fsRoot           = useStore(s => s.fsRoot)
  const renameNode       = useStore(s => s.renameNode)
  const windows          = useStore(s => s.windows)
  const minimizeAll      = useStore(s => s.minimizeAll)
  const addRecentApp     = useStore(s => s.addRecentApp)
  const addWidget     = useStore(s => s.addWidget)
  const deleteNode     = useStore(s => s.deleteNode)
  const permanentDeleteNode = useStore(s => s.permanentDeleteNode)
  const moveNode        = useStore(s => s.moveNode)
  const copyNode        = useStore(s => s.copyNode)
  const readFile        = useStore(s => s.readFile)
  const logout           = useAuthStore(s => s.logout)
  const currentUsername  = useAuthStore(s => s.currentUsername)
  const currentUserId    = useAuthStore(s => s.currentUserId)
  const isGuest = !!currentUserId?.startsWith('guest-')

  const [sortKey, setSortKey] = useState("name")
  const [showHidden, setShowHidden] = useState(false)
  const [hideIcons, setHideIcons]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { ids: [] }
  const [propertiesApp, setPropertiesApp] = useState(null)  // { type: 'app'|'fs', app?, node? }
  const [propertiesFsSize, setPropertiesFsSize] = useState(null)  // fetched real size in bytes

  // Fetch the real on-disk file size whenever a file Properties dialog opens
  useEffect(() => {
    if (!propertiesApp || propertiesApp.type !== 'fs' || propertiesApp.node.type !== 'file') {
      setPropertiesFsSize(null); return
    }
    let cancelled = false
    setPropertiesFsSize(undefined)  // undefined = loading
    fsStatSize(propertiesApp.node.id, propertiesApp.node.name)
      .then(sz => { if (!cancelled) setPropertiesFsSize(sz) })
    return () => { cancelled = true }
  }, [propertiesApp])
  const [urlDialog, setUrlDialog] = useState(null) // null | { url: string, name: string }
  // Inline rename state for FS items on the desktop
  const [renamingId,  setRenamingId]  = useState(null)
  const [renameVal,   setRenameVal]   = useState('')
  // Drag state
  const [draggingIds, setDraggingIds] = useState([])  // FS items being dragged
  const [dropTarget,  setDropTarget]  = useState(null)  // 'desktop' | node.id (folder)
  const [dragAppId,   setDragAppId]   = useState(null)  // app shortcut being reordered
  const [dropOverAppId, setDropOverAppId] = useState(null) // reorder drop target
  // True on touch-only devices — disables HTML5 drag to restore long-press context menu
  const isTouchDevice = useRef(window.matchMedia('(pointer: coarse)').matches).current
  const { uploads, uploadFiles } = useFileUpload()

  // Ref always mirrors current rename state — safe to read inside stable callbacks
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
  const startRename = (node) => { setRenamingId(node.id); setRenameVal(node.name) }

  // FS items that live in the Desktop folder, sorted
  const rawFsItems = findNode(fsRoot, DESKTOP_FOLDER_ID)?.children || []
  const desktopFsItems = useMemo(() => {
    let arr = rawFsItems
    if (!showHidden) arr = arr.filter(n => !n.name.startsWith('.'))
    arr = [...arr]
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
    } else if (sortKey === "date") {
      arr.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    }
    return arr
  }, [rawFsItems, sortKey, showHidden])
  const [selectedIds, setSelectedIds] = useState([])
  const [selRect, setSelRect]   = useState(null)
  const desktopRef = useRef(null)
  const iconRefs   = useRef({})
  const didDrag    = useRef(false) // tracks if mouse moved during mousedown (rubber-band)

  // ── Touch drag refs ───────────────────────────────────────────────────────
  const touchDropRef        = useRef(null)
  const desktopLongPressRef = useRef(null)
  // Mirrors selectedIds so the drag closure never holds a stale array
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  // Always-fresh refs to context-menu handlers (defined later in the component)
  const ctxHandlerRef = useRef({})

  // ── Desktop touch drag handler ────────────────────────────────────────────
  // Same two-phase model as the Dock: suppress contextmenu immediately, then:
  //   Phase 1 (0–500 ms): cancel if finger moves (scroll intent)
  //   Phase 2 (500 ms+):  vibrate → enter drag-ready; first move > 6 px starts drag
  //   touchend without drag: show context menu at last touch position
  const handleDesktopTouchStart = useCallback((e) => {
    if (!isTouchDevice) return
    if (e.touches.length !== 1) return
    const iconEl = e.target.closest('[data-desktop-icon]')
    if (!iconEl) return
    const iconId = iconEl.dataset.iconId
    if (!iconId) return
    if (renamingIdRef.current) return

    const touch  = e.touches[0]
    const startX = touch.clientX
    const startY = touch.clientY
    const isFsItem = iconId.startsWith('fs:')
    let lastX = startX, lastY = startY
    let longPressed = false
    let dragStarted = false
    let ghost = null

    // Suppress browser contextmenu immediately (see Dock handler for rationale)
    const suppressCtx = (ev) => ev.preventDefault()
    document.addEventListener('contextmenu', suppressCtx, { capture: true })

    let beforeMove, afterMove, onEnd

    const cleanup = () => {
      clearTimeout(desktopLongPressRef.current)
      document.removeEventListener('touchmove', beforeMove)
      document.removeEventListener('touchmove', afterMove)
      document.removeEventListener('contextmenu', suppressCtx, true)
      document.removeEventListener('touchend',    onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }

    // Phase 1: abort if finger strays before long-press (user is scrolling)
    beforeMove = (ev) => {
      const t = ev.touches[0]
      lastX = t.clientX; lastY = t.clientY
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cleanup()
    }
    document.addEventListener('touchmove', beforeMove, { passive: true })

    // Phase 2: track movement after long-press; first meaningful move starts drag
    afterMove = (ev) => {
      ev.preventDefault()
      const t = ev.touches[0]
      lastX = t.clientX; lastY = t.clientY

      if (!dragStarted && (Math.abs(t.clientX - startX) > 6 || Math.abs(t.clientY - startY) > 6)) {
        dragStarted = true
        useStore.getState().hideContextMenu()
        const rect = iconEl.getBoundingClientRect()
        ghost = iconEl.cloneNode(true)
        Object.assign(ghost.style, {
          position: 'fixed',
          left: rect.left + 'px', top: rect.top + 'px',
          width: rect.width + 'px', height: rect.height + 'px',
          pointerEvents: 'none', zIndex: '99999',
          opacity: '0.85', transform: 'scale(1.15)',
          transition: 'transform 0.12s ease',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        })
        document.body.appendChild(ghost)
        touchDropRef.current = null
        if (isFsItem) setDraggingIds([iconId.slice(3)])
        else setDragAppId(iconId)
      }

      if (dragStarted && ghost) {
        const rect = iconEl.getBoundingClientRect()
        ghost.style.left = (rect.left + (t.clientX - startX)) + 'px'
        ghost.style.top  = (rect.top  + (t.clientY - startY)) + 'px'
        ghost.style.visibility = 'hidden'
        const under = document.elementFromPoint(t.clientX, t.clientY)
        ghost.style.visibility = 'visible'
        const targetEl = under?.closest('[data-desktop-icon]')
        const targetId = targetEl?.dataset.iconId ?? null
        const dropId   = (targetId && targetId !== iconId) ? targetId : null
        touchDropRef.current = dropId
        if (isFsItem) {
          const targetFsId = dropId?.startsWith('fs:') ? dropId.slice(3) : null
          const targetNode = targetFsId ? findNode(useStore.getState().fsRoot, targetFsId) : null
          setDropTarget(targetNode?.type === 'folder' ? targetFsId : 'desktop')
        } else {
          setDropOverAppId(dropId && !dropId.startsWith('fs:') ? dropId : null)
        }
      }
    }

    onEnd = () => {
      cleanup()
      if (ghost && document.body.contains(ghost)) document.body.removeChild(ghost)
      ghost = null

      if (dragStarted) {
        const dropId = touchDropRef.current
        touchDropRef.current = null
        if (dropId) {
          if (!isFsItem && !dropId.startsWith('fs:')) {
            reorderDesktopItem(iconId, dropId)
          } else if (isFsItem && dropId.startsWith('fs:')) {
            const targetFsId = dropId.slice(3)
            const targetNode = findNode(useStore.getState().fsRoot, targetFsId)
            if (targetNode?.type === 'folder' && targetFsId !== iconId.slice(3)) {
              const selFsIds = selectedIdsRef.current.filter(id => id.startsWith('fs:')).map(id => id.slice(3))
              const idsToMove = selFsIds.includes(iconId.slice(3)) ? selFsIds : [iconId.slice(3)]
              idsToMove.forEach(id => moveNode(id, targetFsId))
              setSelectedIds([])
            }
          }
        }
        setDraggingIds([]); setDragAppId(null); setDropOverAppId(null); setDropTarget(null)
      } else if (longPressed) {
        // Long-press without drag → show context menu at last touch position
        setDraggingIds([]); setDragAppId(null); setDropOverAppId(null); setDropTarget(null)
        const synth = { preventDefault: () => {}, stopPropagation: () => {}, clientX: lastX, clientY: lastY }
        if (isFsItem) {
          const node = findNode(useStore.getState().fsRoot, iconId.slice(3))
          if (node) ctxHandlerRef.current.fsCM?.(synth, node)
        } else {
          const app = SYSTEM_APPS[iconId] || useStore.getState().catalogApps.find(a => a.id === iconId)
          if (app) ctxHandlerRef.current.appCM?.(synth, app)
        }
      }
    }

    desktopLongPressRef.current = setTimeout(() => {
      longPressed = true
      if (navigator.vibrate) navigator.vibrate(40)
      document.removeEventListener('touchmove', beforeMove)
      document.addEventListener('touchmove', afterMove, { passive: false })
    }, 500)

    document.addEventListener('touchend',    onEnd, { once: true })
    document.addEventListener('touchcancel', onEnd, { once: true })
  }, [isTouchDevice, reorderDesktopItem, moveNode])

  // Resolve app id to definition
  const resolveApp = (id) => SYSTEM_APPS[id] || catalogApps.find(a => a.id === id) || null
  const apps = desktopItems.map(resolveApp).filter(Boolean)

  // ── Rubber-band selection ─────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    // Don't start rubber-band when clicking on an actual icon
    if (e.target.closest('[data-desktop-icon]')) return
    // If a rename is in progress, clicking blank space should commit it.
    // We must NOT call e.preventDefault() here — that would keep focus on the
    // rename input and prevent the blur event (which calls commitRename).
    if (renamingIdRef.current) return
    e.preventDefault()
    setSelectedIds([])
    didDrag.current = false
    const start = { x: e.clientX, y: e.clientY }
    let cur = { ...start }

    const mkRect = (a, b) => ({
      left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y),
    })

    const onMove = (ev) => {
      cur = { x: ev.clientX, y: ev.clientY }
      if (Math.abs(cur.x - start.x) > 4 || Math.abs(cur.y - start.y) > 4) didDrag.current = true
      const r = mkRect(start, cur)
      setSelRect(r)
      // Intersect against desktop icons
      const sel = []
      desktopRef.current?.querySelectorAll('[data-desktop-icon]').forEach(el => {
        const id = el.dataset.iconId
        if (!id) return
        const b = el.getBoundingClientRect()
        if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) sel.push(id)
      })
      setSelectedIds(sel)
    }
    const onUp = () => {
      setSelRect(null)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      // Reset drag flag after click event fires
      setTimeout(() => { didDrag.current = false }, 10)
      // Restore focus to the desktop so keyboard shortcuts work after rubber-band selection
      desktopRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [])

  // ── Open FS item on Desktop ───────────────────────────────────────────────
  const handleFsItemOpen = (node) => {
    if (node.type === 'folder') {
      openWindow('files-' + node.id, 'files', node.name, { folderId: node.id })
      return
    }
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    // .url → follow the link in a real browser tab
    if (ext === 'url') {
      const content = readFile(node.id) || ''
      const match = content.match(/^URL=(.+)$/im)
      const rawUrl = match?.[1]?.trim()
      if (rawUrl) {
        const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
        const a = document.createElement('a')
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      }
      return
    }
    const { appId, appType } = getFileApp(node.name)
    const windowId = appType === 'archive-manager' ? 'archive-' + node.id
                   : appType === 'doc-viewer'      ? 'docviewer-' + node.id
                   : appType === 'code-editor'     ? 'code-' + node.id
                   : appId
    openWindow(windowId, appType, node.name, { fileId: node.id, parentId: DESKTOP_FOLDER_ID })
  }

  const handleFsItemContextMenu = (e, node) => {
    e.preventDefault(); e.stopPropagation()
    // Select this item on right-click, keeping multi-selections intact
    const fsId = 'fs:' + node.id
    if (!selectedIds.includes(fsId)) setSelectedIds([fsId])
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext)
    const isVideo = ['mp4','webm','ogg','mov'].includes(ext)
    const isArc   = ['zip','rar','tar','gz','7z','tgz'].includes(ext)
    const isDocViewable = ['txt','log','md','markdown','csv','tsv','json','xml','html','htm','svg','pdf','png','jpg','jpeg','gif','webp','bmp'].includes(ext)
    showContextMenu(e.clientX, e.clientY, [
      { label: node.type === 'folder' ? 'Open Folder' : 'Open', action: () => handleFsItemOpen(node) },
      ...(node.type === 'file' ? [{ label: 'Open With', children: [
        ...(isDocViewable ? [{ label: 'Document Viewer', action: () => openWindow('docviewer-' + node.id, 'doc-viewer', node.name, { fileId: node.id }) }] : []),
        { label: 'Notepad',     action: () => openWindow('notes-' + node.id, 'notes', node.name, { fileId: node.id }) },
        { label: 'Code Editor', action: () => openWindow('code-' + node.id, 'code-editor', node.name, { fileId: node.id }) },
        ...(isImage ? [
          { label: 'Photo Viewer', action: () => openWindow('photoviewer', 'photo-viewer', node.name, { fileId: node.id, parentId: DESKTOP_FOLDER_ID }) },
          { label: 'Paint', action: () => openWindow('paint-' + node.id, 'paint', node.name, { fileId: node.id }) },
        ] : []),
        ...(isVideo ? [{ label: 'Video Player', action: () => openWindow('videoplayer', 'video-player', node.name, { fileId: node.id, parentId: DESKTOP_FOLDER_ID }) }] : []),
        ...(isArc ? [{ label: 'Archive Manager', action: () => openWindow('archive-' + node.id, 'archive-manager', node.name, { fileId: node.id, parentId: DESKTOP_FOLDER_ID }) }] : []),
      ]}] : []),
      { type: 'separator' },
      { label: 'Rename', action: () => startRename(node) },
      { label: 'Delete', action: () => deleteNode(node.id) },
      { type: 'separator' },
      { label: 'Download', disabled: node.type === 'folder', action: () => {
          if (node.type === 'folder') return
          const content = readFile(node.id) || ''
          const ext = (node.name.split('.').pop() || '').toLowerCase()
          const arcExts = ['zip','rar','tar','gz','7z']
          let blob
          if (arcExts.includes(ext)) {
            try {
              const arc = JSON.parse(content)
              if (arc?.novaArchive && Array.isArray(arc.files)) {
                const zipFiles = {}
                arc.files.forEach(f => {
                  if (!f.path) return
                  if (f.isDir) {
                    const dirPath = f.path.endsWith('/') ? f.path : f.path + '/'
                    zipFiles[dirPath] = {}
                  } else {
                    zipFiles[f.path] = [strToU8(f.content || ''), { level: 6 }]
                  }
                })
                blob = new Blob([zipSync(zipFiles)], { type: 'application/zip' })
              }
            } catch {}
          }
          if (!blob) blob = new Blob([content], { type: 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = node.name; a.click(); URL.revokeObjectURL(url)
        }
      },
      { label: 'Properties', action: () => setPropertiesApp({ type: 'fs', node }) },
    ])
  }

  const handleDesktopContextMenu = (e) => {
    e.preventDefault(); e.stopPropagation()
    showContextMenu(e.clientX, e.clientY, [
      { label: "Sort by", children: [
        { label: "Name",          action: () => setSortKey("name"),  checked: sortKey === "name" },
        { label: "Type",          action: () => setSortKey("type"),  checked: sortKey === "type" },
        { label: "Date modified", action: () => setSortKey("date"),  checked: sortKey === "date" },
      ]},
      { label: "Refresh",             action: () => { setSelectedIds([]); setSortKey("name"); useStore.getState().reloadFs() } },
      { label: showHidden ? "Hide hidden files" : "Show hidden files", action: () => setShowHidden(v => !v) },
      { label: hideIcons  ? "Show desktop icons" : "Hide desktop icons",  action: () => setHideIcons(v => !v) },
      { type: "separator" },
      { label: "New", children: [
        { label: "Folder",        action: () => { createNode(DESKTOP_FOLDER_ID, "folder", "New Folder") } },
        ...(!isGuest ? [
          { label: "Text document", action: () => {
              const nodeId = createNode(DESKTOP_FOLDER_ID, "file", "Untitled.txt", "")
              openWindow("notes-" + nodeId, "notes", "Untitled.txt", { fileId: nodeId })
            }
          },
          { label: "HTML document", action: () => {
              const nodeId = createNode(DESKTOP_FOLDER_ID, "file", "index.html", "<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body></body>\n</html>")
              openWindow("code-" + nodeId, "code-editor", "index.html", { fileId: nodeId })
            }
          },
          { label: "Web Link", action: () => setUrlDialog({ url: "https://", name: "" }) },
          { label: "JPEG image", action: () => {
              const nodeId = createNode(DESKTOP_FOLDER_ID, "file", "image.jpg", "")
              openWindow("photoviewer", "photo-viewer", "image.jpg", { fileId: nodeId, parentId: DESKTOP_FOLDER_ID })
            }
          },
        ] : []),
      ]},
      { type: "separator" },
      ...(!isGuest ? [{ label: "Upload here", action: () => {
          const input = document.createElement("input")
          input.type = "file"; input.multiple = true
          input.onchange = () => uploadFiles(input.files, DESKTOP_FOLDER_ID)
          input.click()
        }
      }] : []),
      { label: "Add Widget", children: [
        { label: "Clock",        action: () => addWidget("clock") },
        { label: "Weather",      action: () => addWidget("weather") },
        { label: "Now Playing",  action: () => addWidget("music") },
        { label: "Sticky Note",  action: () => addWidget("notes") },
      ]},
      { type: "separator" },
      { label: "Change desktop background...", action: () => openWindow("settings", "settings", "Settings") },
      { type: "separator" },
      { label: currentUsername ? `Signed in as ${currentUsername}` : "Guest session", disabled: true },
      { label: "Sign Out", action: () => logout() },
    ])
  }

  // ── Icon right-click ──────────────────────────────────────────────────────
  const handleIconContextMenu = (e, app) => {
    e.preventDefault(); e.stopPropagation()
    // Select this item on right-click, keeping multi-selections intact
    if (!selectedIds.includes(app.id)) setSelectedIds([app.id])
    // If right-clicking an icon that is part of a multi-selection, show group menu
    const isMulti = selectedIds.length > 1 && selectedIds.includes(app.id)
    if (isMulti) {
      const count = selectedIds.length
      showContextMenu(e.clientX, e.clientY, [
        { label: `Open ${count} Items`, action: () => selectedIds.forEach(id => {
            const a = resolveApp(id); if (a) { openWindow(a.id, a.type, a.title, a.type === "iframe" ? { app: a } : {}); addRecentApp(a) }
          })
        },
        { type: "separator" },
        { label: `Remove ${count} Items from Desktop`, action: () => { selectedIds.forEach(id => removeFromDesktop(id)); setSelectedIds([]) } },
        { label: `Copy ${count} Items`,  action: () => setClipboard({ type: "copy", ids: [...selectedIds] }) },
        { label: `Cut ${count} Items`,   action: () => setClipboard({ type: "cut",  ids: [...selectedIds] }) },
      ])
      return
    }
    showContextMenu(e.clientX, e.clientY, [
      { label: `Open ${app.title}`, action: () => { openWindow(app.id, app.type, app.title, app.type === "iframe" ? { app } : {}); addRecentApp(app) } },
      { type: "separator" },
      ...(() => {
        const isSystemApp = !!SYSTEM_APPS[app.id]
        const isInstalled = desktopItems.includes(app.id)
        const canPin = isSystemApp || isInstalled
        if (!dockItems.includes(app.id) && app.id !== 'trash' && app.id !== 'launcher') {
          return canPin ? [{ label: "Pin to Dock", action: () => pinToDock(app.id) }] : []
        }
        return app.id !== 'trash' && app.id !== 'launcher'
          ? [{ label: "Unpin from Dock", action: () => useStore.getState().unpinFromDock(app.id) }]
          : []
      })(),
      { label: "Remove from Desktop", action: () => { removeFromDesktop(app.id); setSelectedIds([]) } },
      { type: "separator" },
      { label: "Properties", action: () => setPropertiesApp({ type: 'app', app }) },
    ])
  }

  // Keep ctxHandlerRef always pointing to the latest versions of both handlers
  ctxHandlerRef.current = { fsCM: handleFsItemContextMenu, appCM: handleIconContextMenu }
  const handleIconOpen = (app) => {
    openWindow(app.id, app.type, app.title, app.type === "iframe" ? { app } : {})
    addRecentApp(app)
  }

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    desktopRef.current?.focus({ preventScroll: true })  // keep keyboard focus on desktop
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    } else {
      setSelectedIds([id])
    }
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (document.activeElement && document.activeElement !== document.body && !desktopRef.current?.contains(document.activeElement)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.shiftKey && selectedIds.length) {
        e.preventDefault()
        selectedIds.forEach(id => {
          if (id.startsWith('fs:')) deleteNode(id.slice(3))
          else removeFromDesktop(id)
        })
        setSelectedIds([])
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey && selectedIds.length) {
        e.preventDefault()
        // Only FS items can be permanently deleted
        const fsIds = selectedIds.filter(id => id.startsWith('fs:'))
        if (fsIds.length) setConfirmDelete({ ids: fsIds })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedIds.length) {
        setClipboard({ type: 'copy', ids: [...selectedIds] })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedIds.length) {
        setClipboard({ type: 'cut', ids: [...selectedIds] })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault()
        clipboard.ids.forEach(id => {
          if (id.startsWith('fs:')) {
            const nodeId = id.slice(3)
            if (clipboard.type === 'cut') moveNode(nodeId, DESKTOP_FOLDER_ID)
            else copyNode(nodeId, DESKTOP_FOLDER_ID)
          }
        })
        if (clipboard.type === 'cut') setClipboard(null)
      }
      // F2 (Windows) / Enter (macOS) — rename selected FS item (system folders excluded)
      const _isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const isRenameKey = _isMac ? (e.key === 'Enter' || e.key === 'Return') : e.key === 'F2'
      if (isRenameKey && selectedIds.length === 1) {
        const fsId = selectedIds[0]
        if (fsId.startsWith('fs:')) {
          e.preventDefault()
          const node = findNode(useStore.getState().fsRoot, fsId.slice(3))
          const isSys = node?.type === 'folder' && node?.id === DESKTOP_FOLDER_ID
          if (node && !isSys) { setRenamingId(node.id); setRenameVal(node.name) }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, clipboard, removeFromDesktop, setClipboard, deleteNode, permanentDeleteNode, moveNode, copyNode])

  // ── Dialog keyboard handling (Escape = cancel; Enter/Space handled natively by focused button) ─
  useEffect(() => {
    if (!confirmDelete && !propertiesApp) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirmDelete) { setConfirmDelete(null); return }
        if (propertiesApp) { setPropertiesApp(null); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmDelete, propertiesApp])

  return (
    <div
      ref={desktopRef}
      className="desktop-bg absolute inset-0"
      tabIndex={-1}
      style={{ paddingBottom: 80, outline: 'none' }}
      onContextMenu={handleDesktopContextMenu}
      onClick={(e) => {
          if (didDrag.current) return
          // Treat any click that doesn't land on an icon, a context menu, or a dialog as empty space
          const isEmptySpace = !e.target.closest('[data-desktop-icon]')
                            && !e.target.closest('[data-context-menu]')
                            && !e.target.closest('[data-dialog]')
          if (isEmptySpace) {
            setSelectedIds([])
            if (windows.some(w => !w.minimized)) minimizeAll()
          }
        }}
      onMouseDown={handleMouseDown}
      onTouchStart={isTouchDevice ? handleDesktopTouchStart : undefined}
      onDragOver={!isTouchDevice ? e => { e.preventDefault(); setDropTarget('desktop') } : undefined}
      onDragLeave={!isTouchDevice ? e => { if (!desktopRef.current?.contains(e.relatedTarget)) setDropTarget(null) } : undefined}
      onDrop={!isTouchDevice ? e => {
        e.preventDefault()
        setDropTarget(null); setDraggingIds([])
        // App-shortcut reorder drops are handled by the icon divs — ignore here
        if (e.dataTransfer.getData(DND_APP_MIME)) return
        const raw = e.dataTransfer.getData(DND_FS_MIME)
        if (raw) {
          // Moving internal FS items back to the desktop folder
          try { JSON.parse(raw).forEach(id => moveNode(id, DESKTOP_FOLDER_ID)) } catch {}
          setSelectedIds([])
          return
        }
        // External OS files dragged from Finder/Explorer
        if (e.dataTransfer.files?.length) {
          // External drop from OS — block for guests
    if (!isGuest && e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files, DESKTOP_FOLDER_ID)
    }
        }
      } : undefined}
    >
      {/* Desktop app shortcut icons + FS icons */}
      {!hideIcons && (
      <div className="absolute" style={{
          left: 20, top: 24, bottom: 96,
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: '4px 4px',
        }}>
        {apps.map((app) => {
          const isSel = selectedIds.includes(app.id)
          const isCatalog = app.type === "iframe"
          const isDraggingApp = dragAppId === app.id
          const isDropOverApp = dropOverAppId === app.id && dragAppId !== app.id
          return (
            <motion.div
              key={app.id}
              data-desktop-icon
              data-icon-id={app.id}
              ref={el => iconRefs.current[app.id] = el}
              className="flex flex-col items-center justify-start pt-2 gap-1.5 cursor-pointer w-20"
              draggable={!isTouchDevice}
              onDragStart={!isTouchDevice ? e => {
                setDragAppId(app.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData(DND_APP_MIME, app.id)
              } : undefined}
              onDragEnd={!isTouchDevice ? () => { setDragAppId(null); setDropOverAppId(null) } : undefined}
              onDragOver={!isTouchDevice ? e => { e.preventDefault(); e.stopPropagation(); setDropOverAppId(app.id) } : undefined}
              onDragLeave={!isTouchDevice ? e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOverAppId(null) } : undefined}
              onDrop={!isTouchDevice ? e => {
                e.preventDefault(); e.stopPropagation()
                const fromId = e.dataTransfer.getData(DND_APP_MIME)
                if (fromId && fromId !== app.id) reorderDesktopItem(fromId, app.id)
                setDragAppId(null); setDropOverAppId(null)
              } : undefined}
              style={{ opacity: isDraggingApp ? 0.35 : 1, transition: 'opacity 0.15s', height: 96, flexShrink: 0 }}
              onClick={(e) => toggleSelect(e, app.id)}
              onDoubleClick={() => handleIconOpen(app)}
              onContextMenu={(e) => handleIconContextMenu(e, app)}
              whileTap={{ scale: 0.93 }}
            >
              <div className="rounded-2xl transition-all duration-150 p-0.5"
                style={{ outline: isDropOverApp ? '2px solid rgba(var(--nova-accent-rgb,130,80,255),0.6)' : isSel ? "2px solid rgba(var(--nova-accent-rgb,130,80,255),0.8)" : "none", outlineOffset: 2, background: isDropOverApp ? 'rgba(var(--nova-accent-rgb,130,80,255),0.12)' : isSel ? "rgba(var(--nova-accent-rgb,130,80,255),0.18)" : "transparent" }}>
                {isCatalog ? <CatalogTile app={app} size={52} /> : <AppTile app={app} size={52} />}
              </div>
              <span className="text-white text-[11px] font-medium text-center leading-tight w-full line-clamp-2 px-1 rounded"
                title={app.title}
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)", background: isSel ? "rgba(var(--nova-accent-rgb,130,80,255),0.4)" : "transparent" }}>
                {app.title}
              </span>
            </motion.div>
          )
        })}

        {/* FS file/folder items in the Desktop folder */}
        {desktopFsItems.map((node) => {
          const fsId = 'fs:' + node.id
          const isSel = selectedIds.includes(fsId)
          const isDraggingThis = draggingIds.includes(node.id)
          const isDropTgt = node.type === 'folder' && dropTarget === node.id
          const isRenaming = renamingId === node.id
          return (
            <motion.div
              key={node.id}
              data-desktop-icon
              data-icon-id={fsId}
              draggable={!isRenaming && !isTouchDevice}
              onDragStart={!isTouchDevice ? e => {
                const ids = selectedIds.filter(id => id.startsWith('fs:'))
                  .map(id => id.slice(3))
                const dragIds = ids.includes(node.id) ? ids : [node.id]
                setDraggingIds(dragIds)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData(DND_FS_MIME, JSON.stringify(dragIds))
              } : undefined}
              onDragEnd={!isTouchDevice ? () => { setDraggingIds([]); setDropTarget(null) } : undefined}
              onDragOver={node.type === 'folder' && !isTouchDevice ? (e => { e.preventDefault(); e.stopPropagation(); setDropTarget(node.id) }) : undefined}
              onDragLeave={node.type === 'folder' && !isTouchDevice ? (e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }) : undefined}
              onDrop={node.type === 'folder' && !isTouchDevice ? (e => {
                e.preventDefault(); e.stopPropagation()
                setDropTarget(null); setDraggingIds([])
                const raw = e.dataTransfer.getData(DND_FS_MIME)
                if (raw) {
                  try { JSON.parse(raw).filter(id => id !== node.id).forEach(id => moveNode(id, node.id)) } catch {}
                  setSelectedIds([])
                } else if (e.dataTransfer.files?.length) {
                  // External drop into a folder icon — block for guests
    if (!isGuest && e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files, node.id)
    }
                }
              }) : undefined}
              className="flex flex-col items-center justify-start pt-2 gap-1.5 cursor-pointer w-20"
              style={{ opacity: isDraggingThis ? 0.35 : 1, transition: 'opacity 0.15s', height: 96, flexShrink: 0 }}
              onClick={(e) => { if (!isRenaming) toggleSelect(e, fsId) }}
              onDoubleClick={() => { if (!isRenaming) handleFsItemOpen(node) }}
              onContextMenu={(e) => handleFsItemContextMenu(e, node)}
              whileTap={{ scale: 0.93 }}
            >
              <div className="rounded-2xl transition-all duration-150 p-0.5"
                style={{
                  outline: isDropTgt ? '2px solid rgba(59,130,246,0.8)' : isSel ? '2px solid rgba(var(--nova-accent-rgb,130,80,255),0.8)' : 'none',
                  outlineOffset: 2,
                  background: isDropTgt ? 'rgba(59,130,246,0.22)' : isSel ? 'rgba(var(--nova-accent-rgb,130,80,255),0.18)' : 'transparent',
                }}>
                <FsItemIcon node={node} size={52} />
              </div>
              {isRenaming ? (
                <input
                  autoFocus
                  className="text-white text-[11px] text-center w-20 bg-transparent outline outline-1 outline-violet-400 rounded px-1 mt-0.5"
                  style={{ textShadow: 'none', background: 'rgba(20,20,36,0.85)' }}
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); commitRename() }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenamingId(null) }
                  }}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="text-white text-[11px] font-medium text-center leading-tight w-full line-clamp-2 px-1 rounded"
                  title={node.name}
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)', background: isSel ? 'rgba(var(--nova-accent-rgb,130,80,255),0.4)' : 'transparent' }}>
                  {node.name}
                </span>
              )}
            </motion.div>
          )
        })}
      </div>
      )}

      {/* Rubber-band selection rect */}
      {selRect && (
        <div style={{
          position: "fixed",
          left: selRect.left, top: selRect.top,
          width: selRect.right - selRect.left, height: selRect.bottom - selRect.top,
          background: "rgba(130,80,255,0.12)", border: "1px solid rgba(130,80,255,0.6)",
          borderRadius: 4, pointerEvents: "none", zIndex: 100,
        }} />
      )}

      {/* Permanent delete confirmation dialog */}
      {confirmDelete && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div data-dialog className="rounded-2xl p-5 w-80 text-sm" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,80,80,0.3)" }}>
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
                confirmDelete.ids.forEach(id => permanentDeleteNode(id.slice(3)))
                setSelectedIds([])
                setConfirmDelete(null)
              }}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{ background: "rgba(239,68,68,0.7)" }}>Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* App / FS item Properties dialog */}
      {propertiesApp && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setPropertiesApp(null)}>
          <div data-dialog className="rounded-2xl p-5 w-72 text-sm" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-white text-base mb-4">Properties</div>
            <div className="flex flex-col gap-2 text-white/70">
              {propertiesApp.type === 'app' ? (
                <>
                  <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Name</span><span className="text-white break-all">{propertiesApp.app.title}</span></div>
                  <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Type</span><span className="text-white">{propertiesApp.app.type === 'iframe' ? 'Web Application' : 'Application'}</span></div>
                  {propertiesApp.app.description && <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">About</span><span className="text-white text-[12px] leading-snug">{propertiesApp.app.description}</span></div>}
                </>
              ) : (
                <>
                  <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Name</span><span className="text-white break-all">{propertiesApp.node.name}</span></div>
                  <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Type</span><span className="text-white capitalize">{propertiesApp.node.type}</span></div>
                  {propertiesApp.node.type === 'file' && <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Size</span><span className="text-white">{propertiesFsSize === undefined ? 'Loading…' : fmtBytes(propertiesFsSize ?? propertiesApp.node.size)}</span></div>}
                  {propertiesApp.node.type === 'folder' && <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Contents</span><span className="text-white">{(propertiesApp.node.children || []).length} items</span></div>}
                  <div className="flex gap-2"><span className="text-white/40 w-20 flex-shrink-0">Modified</span><span className="text-white">{new Date(propertiesApp.node.updatedAt).toLocaleString()}</span></div>
                </>
              )}
            </div>
            <button onClick={() => setPropertiesApp(null)}
              className="mt-4 w-full py-1.5 rounded-lg text-sm font-medium text-white transition-all"
              style={{ background: "rgba(130,80,255,0.5)" }}>Close</button>
          </div>
        </div>
      )}

      {/* ── URL creation dialog ── */}
      {urlDialog && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setUrlDialog(null)}>
          <div data-dialog className="rounded-2xl p-5 w-80 text-sm"
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
                  onKeyDown={e => {
                    if (e.key === "Escape") { setUrlDialog(null); return }
                    if (e.key === "Enter") e.currentTarget.closest("[data-url-form]")?.querySelector("[data-create-btn]")?.click()
                  }} />
              </div>
              <div>
                <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">
                  Display name <span className="normal-case text-white/30">(optional)</span>
                </label>
                <input type="text" placeholder="e.g. GitHub"
                  value={urlDialog.name}
                  onChange={e => setUrlDialog(d => ({ ...d, name: e.target.value }))}
                  className="w-full text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/15 focus:border-violet-400/50"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setUrlDialog(null); return }
                    if (e.key === "Enter") e.currentTarget.closest("[data-url-form]")?.querySelector("[data-create-btn]")?.click()
                  }} />
              </div>
            </div>
            <div className="flex gap-2 mt-4" data-url-form="">
              <button onClick={() => setUrlDialog(null)}
                className="flex-1 py-1.5 rounded-lg text-sm text-white/60"
                style={{ background: "rgba(255,255,255,0.08)" }}>Cancel</button>
              <button data-create-btn
                onClick={() => {
                  const trimmed = urlDialog.url.trim()
                  if (!trimmed || trimmed === "https://") return
                  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
                  let siteName = urlDialog.name.trim()
                  if (!siteName) {
                    try {
                      const u = new URL(href)
                      siteName = u.hostname.replace(/^www\./, "") || "link"
                    } catch { siteName = "link" }
                  }
                  createNode(DESKTOP_FOLDER_ID, "file", siteName + ".url", `[InternetShortcut]\nURL=${href}\n`)
                  setUrlDialog(null)
                }}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "rgba(130,80,255,0.6)" }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload progress toasts ── */}
      {uploads.length > 0 && (
        <div className="absolute bottom-24 right-4 z-[200] flex flex-col gap-1.5 w-64 pointer-events-none">
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
  )
}
