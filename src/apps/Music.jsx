import { useState, useEffect, useRef } from 'react'
import { Headphones, Radio, Play, Pause, SkipBack, SkipForward,
         Volume2, VolumeX, Upload, FolderOpen, X, Music } from 'lucide-react'
import { useMusicStore, RADIO_STATIONS, getAudio } from '../store/useMusicStore'
import { useStore } from '../store/useStore'

const AUDIO_EXTS = ['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac', 'opus', 'webm']

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function collectAudio(node, out = []) {
  if (!node) return out
  if (node.type === 'file') {
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    if (AUDIO_EXTS.includes(ext)) out.push(node)
  }
  for (const c of (node.children || [])) collectAudio(c, out)
  return out
}

const BAR_DELAYS  = [0, 150, 300, 100, 250]
const BAR_HEIGHTS = ['12px', '20px', '16px', '24px', '12px']

export default function MusicPlayer() {
  const {
    mode, stationIdx, localTracks, localTrackIdx,
    playing, volume,
    togglePlay, nextStation, prevStation, setStation,
    nextLocalTrack, prevLocalTrack, playLocalTrack,
    addLocalTracks, removeLocalTrack, setVolume,
  } = useMusicStore()

  const fsRoot   = useStore(s => s.fsRoot)
  const readFile = useStore(s => s.readFile)
  const loadFile = useStore(s => s.loadFile)

  const [tab, setTab]                   = useState('radio')
  const [showFsPicker, setShowFsPicker] = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)

  // Keep visible tab in sync with active playback mode
  useEffect(() => { setTab(mode === 'local' ? 'library' : 'radio') }, [mode])

  // Pause audio when the Music window is actually closed.
  // Uses a ref + setTimeout(0) to be React StrictMode-safe:
  // StrictMode remounts synchronously before the timeout fires, so
  // mountedRef will be true again and pause is skipped.
  // A real unmount (window close) has no remount, so pause fires correctly.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setTimeout(() => { if (!mountedRef.current) useMusicStore.getState().pause() }, 0)
    }
  }, [])

  // Attach audio event listeners for seek display + auto-advance
  useEffect(() => {
    const audio = getAudio()
    const onTime   = () => setCurrentTime(audio.currentTime)
    const onSeeked  = () => setCurrentTime(audio.currentTime)
    const onMeta   = () => setDuration(isFinite(audio.duration) ? audio.duration : 0)
    const onEnded  = () => {
      const st = useMusicStore.getState()
      if (st.mode === 'local' && st.localTracks.length > 0) st.nextLocalTrack()
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('seeked', onSeeked)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true
    input.accept = AUDIO_EXTS.map(e => `.${e}`).join(',')
    input.onchange = () => {
      Array.from(input.files || []).forEach(file => {
        const reader = new FileReader()
        reader.onload = ev => addLocalTracks([{
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          src: ev.target.result,
        }])
        reader.readAsDataURL(file)
      })
    }
    input.click()
  }

  const handleSeek = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const audio = getAudio()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const fsAudioFiles = collectAudio(fsRoot)
  const nowTitle     = mode === 'local'
    ? (localTracks[localTrackIdx]?.name || 'Unknown')
    : (RADIO_STATIONS[stationIdx]?.title || '')
  const nowSub       = mode === 'local'
    ? (duration > 0 ? `${fmt(currentTime)} / ${fmt(duration)}` : 'Local file')
    : (RADIO_STATIONS[stationIdx]?.artist || '')
  const handlePrev   = () => mode === 'local' ? prevLocalTrack() : prevStation()
  const handleNext   = () => mode === 'local' ? nextLocalTrack() : nextStation()

  return (
    <div className="flex flex-col h-full text-white overflow-hidden relative"
      style={{ background: 'rgba(14,14,24,0.95)' }}>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,10,20,0.7)' }}>
        {[['radio', 'Radio', Radio], ['library', 'Library', Headphones]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition-all"
            style={{
              color: tab === id ? '#fff' : 'rgba(255,255,255,0.4)',
              borderBottom: `2px solid ${tab === id ? 'var(--nova-accent,#8250ff)' : 'transparent'}`,
            }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* ── Now Playing ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col items-center py-5 px-6 gap-3"
        style={{ background: 'linear-gradient(160deg,rgba(130,80,255,0.18) 0%,transparent 100%)' }}>
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl"
          style={{
            background: playing
              ? 'radial-gradient(circle at 35% 35%,rgba(130,80,255,0.9),rgba(60,20,140,0.95))'
              : 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
          <Headphones size={36} className={playing ? 'text-white' : 'text-white/35'} />
        </div>
        <div className="text-center">
          <div className="text-white font-semibold text-[15px] truncate max-w-[220px]">{nowTitle}</div>
          <div className="text-white/45 text-xs mt-0.5">{nowSub}</div>
        </div>
        {playing && (
          <div className="flex items-end justify-center gap-0.5" style={{ height: 28 }}>
            {BAR_DELAYS.map((delay, i) => (
              <span key={i} className="w-1 rounded-full animate-bounce"
                style={{ background: 'rgba(130,80,255,0.85)', animationDelay: `${delay}ms`, height: BAR_HEIGHTS[i] }} />
            ))}
          </div>
        )}
        {/* Seek bar — only for local tracks with known duration */}
        {mode === 'local' && duration > 0 && (
          <div className="w-full flex items-center gap-2 px-1">
            <span className="text-white/40 text-[11px] tabular-nums w-8">{fmt(currentTime)}</span>
            <div className="flex-1 h-1.5 rounded-full cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.15)' }} onClick={handleSeek}>
              <div className="h-full rounded-full pointer-events-none"
                style={{ width: `${(currentTime / duration) * 100}%`, background: 'var(--nova-accent,#8250ff)' }} />
            </div>
            <span className="text-white/40 text-[11px] tabular-nums w-8 text-right">{fmt(duration)}</span>
          </div>
        )}
      </div>

      {/* ── Controls + volume ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col gap-2.5 px-6 pb-4">
        <div className="flex items-center justify-center gap-6">
          <button onClick={handlePrev}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <SkipBack size={20} />
          </button>
          <button onClick={togglePlay}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95"
            style={{ background: playing ? 'rgba(34,197,94,0.55)' : 'rgba(130,80,255,0.65)' }}>
            {playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
          </button>
          <button onClick={handleNext}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <SkipForward size={20} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="text-white/40 hover:text-white transition-colors">
            {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input type="range" min={0} max={1} step={0.02} value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="flex-1 accent-violet-500" />
          <span className="text-white/35 text-xs w-7 text-right">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* ── Radio station list ────────────────────────────────────────────── */}
      {tab === 'radio' && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="text-white/30 text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">Live Radio</div>
          <div className="flex flex-col gap-1">
            {RADIO_STATIONS.map((s, i) => {
              const active = stationIdx === i && mode === 'radio'
              return (
                <button key={i} onClick={() => setStation(i)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: active ? 'rgba(130,80,255,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? 'rgba(130,80,255,0.4)' : 'transparent'}`,
                  }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: active ? 'rgba(130,80,255,0.4)' : 'rgba(255,255,255,0.07)' }}>
                    <Radio size={13} className={active && playing ? 'text-white animate-pulse' : 'text-white/50'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-[13px] font-medium truncate">{s.title}</div>
                    <div className="text-white/40 text-[11px] truncate">{s.artist}</div>
                  </div>
                  {active && playing && <span className="text-green-400/80 text-[11px] flex-shrink-0">● Live</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Library ──────────────────────────────────────────────────────── */}
      {tab === 'library' && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-white/30 text-[11px] font-semibold uppercase tracking-wider">My Music</span>
            <div className="flex items-center gap-1">
              <button onClick={handleUpload}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/50 hover:text-white text-[11px] hover:bg-white/10 transition-all">
                <Upload size={11} /> Upload
              </button>
              <button onClick={() => setShowFsPicker(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/50 hover:text-white text-[11px] hover:bg-white/10 transition-all">
                <FolderOpen size={11} /> OS Files
              </button>
            </div>
          </div>

          {localTracks.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Music size={32} className="text-white/15" />
              <div className="text-white/25 text-[13px] text-center leading-relaxed">
                No songs yet.<br />Upload files or pick from the OS filesystem.
              </div>
              <div className="flex gap-2">
                <button onClick={handleUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] text-white"
                  style={{ background: 'rgba(130,80,255,0.5)' }}>
                  <Upload size={12} /> Upload
                </button>
                <button onClick={() => setShowFsPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] text-white/70"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <FolderOpen size={12} /> OS Files
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {localTracks.map((track, i) => {
                const active = localTrackIdx === i && mode === 'local'
                return (
                  <div key={track.id} className="flex items-center rounded-xl group transition-all"
                    style={{
                      background: active ? 'rgba(130,80,255,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? 'rgba(130,80,255,0.4)' : 'transparent'}`,
                    }}>
                    <button className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 text-left"
                      onClick={() => playLocalTrack(i)}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: active ? 'rgba(130,80,255,0.4)' : 'rgba(255,255,255,0.07)' }}>
                        {active && playing
                          ? <Music size={13} className="text-white animate-pulse" />
                          : <Play size={11} fill="currentColor" className="text-white/50" />}
                      </div>
                      <span className="text-white text-[13px] truncate">{track.name}</span>
                    </button>
                    <button onClick={() => removeLocalTrack(track.id)}
                      className="mr-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/40 hover:text-red-400 transition-all flex-shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── OS File Picker overlay ────────────────────────────────────────── */}
      {showFsPicker && (
        <div className="absolute inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(14,14,24,0.98)' }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
            <div>
              <div className="text-white font-semibold text-[13px]">Browse OS Files</div>
              <div className="text-white/35 text-[11px]">
                {fsAudioFiles.length} audio file{fsAudioFiles.length !== 1 ? 's' : ''} found
              </div>
            </div>
            <button onClick={() => setShowFsPicker(false)}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all">
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {fsAudioFiles.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <Music size={28} className="text-white/15" />
                <div className="text-white/30 text-[13px] text-center">
                  No audio files in OS filesystem.<br />Use Upload to add from your device.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {fsAudioFiles.map(node => {
                  const added = localTracks.some(t => t.id === node.id)
                  return (
                    <button key={node.id} disabled={added}
                      onClick={async () => {
                        let src = readFile(node.id)
                        if (!src) src = await loadFile(node.id)
                        if (!src) return
                        addLocalTracks([{ id: node.id, name: node.name.replace(/\.[^.]+$/, ''), src }])
                        setShowFsPicker(false)
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/10"
                      style={{ background: 'rgba(255,255,255,0.04)', opacity: added ? 0.5 : 1 }}>
                      <Music size={13} className="text-white/50 flex-shrink-0" />
                      <span className="text-white text-[13px] truncate flex-1">{node.name}</span>
                      {added && <span className="text-white/30 text-[11px] flex-shrink-0">Added</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
