import { useState, useRef, useEffect, useCallback } from "react"
import { X, Cloud, CloudSun, Sun, CloudRain, CloudSnow, Zap, Music, Radio,
         SkipBack, SkipForward, Play, Pause, GripHorizontal } from "lucide-react"
import { useStore } from "../store/useStore"
import { dbGet, dbSet } from "../utils/db"
import { useMusicStore, RADIO_STATIONS } from "../store/useMusicStore"

// ── Clock Widget ──────────────────────────────────────────────────────────────
function ClockWidget() {
  const [time, setTime] = useState(new Date())
  const timezone = useStore(s => s.settings?.timezone)
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const tz = timezone || undefined
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1 px-3">
      <div className="text-3xl font-bold tabular-nums text-white tracking-tight">
        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", ...(tz && { timeZone: tz }) })}
      </div>
      <div className="text-white/50 text-xs">
        {time.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(tz && { timeZone: tz }) })}
      </div>
    </div>
  )
}

// ── Weather Widget ────────────────────────────────────────────────────────────
// Module-level cache so re-mounts don't re-fetch
let _weatherCache = null
let _weatherFetchPromise = null

function wmoIcon(code) {
  if (code === 113) return Sun
  if (code === 116) return CloudSun
  if (code >= 119 && code <= 260) return Cloud
  if ((code >= 263 && code <= 314) || (code >= 353 && code <= 359)) return CloudRain
  if (code >= 317 && code <= 377) return CloudSnow
  return Zap
}

function fetchWeather(lat, lon) {
  if (_weatherFetchPromise) return _weatherFetchPromise
  const url = lat != null
    ? `https://wttr.in/${lat},${lon}?format=j1`
    : `https://wttr.in/?format=j1`
  _weatherFetchPromise = fetch(url)
    .then(r => { if (!r.ok) throw new Error(); return r.json() })
    .then(data => {
      const cur   = data.current_condition?.[0]
      const today = data.weather?.[0]
      const area  = data.nearest_area?.[0]
      const w = {
        temp: parseInt(cur.temp_C),
        desc: cur.weatherDesc?.[0]?.value || "",
        code: parseInt(cur.weatherCode),
        low:  parseInt(today.mintempC),
        high: parseInt(today.maxtempC),
        city: area?.areaName?.[0]?.value || area?.area?.[0]?.value || "",
        humidity: cur.humidity,
      }
      _weatherCache = w
      return w
    })
    .catch(err => {
      // Reset so the widget can retry next time
      _weatherFetchPromise = null
      return null
    })
  return _weatherFetchPromise
}

function WeatherWidget() {
  const [weather, setWeather] = useState(_weatherCache)
  const [status, setStatus]   = useState(_weatherCache ? "ok" : "idle") // idle|requesting|loading|ok|error

  useEffect(() => {
    if (_weatherCache) { setStatus("ok"); return }
    // Ask permission first
    setStatus("requesting")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("loading")
        fetchWeather(pos.coords.latitude.toFixed(4), pos.coords.longitude.toFixed(4))
          .then(w => { if (w) { setWeather(w); setStatus("ok") } else setStatus("error") })
      },
      () => {
        // Permission denied or unavailable — fall back to IP-based
        setStatus("loading")
        fetchWeather(null, null)
          .then(w => { if (w) { setWeather(w); setStatus("ok") } else setStatus("error") })
      },
      { timeout: 6000 }
    )
  }, [])

  if (status === "requesting" || status === "idle") return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-3">
      <CloudSun size={28} className="text-amber-300/60" />
      <div className="text-white/40 text-[11px] text-center">Requesting location…</div>
    </div>
  )
  if (status === "loading") return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white/30 text-xs animate-pulse">Fetching weather…</div>
    </div>
  )
  if (status === "error" || !weather) return (
    <div className="flex flex-col justify-center h-full px-3 gap-2">
      <div className="flex items-center gap-3">
        <CloudSun size={32} className="text-amber-300 flex-shrink-0" />
        <div>
          <div className="text-3xl font-bold text-white tabular-nums">--°</div>
          <div className="text-white/50 text-xs">Unavailable</div>
        </div>
      </div>
    </div>
  )

  const WeatherIcon = wmoIcon(weather.code)
  return (
    <div className="flex flex-col justify-center h-full px-3 gap-2">
      <div className="flex items-center gap-3">
        <WeatherIcon size={32} className="text-amber-300 flex-shrink-0" />
        <div>
          <div className="text-3xl font-bold text-white tabular-nums">{weather.temp}°C</div>
          <div className="text-white/50 text-xs">{weather.desc}</div>
        </div>
      </div>
      <div className="flex gap-2 text-xs text-white/40 flex-wrap">
        <span>↓ {weather.low}°</span>
        <span>↑ {weather.high}°</span>
        <span>💧 {weather.humidity}%</span>
        {weather.city && <span className="ml-auto truncate max-w-[90px]">{weather.city}</span>}
      </div>
    </div>
  )
}

