import { useState, useRef, useEffect } from "react"
import { FlipHorizontal, Circle, Video, Camera as CameraIcon, X, Save, Download } from "lucide-react"
import { useStore } from "../store/useStore"
import { fsUploadStream } from "../utils/db"

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0")
  return `${m}:${(s % 60).toString().padStart(2, "0")}`
}

export default function Camera() {
  const videoRef   = useRef()
  const canvasRef  = useRef()
  const mrRef      = useRef()   // MediaRecorder for video
  const chunksRef  = useRef([])

  const [streamObj, setStreamObj] = useState(null)
  const [error, setError]         = useState(null)
  const [starting, setStarting]   = useState(true)
  const [mode, setMode]           = useState("photo")   // "photo" | "video"
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed]     = useState(0)
  const [mirrored, setMirrored]   = useState(true)
  const [photo, setPhoto]         = useState(null)      // data URL of last captured photo
  const [savedMsg, setSavedMsg]   = useState("")
  const timerRef = useRef(null)

  const createNodeEntry = useStore(s => s.createNodeEntry)
  const updateNodeSize  = useStore(s => s.updateNodeSize)
  const listDir    = useStore(s => s.listDir)

  const getPicturesId = () => {
    const roots = listDir("root")
    return roots.find(n => n.name === "Pictures" && n.type === "folder")?.id || "root"
  }

  const getVideosId = () => {
    const roots = listDir("root")
    return roots.find(n => n.name === "Videos" && n.type === "folder")?.id || "root"
  }

  useEffect(() => {
    let s
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then(stream => {
        s = stream
        setStreamObj(stream)
        setStarting(false)
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => { setError(err.message || "Camera/mic access denied"); setStarting(false) })
    return () => { if (s) s.getTracks().forEach(t => t.stop()); clearInterval(timerRef.current) }
  }, [])

  // ── Photo capture ────────────────────────────────────────────────────
  const capture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext("2d")
    if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0)
    const dataUri = canvas.toDataURL("image/png")
    setPhoto(dataUri)
    // Auto-save to Pictures as raw PNG bytes (no base64 encoding on disk)
    const fname = `Photo-${Date.now()}.png`
    canvas.toBlob(blob => {
      if (!blob) return
      const nodeId = createNodeEntry(getPicturesId(), fname)
      fsUploadStream(nodeId, blob, null, null)
        .then(() => updateNodeSize(nodeId, blob.size))
        .catch(() => {})
    }, "image/png")
    setSavedMsg(`Saved to Pictures: ${fname}`)
    setTimeout(() => setSavedMsg(""), 3000)
  }

  // ── Video recording ──────────────────────────────────────────────────
  const startVideo = () => {
    if (!streamObj) return
    chunksRef.current = []
    // Pick the best supported MIME type — Safari requires mp4, Chrome/Firefox prefer webm
    const mimeType =
      MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')  ? 'video/mp4'  :
      MediaRecorder.isTypeSupported('video/mp4')              ? 'video/mp4'  :
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')  ? 'video/webm' :
      MediaRecorder.isTypeSupported('video/webm')             ? 'video/webm' : ''
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const options = mimeType ? { mimeType } : {}
    const mr = new MediaRecorder(streamObj, options)
    mrRef.current = mr
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const rawMime = mr.mimeType || mimeType || 'video/mp4'
      const cleanMime = rawMime.split(';')[0]
      const blob = new Blob(chunksRef.current, { type: cleanMime })
      // Save raw video bytes directly — no base64/DataURL encoding
      const fname = `Video-${Date.now()}.${ext}`
      const nodeId = createNodeEntry(getVideosId(), fname)
      fsUploadStream(nodeId, blob, null, null)
        .then(() => updateNodeSize(nodeId, blob.size))
        .catch(() => {})
      setSavedMsg(`Saved to Videos: ${fname}`)
      setTimeout(() => setSavedMsg(""), 3000)
    }
    mr.start()
    setRecording(true)
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }

  const stopVideo = () => {
    mrRef.current?.stop()
    clearInterval(timerRef.current)
    setRecording(false)
  }

  const downloadPhoto = () => {
    if (!photo) return
    const a = document.createElement("a")
    a.href = photo
    a.download = `photo-${Date.now()}.png`
    a.click()
  }

  return (
    <div className="flex flex-col h-full text-white" style={{ background: "#0a0a10", fontFamily: "system-ui,sans-serif" }}>
      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-1 px-4 pt-3 flex-shrink-0">
        {["photo", "video"].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize"
            style={{ background: mode === m ? "rgba(130,80,255,0.7)" : "rgba(255,255,255,0.1)", color: mode === m ? "#fff" : "rgba(255,255,255,0.5)" }}>
            {m}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden my-3 mx-3 rounded-2xl bg-black">
        {starting && <div className="text-white/40 text-sm">Starting camera...</div>}
        {error && (
          <div className="text-center px-6">
            <div className="text-4xl mb-3">📷</div>
            <div className="text-white/60 text-sm mb-1">Camera unavailable</div>
            <div className="text-white/30 text-xs">{error}</div>
          </div>
        )}
        {!error && (
          <video ref={videoRef} autoPlay playsInline muted
            className="w-full h-full object-contain"
            style={{ transform: mirrored ? "scaleX(-1)" : "none" }} />
        )}
        {/* Photo preview overlay */}
        {photo && mode === "photo" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <img src={photo} alt="captured" className="max-w-full max-h-full object-contain" />
            <button onClick={() => setPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              <X size={16} className="text-white" />
            </button>
          </div>
        )}
        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.85)" }}>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-white text-xs font-mono">{formatTime(elapsed)}</span>
          </div>
        )}
        {/* Save message */}
        {savedMsg && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <div className="px-3 py-1.5 rounded-full text-xs text-white" style={{ background: "rgba(16,185,129,0.85)" }}>
              ✓ {savedMsg}
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 pb-4 flex-shrink-0">
        <button onClick={() => setMirrored(v => !v)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all"
          style={{ background: mirrored ? "rgba(130,80,255,0.3)" : "rgba(255,255,255,0.08)" }} title="Mirror">
          <FlipHorizontal size={17} />
        </button>

        {mode === "photo" ? (
          <>
            <button onClick={capture} disabled={!!error || starting}
              className="w-16 h-16 rounded-full border-4 border-white/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.15)" }}
              title="Take Photo">
              <Circle size={22} className="text-white fill-white" />
            </button>
            <button onClick={downloadPhoto} disabled={!photo}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.08)" }} title="Download last photo">
              <Download size={17} />
            </button>
          </>
        ) : (
          <>
            {!recording ? (
              <button onClick={startVideo} disabled={!!error || starting}
                className="w-16 h-16 rounded-full border-4 border-red-500/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                style={{ background: "rgba(239,68,68,0.2)" }} title="Start Recording">
                <div className="w-6 h-6 rounded-full bg-red-500" />
              </button>
            ) : (
              <button onClick={stopVideo}
                className="w-16 h-16 rounded-full border-4 border-red-400/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(239,68,68,0.5)" }} title="Stop Recording">
                <div className="w-5 h-5 rounded bg-white" />
              </button>
            )}
            <div className="w-10 h-10" /> {/* spacer */}
          </>
        )}
      </div>
    </div>
  )
}
