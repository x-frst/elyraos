import { create } from 'zustand'

export const RADIO_STATIONS = [
  { title: "Groove Salad",    artist: "Ambient / Chill",    url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { title: "Space Station",   artist: "Space / Ambient",    url: "https://ice1.somafm.com/spacestation-128-mp3" },
  { title: "PopTron",         artist: "Indie / Electronic", url: "https://ice1.somafm.com/poptron-128-mp3" },
  { title: "Drone Zone",      artist: "Dark Ambient",       url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { title: "Lush",            artist: "Dream Pop",          url: "https://ice1.somafm.com/lush-128-mp3" },
  { title: "Illinois Street", artist: "Soul / R&B",         url: "https://ice1.somafm.com/illstreet-128-mp3" },
]

// Singleton audio — shared across the whole OS (radio widget + music app)
let _audio = null
export function getAudio() {
  if (!_audio) _audio = new Audio()
  return _audio
}

export const useMusicStore = create((set, get) => ({
  // ── Shared ─────────────────────────────────────────────────────────────────
  mode: 'radio',   // 'radio' | 'local'
  playing: false,
  volume: 0.8,

  // ── Radio ──────────────────────────────────────────────────────────────────
  stationIdx: 0,

  // ── Local library ──────────────────────────────────────────────────────────
  localTracks: [],      // [{ id, name, src }]
  localTrackIdx: 0,

  // ── Playback ───────────────────────────────────────────────────────────────
  play() {
    const { mode, stationIdx, localTracks, localTrackIdx, volume } = get()
    const audio = getAudio()
    audio.volume = volume
    if (mode === 'radio') {
      // Radio streams are live — always restart the connection
      audio.src = RADIO_STATIONS[stationIdx].url
      audio.play().then(() => set({ playing: true })).catch(() => set({ playing: false }))
    } else {
      const track = localTracks[localTrackIdx]
      if (!track) return
      if (!track.src.startsWith('blob:')) {
        // Non-blob src (data URL / HTTP URL) — delegate to playLocalTrack which converts to blob
        get().playLocalTrack(localTrackIdx)
        return
      }
      // Blob URL: only reassign src if it's a different track so currentTime is preserved on resume
      if (audio.src !== track.src) audio.src = track.src
      audio.play().then(() => set({ playing: true })).catch(() => set({ playing: false }))
    }
  },

  pause() {
    getAudio().pause()
    set({ playing: false })
  },

  togglePlay() {
    if (get().playing) get().pause()
    else get().play()
  },

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, v))
    getAudio().volume = vol
    set({ volume: vol })
  },

  // ── Radio controls ─────────────────────────────────────────────────────────
  setStation(idx) {
    const { playing } = get()
    set({ stationIdx: idx, mode: 'radio' })
    const audio = getAudio()
    audio.src = RADIO_STATIONS[idx].url
    if (playing) audio.play().catch(() => set({ playing: false }))
  },

  nextStation() {
    get().setStation((get().stationIdx + 1) % RADIO_STATIONS.length)
  },

  prevStation() {
    get().setStation((get().stationIdx - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length)
  },

  // ── Local library controls ─────────────────────────────────────────────────
  addLocalTracks(tracks) {
    set(s => {
      const existing = new Set(s.localTracks.map(t => t.id))
      return { localTracks: [...s.localTracks, ...tracks.filter(t => !existing.has(t.id))] }
    })
  },

  removeLocalTrack(id) {
    set(s => {
      const updated = s.localTracks.filter(t => t.id !== id)
      return { localTracks: updated, localTrackIdx: Math.min(s.localTrackIdx, Math.max(0, updated.length - 1)) }
    })
  },

  async playLocalTrack(idx) {
    const { localTracks, volume } = get()
    const track = localTracks[idx]
    if (!track) return
    let src = track.src
    // Convert data URLs and HTTP URLs to blob URLs exactly once.
    // Blob URLs allow the browser to seek freely; data URLs and HTTP URLs do not reliably support seeking.
    if (!src.startsWith('blob:')) {
      try {
        const res = await fetch(src)
        const blob = await res.blob()
        src = URL.createObjectURL(blob)
        set(s => ({ localTracks: s.localTracks.map((t, i) => i === idx ? { ...t, src } : t) }))
      } catch { return }
    }
    const audio = getAudio()
    audio.volume = volume
    audio.src = src
    audio.play()
      .then(() => set({ localTrackIdx: idx, mode: 'local', playing: true }))
      .catch(() => set({ playing: false }))
  },

  nextLocalTrack() {
    const { localTracks, localTrackIdx } = get()
    if (!localTracks.length) return
    get().playLocalTrack((localTrackIdx + 1) % localTracks.length)
  },

  prevLocalTrack() {
    const { localTracks, localTrackIdx } = get()
    if (!localTracks.length) return
    get().playLocalTrack((localTrackIdx - 1 + localTracks.length) % localTracks.length)
  },

  // Play a track from raw content (data URI, blob URL, or HTTP URL) — used by Files.jsx double-click.
  // Blob URL conversion is handled lazily inside playLocalTrack.
  playRawData(name, data) {
    if (!data) return
    const { localTracks } = get()
    const existing = localTracks.findIndex(t => t.name === name)
    if (existing >= 0) {
      // Refresh the stored src with the latest URL if it's not already a blob
      if (!localTracks[existing].src.startsWith('blob:')) {
        set(s => ({ localTracks: s.localTracks.map((t, i) => i === existing ? { ...t, src: data } : t) }))
      }
      get().playLocalTrack(existing)
    } else {
      const id = `fs-${Date.now()}`
      set(s => ({ localTracks: [...s.localTracks, { id, name, src: data }] }))
      get().playLocalTrack(get().localTracks.length - 1)
    }
  },
}))
