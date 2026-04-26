import { useState, useCallback, useEffect, useRef } from "react"
import {
  ZoomIn, ZoomOut, RotateCw, RotateCcw, Download,
  Trash2, FolderOpen, Printer, Copy, ImageIcon,
  ChevronLeft, ChevronRight, Info, Minimize2,
  FlipHorizontal2, FlipVertical2, Star, HardDrive, X as XIcon,
} from "lucide-react"
import { useStore, findNode } from "../store/useStore"
import { fsRawUrl, fsUploadStream } from "../utils/db"

// Supported image extensions
const IMG_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "ico"]

function collectImageNodes(node, out = []) {
  if (!node) return out
  if (node.type === 'file') {
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    if (IMG_EXTS.includes(ext)) out.push(node)
  }
  for (const c of (node.children || [])) collectImageNodes(c, out)
  return out
}

function bakeTransform(img, rotateDeg, flipH, flipV, mimeType, quality = 0.92) {
  const w = img.naturalWidth, h = img.naturalHeight
  if (!w || !h) return null
  const rad = (rotateDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
  const cw = Math.round(w * cos + h * sin), ch = Math.round(w * sin + h * cos)
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate(rad)
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  ctx.drawImage(img, -w / 2, -h / 2)
  try { return canvas.toDataURL(mimeType, quality) } catch { return null }
}

function findParentId(root, targetId) {
  for (const child of root.children || []) {
    if (child.id === targetId) return root.id
    const found = findParentId(child, targetId)
    if (found) return found
  }
  return null
}

function TBtn({ onClick, title, children, disabled, active }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={[
        "p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[12px]",
        disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-white/12 cursor-pointer",
        active ? "bg-white/15 text-white" : "text-white/60 hover:text-white",
      ].join(" ")}>
      {children}
    </button>
  )
}

