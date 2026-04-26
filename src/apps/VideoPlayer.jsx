import { useRef, useState, useEffect, useCallback } from "react"
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Download,
  SkipBack, SkipForward, FolderOpen, Trash2, RepeatIcon,
  PictureInPicture2, Gauge, HardDrive, X as XIcon,
} from "lucide-react"
import { useStore, findNode } from "../store/useStore"
import { fsRawUrl } from "../utils/db"

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, "0")
  return `${m}:${sec}`
}

const VID_EXTS = ["mp4", "webm", "ogg", "mov"]
const UNSUPPORTED_EXTS = ["mkv", "avi", "flv", "wmv"]
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

// Convert a data URI to a blob URL.
// Uses fetch() for efficiency (browser's C++ handles base64 decode).
// Reconstructs a clean data URI first, because MIME types from MediaRecorder often
// contain commas in codec params (e.g. 'video/webm;codecs=vp9,opus'), which break
// the data URI format — parsers split at the first comma, corrupting the data.
async function dataUriToBlobUrl(dataUri) {
  try {
    // Find the real base64 boundary (';base64,') regardless of commas in the MIME type
    const sep = dataUri.indexOf(';base64,')
    let uriToFetch = dataUri
    if (sep !== -1) {
      const cleanMime = dataUri.slice(5, sep).split(';')[0]  // strip codec params
      const b64Data   = dataUri.slice(sep + 8)               // everything after ';base64,'
      uriToFetch = `data:${cleanMime};base64,${b64Data}`
    }
    const res  = await fetch(uriToFetch)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch { return null }
}

function collectVideoNodes(node, out = []) {
  if (!node) return out
  if (node.type === 'file') {
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    if ([...VID_EXTS, ...UNSUPPORTED_EXTS].includes(ext)) out.push(node)
  }
  for (const c of (node.children || [])) collectVideoNodes(c, out)
  return out
}

function TBtn({ onClick, title, children, active, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={["p-1.5 rounded-lg transition-colors flex items-center gap-1",
        disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-white/10 cursor-pointer",
        active ? "text-white" : "text-white/60 hover:text-white"].join(" ")}>
      {children}
    </button>
  )
}

export default function VideoPlayer({ windowId, context }) {
  const fsRoot            = useStore(s => s.fsRoot)
  const deleteNode        = useStore(s => s.deleteNode)
  const closeWindow       = useStore(s => s.closeWindow)
  const updateWindowTitle = useStore(s => s.updateWindowTitle)

  // ── ALL hooks must be declared unconditionally before any early returns ──
  const [currentFileId, setCurrentFileId] = useState(context?.fileId || null)
  const [localSrc, setLocalSrc]   = useState(null)   // src from local device open
  const [localName, setLocalName] = useState(null)
  const blobUrlRef  = useRef(null)
  const videoRef    = useRef(null)
  const rootRef     = useRef(null)

  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [current,      setCurrent]      = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [seeking,      setSeeking]      = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const [loop,         setLoop]         = useState(false)
  const [showSpeed,    setShowSpeed]    = useState(false)
  const [confirmDel,   setConfirmDel]   = useState(false)
  const [showFsPicker, setShowFsPicker] = useState(false)

  // Revoke blob URL on unmount (only used for locally-opened device files)
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }, [])

  // When src changes, reload and autoplay
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return   // src computed below, but effect runs after render so it's fine
    v.load()
    v.play().then(() => setPlaying(true)).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSrc, currentFileId])

  useEffect(() => {
    if (videoRef.current) { videoRef.current.playbackRate = speed; videoRef.current.loop = loop }
  }, [speed, loop])

  // Auto-focus the player so keyboard shortcuts work immediately
  useEffect(() => { rootRef.current?.focus() }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    const mod   = isMac ? e.metaKey : e.ctrlKey
    const v     = videoRef.current

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault()
        if (!v) break
        if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
        break
      // ← Cmd/Ctrl+← = -30s, plain ← = -10s
      case 'ArrowLeft':
        e.preventDefault()
        if (v) v.currentTime = Math.max(0, v.currentTime - (mod ? 30 : 10))
        break
      // → Cmd/Ctrl+→ = +30s, plain → = +10s
      case 'ArrowRight':
        e.preventDefault()
        if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + (mod ? 30 : 10))
        break
      case 'ArrowUp': {
        e.preventDefault()
        if (!v) break
        const nvu = Math.min(1, parseFloat((v.volume + 0.1).toFixed(2)))
        v.volume = nvu; setVolume(nvu); setMuted(false)
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (!v) break
        const nvd = Math.max(0, parseFloat((v.volume - 0.1).toFixed(2)))
        v.volume = nvd; setVolume(nvd); if (nvd === 0) setMuted(true)
        break
      }
      case 'm':
      case 'M':
        e.preventDefault()
        if (!v) break
        v.muted = !v.muted; setMuted(v.muted)
        if (videoRef.current) setVolume(v.muted ? 0 : v.volume)
        break
      case 'f':
      case 'F':
        if (!mod) { e.preventDefault(); v?.requestFullscreen?.() }
        break
      case 'l':
      case 'L':
        e.preventDefault()
        setLoop(lv => !lv)
        break
      default: break
    }
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────
  // For OS filesystem files: use the raw streaming URL so the browser receives
  // real bytes over HTTP with range support (no JS heap allocation, no OOM).
  // For locally-opened device files: use the blob URL created by the file picker.
  const fileName  = localName || findNode(fsRoot, currentFileId)?.name || context?.title || ""
  const ext       = fileName.split('.').pop()?.toLowerCase() || ""
  const isUnsupported = UNSUPPORTED_EXTS.includes(ext)

  const src = localSrc
    ? localSrc
    : currentFileId
    ? fsRawUrl(currentFileId, fileName)
    : null
  const isEmpty = false  // raw URL is always valid if we have a fileId

  const fsVideoFiles = collectVideoNodes(fsRoot)

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }
  const skip = (secs) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + secs, duration))
  }
  const seek = (e) => {
    const v = videoRef.current; if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * duration
    v.currentTime = t; setCurrent(t)
  }
  const handleVolume = (e) => {
    const val = parseFloat(e.target.value); setVolume(val)
    if (videoRef.current) videoRef.current.volume = val
    setMuted(val === 0)
  }
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !muted; setMuted(!muted)
  }
  const fullscreen = () => { const v = videoRef.current; if (v?.requestFullscreen) v.requestFullscreen() }
  const pip = async () => {
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else if (videoRef.current?.requestPictureInPicture) await videoRef.current.requestPictureInPicture()
    } catch {}
  }
  const download = () => {
    if (!src) return
    const a = document.createElement("a"); a.href = src; a.download = fileName || "video.mp4"; a.click()
  }
  const handleDelete = () => {
    if (currentFileId) { deleteNode(currentFileId); if (windowId) closeWindow(windowId) }
    setConfirmDel(false)
  }
  const openFile = () => {
    const input = document.createElement("input"); input.type = "file"
    input.accept = VID_EXTS.map(e => `.${e}`).join(",") + "," + UNSUPPORTED_EXTS.map(e => `.${e}`).join(",")
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return
      // Revoke previous blob URL to free memory
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
      const blobUrl = URL.createObjectURL(file)
      blobUrlRef.current = blobUrl
      setLocalSrc(blobUrl); setLocalName(file.name); setCurrentFileId(null)
      setCurrent(0); setDuration(0); setPlaying(false)
      if (windowId) updateWindowTitle(windowId, file.name)
    }
    input.click()
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0

  // ── Helper: the OS file picker overlay (used in all states) ───────────
  const FsPickerOverlay = showFsPicker && (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.97)' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
        <div>
          <div className="text-white font-semibold text-[13px]">Browse OS Files</div>
          <div className="text-white/40 text-[11px]">{fsVideoFiles.length} video file{fsVideoFiles.length !== 1 ? 's' : ''} found</div>
        </div>
        <button onClick={() => setShowFsPicker(false)}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all">
          <XIcon size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {fsVideoFiles.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <div className="text-5xl">🎬</div>
            <div className="text-white/35 text-[13px] text-center">
              No video files in OS filesystem.<br />Use "Open" to upload from your device.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {fsVideoFiles.map(node => (
              <button key={node.id}
                onClick={() => {
                  const name = node.name
                  setCurrent(0); setDuration(0); setPlaying(false)
                  if (windowId) updateWindowTitle(windowId, name)
                  setShowFsPicker(false)
                  // Set fileId → raw streaming URL is computed from it
                  setCurrentFileId(node.id); setLocalSrc(null); setLocalName(null)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/10"
                style={{ background: currentFileId === node.id ? 'rgba(130,80,255,0.2)' : 'rgba(255,255,255,0.04)' }}>
                <span className="text-lg flex-shrink-0">🎬</span>
                <span className="text-white text-[13px] truncate">{node.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Single return — all states rendered inside one focusable root ───────
  return (
    <div ref={rootRef} className="flex flex-col h-full relative outline-none" style={{ background: "#000" }}
      tabIndex={-1} onKeyDown={handleKeyDown}>

      {/* ── Unsupported format ─────────────────────────────────────── */}
      {isUnsupported && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
          <div className="text-5xl">🎬</div>
          <div className="text-white/60 text-sm font-medium">Format not supported by browser</div>
          <div className="text-white/35 text-xs text-center">.{ext.toUpperCase()} files cannot be played natively.<br/>Supported: MP4, WebM, OGG, MOV</div>
          <button onClick={openFile} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white mt-1"
            style={{ background: "rgba(130,80,255,0.5)" }}><FolderOpen size={14} /> Open Different File</button>
        </div>
      )}

      {/* ── Empty / no-video state ─────────────────────────────────── */}
      {!isUnsupported && !src && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div className="text-5xl">🎬</div>
          <div className="text-white/50 text-sm">No video to display.</div>
          <div className="flex gap-2">
            <button onClick={openFile} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white"
              style={{ background: "rgba(130,80,255,0.5)" }}><FolderOpen size={14} /> Open Video</button>
            <button onClick={() => setShowFsPicker(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm text-white/70"
              style={{ background: "rgba(255,255,255,0.1)" }}><HardDrive size={14} /> OS Files</button>
          </div>
        </div>
      )}

      {/* ── Full player ───────────────────────────────────────────── */}
      {!isUnsupported && src && (
        <>
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,8,16,0.95)" }}>
        <TBtn onClick={openFile} title="Open video file"><FolderOpen size={13} /><span className="text-[11px]">Open</span></TBtn>
        <TBtn onClick={() => setShowFsPicker(true)} title="Open from OS Files"><HardDrive size={13} /><span className="text-[11px]">OS Files</span></TBtn>
        <div className="w-px h-4 mx-0.5" style={{ background: "rgba(255,255,255,0.12)" }} />
        <TBtn onClick={download} title="Download"><Download size={13} /></TBtn>
        <TBtn onClick={pip}      title="Picture-in-Picture"><PictureInPicture2 size={13} /></TBtn>
        <TBtn onClick={fullscreen} title="Fullscreen (F)"><Maximize2 size={13} /></TBtn>
        <div className="w-px h-4 mx-0.5" style={{ background: "rgba(255,255,255,0.12)" }} />
        {/* Speed selector */}
        <div className="relative">
          <TBtn onClick={() => setShowSpeed(v => !v)} title="Playback speed" active={speed !== 1}>
            <Gauge size={13} /><span className="text-[11px] tabular-nums">{speed}x</span>
          </TBtn>
          {showSpeed && (
            <div className="absolute top-full mt-1 left-0 rounded-xl overflow-hidden z-50 shadow-xl"
              style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,255,255,0.12)", minWidth: 72 }}>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; setShowSpeed(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-white/10 transition-colors tabular-nums"
                  style={{ color: speed === s ? "var(--nova-accent,#7c3aed)" : "rgba(255,255,255,0.7)" }}>
                  {s}x {s === 1 ? "(Normal)" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <TBtn onClick={() => setLoop(v => !v)} title="Loop (L)" active={loop}><RepeatIcon size={13} /></TBtn>
        <div className="flex-1" />
        <TBtn onClick={() => currentFileId && setConfirmDel(true)} disabled={!currentFileId} title="Delete file">
          <Trash2 size={13} className="text-red-400" />
        </TBtn>
      </div>

      {/* ── Video ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black cursor-pointer"
        onClick={togglePlay} onDoubleClick={fullscreen}>
        <video ref={videoRef} src={src} className="max-w-full max-h-full" style={{ objectFit: "contain" }}
          onTimeUpdate={(e) => { if (!seeking) setCurrent(e.target.currentTime) }}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onEnded={() => { if (!loop) setPlaying(false) }}
        />
      </div>

      {/* ── Controls ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-3 pt-2"
        style={{ background: "rgba(0,0,0,0.88)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Progress */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white/45 text-[11px] tabular-nums w-10">{formatTime(current)}</span>
          <div className="flex-1 h-1.5 rounded-full cursor-pointer relative group"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={seek}
            onMouseDown={() => setSeeking(true)}
            onMouseUp={() => setSeeking(false)}>
            <div className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--nova-accent, #7c3aed)", transition: seeking ? "none" : "width 0.1s linear" }} />
          </div>
          <span className="text-white/45 text-[11px] tabular-nums w-10 text-right">{formatTime(duration)}</span>
        </div>
        {/* Buttons */}
        <div className="flex items-center gap-1">
          <button onClick={() => skip(-10)} title="Rewind 10s (←)" className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
            <SkipBack size={16} />
          </button>
          <button onClick={togglePlay} title="Play/Pause (Space)"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 flex-shrink-0">
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button onClick={() => skip(10)} title="Forward 10s (→)" className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
            <SkipForward size={16} />
          </button>
          <button onClick={toggleMute} title="Mute (M)" className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white ml-1">
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolume}
            className="w-20" style={{ accentColor: "var(--nova-accent, #7c3aed)" }} />
        </div>
      </div>

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      {confirmDel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="rounded-2xl p-5 w-72" style={{ background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,80,80,0.3)" }}>
            <div className="font-semibold text-white text-base mb-2">Delete Video?</div>
            <p className="text-white/50 text-[13px] mb-5">"{fileName}" will be moved to Trash.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(false)} className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white/70"
                style={{ background: "rgba(255,255,255,0.08)" }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "rgba(239,68,68,0.7)" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── OS File Picker overlay ─────────────────────────────────── */}
      {FsPickerOverlay}
        </>
      )}

      {/* ── OS File Picker overlay for empty/unsupported states ───── */}
      {(!src || isUnsupported) && FsPickerOverlay}
    </div>
  )
}