// ── Music Widget — synced to useMusicStore (radio + local) ───────────────────
function MusicWidget() {
  const {
    mode, stationIdx, localTracks, localTrackIdx,
    playing, togglePlay,
    nextStation, prevStation,
    nextLocalTrack, prevLocalTrack,
  } = useMusicStore()

  const isLocal = mode === 'local'
  const title  = isLocal
    ? (localTracks[localTrackIdx]?.name || 'Unknown')
    : (RADIO_STATIONS[stationIdx]?.title || 'Unknown')
  const artist = isLocal
    ? 'Local file'
    : (RADIO_STATIONS[stationIdx]?.artist || '')
  const handlePrev = isLocal ? prevLocalTrack : prevStation
  const handleNext = isLocal ? nextLocalTrack : nextStation

  return (
    <div className="flex flex-col justify-center h-full px-3 gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: "rgba(var(--nova-accent-rgb,130,80,255),0.3)" }}>
          {playing
            ? <Radio size={18} className="text-white animate-pulse" />
            : <Music size={18} className="text-white/60" />}
        </div>
        <div className="min-w-0">
          <div className="text-white text-sm font-medium truncate">{title}</div>
          <div className="text-white/40 text-xs truncate">
            {playing && !isLocal ? <span className="text-green-400/80">● Live</span> : null} {artist}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button onClick={handlePrev} className="text-white/50 hover:text-white transition-colors"><SkipBack size={16} /></button>
        <button onClick={togglePlay}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-all"
          style={{ background: playing ? "rgba(34,197,94,0.5)" : "rgba(var(--nova-accent-rgb,130,80,255),0.5)" }}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={handleNext} className="text-white/50 hover:text-white transition-colors"><SkipForward size={16} /></button>
      </div>
    </div>
  )
}

// ── Sticky Notes Widget ───────────────────────────────────────────────────────
function NotesWidget({ widgetId }) {
  const noteKey = `widget-note-${widgetId}`
  const [text, setText] = useState(() => dbGet(noteKey, ""))
  const save = (v) => { setText(v); dbSet(noteKey, v) }
  return (
    <textarea
      value={text}
      onChange={e => save(e.target.value)}
      placeholder="Type a note…"
      className="w-full h-full resize-none outline-none p-3 text-sm leading-relaxed"
      style={{
        background: "transparent",
        color: "#3d2e00",
        fontFamily: "'Georgia', 'Palatino', serif",
        caretColor: "#78350f",
      }}
    />
  )
}

// ── Widget content router ─────────────────────────────────────────────────────
function WidgetContent({ widget }) {
  switch (widget.type) {
    case "clock":   return <ClockWidget />
    case "weather": return <WeatherWidget />
    case "music":   return <MusicWidget />
    case "notes":   return <NotesWidget widgetId={widget.id} />
    default:        return <div className="text-white/30 text-xs p-3">Unknown widget</div>
  }
}

// ── Single draggable widget ───────────────────────────────────────────────────
function Widget({ widget }) {
  const removeWidget = useStore(s => s.removeWidget)
  const moveWidget   = useStore(s => s.moveWidget)
  const [pos, setPos] = useState({ x: widget.x, y: widget.y })
  const dragOff = useRef({ ox: 0, oy: 0 })
  const isNotes = widget.type === "notes"
  const r  = isNotes ? 6 : 16

  // On mount (and when widget dimensions change), clamp position to current viewport.
  // This fixes widgets placed at desktop coords that overflow on smaller/mobile screens.
  useEffect(() => {
    setPos(p => ({
      x: Math.max(0,  Math.min(p.x, window.innerWidth  - widget.w)),
      y: Math.max(44, Math.min(p.y, window.innerHeight - widget.h - 80)),
    }))
  }, [widget.w, widget.h])

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOff.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y }
  }
  const handlePointerMove = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    setPos({
      x: Math.max(0,  Math.min(window.innerWidth  - widget.w, e.clientX - dragOff.current.ox)),
      y: Math.max(44, Math.min(window.innerHeight - widget.h - 80, e.clientY - dragOff.current.oy)),
    })
  }
  const handlePointerUp = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    moveWidget(widget.id,
      Math.max(0,  Math.min(window.innerWidth  - widget.w, e.clientX - dragOff.current.ox)),
      Math.max(44, Math.min(window.innerHeight - widget.h - 80, e.clientY - dragOff.current.oy))
    )
  }

  return (
    <div className="fixed" style={{
      left: pos.x, top: pos.y, width: widget.w, height: widget.h,
      // zIndex 100 = above desktop icons (51) but BELOW windows (201+)
      zIndex: 100,
      borderRadius: r, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: isNotes ? 'linear-gradient(160deg,#fef9c3 0%,#fef08a 100%)' : 'rgba(16,16,28,0.80)',
      backdropFilter: isNotes ? 'none' : 'blur(28px) saturate(160%)',
      WebkitBackdropFilter: isNotes ? 'none' : 'blur(28px) saturate(160%)',
      border: isNotes ? 'none' : '1px solid rgba(255,255,255,0.13)',
      boxShadow: isNotes
        ? '3px 4px 16px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.6)'
        : '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* ── Slim 20px drag bar ── */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          height: 20, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: 6, paddingRight: 3,
          background: isNotes ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.25)',
          cursor: 'grab', touchAction: 'none', userSelect: 'none',
        }}
      >
        <GripHorizontal size={10} strokeWidth={2}
          style={{ color: isNotes ? 'rgba(120,70,0,0.4)' : 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
        {/* Close button — transparent padding creates a 40×40 touch target
            without changing the visible 16×16 appearance */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => removeWidget(widget.id)}
          style={{
            border: 'none', cursor: 'pointer', background: 'transparent',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 12, margin: -12,
          }}
        >
          <span style={{
            width: 16, height: 16, borderRadius: 4, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(220,38,38,0.5)', color: '#fff', pointerEvents: 'none',
          }}>
            <X size={9} strokeWidth={2.5} />
          </span>
        </button>
      </div>
      {/* ── Widget content ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WidgetContent widget={widget} />
      </div>
    </div>
  )
}

// ── Widget layer ──────────────────────────────────────────────────────────────
export default function Widgets() {
  const widgets = useStore(s => s.widgets)
  return <>{widgets.map(w => <Widget key={w.id} widget={w} />)}</>
}