export default function PhotoViewer({ windowId, context }) {
  const updateNodeSize    = useStore(s => s.updateNodeSize)
  const writeFile          = useStore(s => s.writeFile)
  useStore(s => s._fileCacheVersion) // re-render when any file loads into cache
  const fsRoot            = useStore(s => s.fsRoot)
  const listDir           = useStore(s => s.listDir)
  const deleteNode        = useStore(s => s.deleteNode)
  const closeWindow       = useStore(s => s.closeWindow)
  const updateWindowTitle = useStore(s => s.updateWindowTitle)
  const updateSettings    = useStore(s => s.updateSettings)

  const [currentFileId, setCurrentFileId] = useState(context?.fileId || null)
  const [localSrc, setLocalSrc]   = useState(null)
  const [localName, setLocalName] = useState(null)
  const [zoom, setZoom]     = useState(1)
  const [rotate, setRotate] = useState(0)
  const [flipH, setFlipH]   = useState(false)
  const [flipV, setFlipV]   = useState(false)
  const [fitMode, setFitMode] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [imgDims, setImgDims]   = useState(null)
  const [starred, setStarred]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [showFsPicker, setShowFsPicker] = useState(false)
  const [pauseTransition, setPauseTransition] = useState(false)

  const saveTimerRef = useRef(null)
  const imgRef       = useRef(null)

  // fsRawSrc is computed asynchronously so that stale-tree race conditions are handled.
  // When fsRoot changes (e.g. after dbInit completes on re-login), the effect re-fires
  // and finds the node, producing a fresh URL with the current JWT.
  const [fsRawSrc, setFsRawSrc] = useState(null)
  useEffect(() => {
    if (!currentFileId || localSrc) { setFsRawSrc(null); return }
    const node = findNode(fsRoot, currentFileId)
    if (node) {
      setFsRawSrc(fsRawUrl(currentFileId, node.name))
    }
    // If node isn't in the tree yet, leave fsRawSrc as null — will retry when fsRoot updates
  }, [currentFileId, fsRoot, localSrc])

  const rawSrc = localSrc ?? fsRawSrc
  const isValidSrc = rawSrc && (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('/api/'))
  const src    = isValidSrc ? rawSrc : null
  const isEmpty = false  // never show "empty" for FS files — wait for tree to load instead

  const parentId = currentFileId ? (context?.parentId || findParentId(fsRoot, currentFileId)) : null
  const siblings = parentId ? listDir(parentId).filter(n => IMG_EXTS.includes((n.name.split('.').pop() || '').toLowerCase())) : []
  const currentIdx = siblings.findIndex(n => n.id === currentFileId)
  const prevNode = currentIdx > 0 ? siblings[currentIdx - 1] : null
  const nextNode = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null

  const goTo = useCallback((node) => {
    setCurrentFileId(node.id); setLocalSrc(null); setLocalName(null)
    setZoom(1); setRotate(0); setFlipH(false); setFlipV(false); setFitMode(true)
    if (windowId) updateWindowTitle(windowId, node.name)
  }, [windowId, updateWindowTitle])

  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (e.key === "ArrowLeft"  && prevNode) goTo(prevNode)
      if (e.key === "ArrowRight" && nextNode) goTo(nextNode)
      if ((e.key === "+" || e.key === "=") && !e.ctrlKey) { setFitMode(false); setZoom(z => Math.min(z + 0.25, 8)) }
      if (e.key === "-" && !e.ctrlKey) setZoom(z => Math.max(z - 0.25, 0.1))
      if (e.key === "0") { setZoom(1); setFitMode(true) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [prevNode, nextNode, goTo])

  // Auto-save: bake rotate/flip into the actual pixels just after the CSS transition completes.
  // We fetch the image as a blob so the canvas draw is always same-origin (no taint / black image).
  useEffect(() => {
    if (!currentFileId || !src) return
    if (rotate === 0 && !flipH && !flipV) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    // Capture current values — they must not change between now and the async bake
    const capturedSrc = src, capturedRotate = rotate, capturedFlipH = flipH, capturedFlipV = flipV
    saveTimerRef.current = setTimeout(() => {
      ;(async () => {
        try {
          const ext     = (currentName || '').split('.').pop()?.toLowerCase() || 'jpg'
          const mime    = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          // Fetch image bytes → object URL (always same-origin → canvas never taints → no black JPEG)
          const res = await fetch(capturedSrc, { credentials: 'include' })
          if (!res.ok) return
          const blobUrl = URL.createObjectURL(await res.blob())
          const img = await new Promise((ok, fail) => {
            const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = blobUrl
          })
          URL.revokeObjectURL(blobUrl)
          const dataUrl = bakeTransform(img, capturedRotate, capturedFlipH, capturedFlipV, mime)
          if (!dataUrl) return
          writeFile(currentFileId, dataUrl)
          updateNodeSize(currentFileId, Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75))
          // pauseTransition + state resets are batched in one render so the reset has no animation
          setPauseTransition(true)
          setLocalSrc(dataUrl)
          setRotate(0); setFlipH(false); setFlipV(false)
          requestAnimationFrame(() => requestAnimationFrame(() => setPauseTransition(false)))
        } catch { /* fetch failed or component unmounted — ignore */ }
      })()
    }, 150) // 150ms: just after the 120ms CSS transition finishes
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [rotate, flipH, flipV, currentFileId]) // eslint-disable-line

  const currentName = localName || findNode(fsRoot, currentFileId)?.name || "Photo Viewer"

  const download = () => {
    if (!src) return
    const a = document.createElement("a"); a.href = src; a.download = currentName; a.click()
  }
  const print = () => {
    if (!src) return
    const w = window.open("", "_blank")
    w.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${src}" style="max-width:100%;max-height:100vh" onload="window.print()"/></body></html>`)
    w.document.close()
  }
  const copyToClipboard = async () => {
    if (!src) return
    try {
      const res = await fetch(src); const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch { try { await navigator.clipboard.writeText(src) } catch {} }
  }
  const setAsWallpaper = () => { if (src) updateSettings({ customWallpaper: src }) }
  const handleDelete = () => {
    if (!currentFileId) { setConfirmDel(false); return }
    deleteNode(currentFileId)
    const remaining = siblings.filter(n => n.id !== currentFileId)
    if (remaining.length > 0) goTo(remaining[Math.min(Math.max(currentIdx, 0), remaining.length - 1)])
    else if (windowId) closeWindow(windowId)
    setConfirmDel(false)
  }
  // openFile: import from device into an existing FS node or as an in-memory local image
  const openFile = () => {
    const input = document.createElement("input")
    input.type = "file"; input.accept = IMG_EXTS.map(e => `.${e}`).join(",")
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return
      if (currentFileId) {
        // Overwrite the existing FS node with raw bytes (no base64 encoding)
        fsUploadStream(currentFileId, file, null, null)
          .then(() => updateNodeSize(currentFileId, file.size))
          .catch(() => {})
        if (windowId) updateWindowTitle(windowId, file.name)
        setZoom(1); setRotate(0); setFlipH(false); setFlipV(false); setFitMode(true)
        // Re-derive fsRawSrc after upload by creating a temporary object URL for immediate preview
        const objUrl = URL.createObjectURL(file)
        setLocalSrc(objUrl)
      } else {
        // No FS node — just show in-memory via object URL
        const objUrl = URL.createObjectURL(file)
        setLocalSrc(objUrl); setLocalName(file.name); setCurrentFileId(null)
        setZoom(1); setRotate(0); setFlipH(false); setFlipV(false); setFitMode(true)
        if (windowId) updateWindowTitle(windowId, file.name)
      }
    }
    input.click()
  }

  const fsImageFiles = collectImageNodes(fsRoot)

  const Divider = () => <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />

  return (
    <div className="flex flex-col h-full select-none" style={{ background: "#0a0a12" }}>

      {/* ── OS Files picker overlay ─────────────────────────────────── */}
      {showFsPicker && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.97)' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
            <div>
              <div className="text-white font-semibold text-[13px]">Browse OS Files</div>
              <div className="text-white/40 text-[11px]">{fsImageFiles.length} image file{fsImageFiles.length !== 1 ? 's' : ''} found</div>
            </div>
            <button onClick={() => setShowFsPicker(false)}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all">
              <XIcon size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {fsImageFiles.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <div className="text-5xl">🖼️</div>
                <div className="text-white/35 text-[13px] text-center">
                  No image files in OS filesystem.<br />Use “Open” to import from your device.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {fsImageFiles.map(node => (
                  <button key={node.id}
                    onClick={() => {
                      setCurrentFileId(node.id); setLocalSrc(null); setLocalName(null)
                      setZoom(1); setRotate(0); setFlipH(false); setFlipV(false); setFitMode(true)
                      if (windowId) updateWindowTitle(windowId, node.name)
                      setShowFsPicker(false)
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/10"
                    style={{ background: currentFileId === node.id ? 'rgba(130,80,255,0.2)' : 'rgba(255,255,255,0.04)' }}>
                    <span className="text-lg flex-shrink-0">🖼️</span>
                    <span className="text-white text-[13px] truncate">{node.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(12,12,22,0.95)", minHeight: 38 }}>

        <TBtn onClick={() => prevNode && goTo(prevNode)} disabled={!prevNode} title="Previous (←)"><ChevronLeft size={14} /></TBtn>
        <TBtn onClick={() => nextNode && goTo(nextNode)} disabled={!nextNode} title="Next (→)"><ChevronRight size={14} /></TBtn>
        {siblings.length > 1 && <span className="text-white/30 text-[10px] px-1 tabular-nums">{currentIdx + 1}/{siblings.length}</span>}
        <Divider />
        {/* Show "Open from device" only when no image is loaded (empty/no-file state) */}
        {!src && <TBtn onClick={openFile} title="Import image from device"><FolderOpen size={14} /><span className="text-[11px]">Open</span></TBtn>}
        <TBtn onClick={() => setShowFsPicker(true)} title="Browse OS Files"><HardDrive size={14} /><span className="text-[11px]">OS Files</span></TBtn>
        <Divider />
        <TBtn onClick={() => { setFitMode(false); setZoom(z => Math.max(z - 0.25, 0.1)) }} disabled={!src} title="Zoom out (-)"><ZoomOut size={14} /></TBtn>
        <button onClick={() => { setZoom(1); setFitMode(v => !v) }} disabled={!src} title="Toggle Fit / Actual size"
          className="px-1.5 py-1 rounded-lg text-[10px] tabular-nums transition-colors hover:bg-white/10 disabled:opacity-30"
          style={{ color: fitMode ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.85)", minWidth: 36, textAlign: "center" }}>
          {fitMode ? "Fit" : `${Math.round(zoom * 100)}%`}
        </button>
        <TBtn onClick={() => { setFitMode(false); setZoom(z => Math.min(z + 0.25, 8)) }} disabled={!src} title="Zoom in (+)"><ZoomIn size={14} /></TBtn>
        <Divider />
        <TBtn onClick={() => setRotate(r => r - 90)} disabled={!src} title="Rotate left"><RotateCcw size={13} /></TBtn>
        <TBtn onClick={() => setRotate(r => r + 90)} disabled={!src} title="Rotate right"><RotateCw size={13} /></TBtn>
        <TBtn onClick={() => setFlipH(v => !v)} disabled={!src} title="Flip horizontal" active={flipH}><FlipHorizontal2 size={13} /></TBtn>
        <TBtn onClick={() => setFlipV(v => !v)} disabled={!src} title="Flip vertical" active={flipV}><FlipVertical2 size={13} /></TBtn>
        <Divider />
        <TBtn onClick={copyToClipboard} disabled={!src} title="Copy to clipboard"><Copy size={13} /></TBtn>
        <TBtn onClick={setAsWallpaper}  disabled={!src} title="Set as wallpaper"><ImageIcon size={13} /><span className="text-[11px]">Wallpaper</span></TBtn>
        <TBtn onClick={print}    disabled={!src} title="Print"><Printer size={13} /></TBtn>
        <TBtn onClick={download} disabled={!src} title="Download"><Download size={13} /></TBtn>
        <TBtn onClick={() => setStarred(v => !v)} disabled={!src} title="Favourite" active={starred}>
          <Star size={13} fill={starred ? "currentColor" : "none"} />
        </TBtn>
        <div className="flex-1" />
        <TBtn onClick={() => { setZoom(1); setRotate(0); setFlipH(false); setFlipV(false); setFitMode(true) }} disabled={!src} title="Reset view"><Minimize2 size={13} /></TBtn>
        <TBtn onClick={() => setShowInfo(v => !v)} disabled={!src} title="Image info" active={showInfo}><Info size={13} /></TBtn>
        <TBtn onClick={() => currentFileId && setConfirmDel(true)} disabled={!currentFileId} title="Delete">
          <Trash2 size={13} className="text-red-400" />
        </TBtn>
      </div>

      {/* ── Image area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-center justify-center relative" style={{ background: "#0a0a12" }}>
        {!src && !isEmpty && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-7xl">🖼️</div>
            <div className="text-white/50 text-sm">No image to display</div>
            <div className="flex gap-2 mt-1">
              <button onClick={openFile} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white"
                style={{ background: "rgba(130,80,255,0.5)" }}><FolderOpen size={14} /> Open from device</button>
              <button onClick={() => setShowFsPicker(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white/70"
                style={{ background: "rgba(255,255,255,0.1)" }}><HardDrive size={14} /> OS Files</button>
            </div>
          </div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-7xl">🖼️</div>
            <div className="text-white/50 text-sm">This image file is empty</div>
            <div className="flex gap-2 mt-1">
              <button onClick={openFile} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white"
                style={{ background: "rgba(130,80,255,0.5)" }}><FolderOpen size={14} /> Import from device</button>
              <button onClick={() => setShowFsPicker(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white/70"
                style={{ background: "rgba(255,255,255,0.1)" }}><HardDrive size={14} /> OS Files</button>
            </div>
          </div>
        )}
        {src && (
          <img ref={imgRef} src={src} alt={currentName} draggable={false}
            onLoad={e => setImgDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={{
              transform: [
                `scale(${fitMode ? 1 : zoom})`,
                `rotate(${rotate}deg)`,
                `scaleX(${flipH ? -1 : 1})`,
                `scaleY(${flipV ? -1 : 1})`,
              ].join(" "),
              transformOrigin: "center center",
              maxWidth: fitMode ? "100%" : "none",
              maxHeight: fitMode ? "100%" : "none",
              objectFit: "contain",
              transition: pauseTransition ? "none" : "transform 0.12s ease",
              imageRendering: (!fitMode && zoom > 2) ? "pixelated" : "auto",
              userSelect: "none",
            }}
          />
        )}
        {showInfo && src && imgDims && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl px-4 py-1.5 text-[11px] pointer-events-none"
            style={{ background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)" }}>
            {currentName} · {imgDims.w} × {imgDims.h} px
          </div>
        )}
      </div>

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      {confirmDel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="rounded-2xl p-5 w-72" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,80,80,0.3)" }}>
            <div className="font-semibold text-white text-base mb-2">Delete Image?</div>
            <p className="text-white/50 text-[13px] mb-5">"{currentName}" will be moved to Trash.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(false)} className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white/70"
                style={{ background: "rgba(255,255,255,0.08)" }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "rgba(239,68,68,0.7)" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
