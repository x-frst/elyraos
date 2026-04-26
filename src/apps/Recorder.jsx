import { useState, useRef, useEffect } from "react"
import { Mic, MicOff, Square, Play, Pause, Download, Trash2 } from "lucide-react"

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export default function Recorder() {
  const [state, setState] = useState("idle") // idle | recording | stopped
  const [recordings, setRecordings] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [playingId, setPlayingId] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const mediaRecorderRef = useRef()
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const elapsedRef = useRef(0)
  const audioRefs = useRef({})

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const url = URL.createObjectURL(blob)
        const id = Date.now()
        setRecordings(r => [...r, { id, url, blob, name: `Recording ${r.length + 1}`, duration: elapsedRef.current }])
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      setState("recording")
      elapsedRef.current = 0
      setElapsed(0)
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1
        setElapsed(elapsedRef.current)
      }, 1000)
    } catch (err) {
      setError(err.message || "Microphone access denied")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop()
      clearInterval(timerRef.current)
      setState("stopped")
      setElapsed(0)  // Reset the counter display; saved duration is in elapsedRef
    }
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  const togglePlay = (rec) => {
    const audio = audioRefs.current[rec.id]
    if (!audio) return
    if (playingId === rec.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId].pause()
      }
      audio.play()
      setPlayingId(rec.id)
      audio.onended = () => setPlayingId(null)
    }
  }

  const download = (rec) => {
    const a = document.createElement("a")
    a.href = rec.url
    a.download = `${rec.name}.webm`
    a.click()
  }

  const remove = (id) => {
    setConfirmRemove(id)
  }

  const doRemove = (id) => {
    if (playingId === id && audioRefs.current[id]) audioRefs.current[id].pause()
    setRecordings(r => r.filter(x => x.id !== id))
    if (playingId === id) setPlayingId(null)
    setConfirmRemove(null)
  }

  return (
    <div className="relative flex flex-col h-full text-white" style={{ background: "#0a0a10", fontFamily: "system-ui,sans-serif" }}>
      {/* Main recorder area */}
      <div className="flex flex-col items-center justify-center flex-shrink-0 py-8"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Waveform visual */}
        <div className="flex items-center gap-0.5 mb-6 h-12">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i}
              className={`w-1.5 rounded-full transition-all ${state === "recording" ? "bg-red-400" : "bg-white/15"}`}
              style={{
                height: state === "recording" ? `${Math.random() * 36 + 8}px` : "8px",
                animation: state === "recording" ? `pulse ${0.4 + Math.random() * 0.6}s ease-in-out infinite alternate` : "none",
              }} />
          ))}
        </div>

        {/* Timer */}
        <div className={`text-4xl font-mono font-bold mb-6 ${state === "recording" ? "text-red-400" : "text-white/40"}`}>
          {formatTime(elapsed)}
        </div>

        {error && <div className="text-red-400/70 text-sm mb-4 text-center px-6">{error}</div>}

        {/* Record / Stop button */}
        <div className="flex items-center gap-4">
          {state !== "recording" ? (
            <button onClick={startRecording}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: "rgba(239,68,68,0.8)", boxShadow: "0 0 0 8px rgba(239,68,68,0.15)" }}>
              <Mic size={24} />
            </button>
          ) : (
            <button onClick={stopRecording}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: "rgba(239,68,68,0.9)", boxShadow: "0 0 0 8px rgba(239,68,68,0.25)" }}>
              <Square size={20} className="fill-white" />
            </button>
          )}
        </div>
      </div>

      {/* Recordings list */}
      <div className="flex-1 overflow-y-auto p-4">
        {recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/25 text-sm">
            <Mic size={28} className="mb-2 opacity-30" />
            No recordings yet
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recordings.map(rec => (
              <div key={rec.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <audio ref={el => { if (el) audioRefs.current[rec.id] = el }} src={rec.url} />
                <button onClick={() => togglePlay(rec)}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                  style={{ background: playingId === rec.id ? "rgba(130,80,255,0.8)" : "rgba(255,255,255,0.12)" }}>
                  {playingId === rec.id ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{rec.name}</div>
                  <div className="text-xs text-white/35">{formatTime(rec.duration)}</div>
                </div>
                <button onClick={() => download(rec)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white transition-all" title="Download">
                  <Download size={14} />
                </button>
                <button onClick={() => remove(rec.id)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-red-400 transition-all" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
      `}</style>

      {/* Custom confirm delete dialog */}
      {confirmRemove && (
        <div className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-6 text-white flex flex-col items-center gap-4"
            style={{ background: "rgba(20,20,36,0.98)", border: "1px solid rgba(255,255,255,0.12)",
                     boxShadow: "0 16px 48px rgba(0,0,0,0.6)", minWidth: 260 }}>
            <Trash2 size={28} className="text-red-400" />
            <div className="text-center">
              <div className="font-semibold mb-1">Delete Recording?</div>
              <div className="text-white/50 text-sm">This will remove the recording permanently.</div>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmRemove(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "rgba(255,255,255,0.1)" }}>Cancel</button>
              <button onClick={() => doRemove(confirmRemove)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "rgba(239,68,68,0.8)" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
