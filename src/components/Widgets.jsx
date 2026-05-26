import { useState, useRef, useEffect, useCallback } from "react"
import { X, Cloud, CloudSun, Sun, CloudRain, CloudSnow, Zap, Music, Radio,
         SkipBack, SkipForward, Play, Pause, GripHorizontal,
         Plus, Trash2, Check, Settings, ChevronLeft, ChevronRight,
         ExternalLink, HardDrive, Cpu, RefreshCw } from "lucide-react"
import { useStore } from "../store/useStore"
import { dbGet, dbSet, fsQuota, aiQuota } from "../utils/db"
import { useMusicStore, RADIO_STATIONS } from "../store/useMusicStore"
import { STORAGE_PREFIX } from "../config.js"

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

// ── TODO List Widget ──────────────────────────────────────────────────────────
function TodoWidget({ widgetId }) {
  const key = `widget-todo-${widgetId}`
  const [items,    setItems]   = useState(() => dbGet(key, []))
  const [draft,    setDraft]   = useState("")
  const [editId,   setEditId]  = useState(null)   // id of the item being edited inline
  const [editText, setEditText] = useState("")
  const inputRef = useRef(null)

  const save = (updated) => { setItems(updated); dbSet(key, updated) }

  const addItem = () => {
    const text = draft.trim()
    if (!text) return
    save([...items, { id: Date.now().toString(36), text, done: false }])
    setDraft("")
    inputRef.current?.focus()
  }

  const toggle   = (id) => save(items.map(it => it.id === id ? { ...it, done: !it.done } : it))
  const remove   = (id) => { if (editId === id) setEditId(null); save(items.filter(it => it.id !== id)) }

  const startEdit = (it) => { setEditId(it.id); setEditText(it.text) }
  const commitEdit = (id) => {
    const t = editText.trim()
    if (t) save(items.map(it => it.id === id ? { ...it, text: t } : it))
    setEditId(null)
  }
  const editKey = (e, id) => {
    if (e.key === "Enter")  { e.preventDefault(); commitEdit(id) }
    if (e.key === "Escape") setEditId(null)
  }

  const handleKey = (e) => { if (e.key === "Enter") addItem() }

  return (
    <div className="flex flex-col h-full">
      {/* Input row */}
      <div className="flex items-center gap-1 px-2 pt-1 pb-1 flex-shrink-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="New task…"
          className="flex-1 min-w-0 text-xs outline-none px-2 py-1 rounded-lg"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.1)", caretColor: "#a78bfa" }}
        />
        <button
          onClick={addItem}
          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:brightness-125"
          style={{ background: "rgba(139,92,246,0.45)" }}
          title="Add task"
        >
          <Plus size={12} strokeWidth={2.5} style={{ color: "#fff" }} />
        </button>
      </div>
      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-1">
        {items.length === 0 && (
          <div className="text-[11px] text-white/25 text-center mt-4">No tasks yet</div>
        )}
        {items.map(it => (
          <div key={it.id}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 group"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Tick */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => toggle(it.id)}
              className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all"
              style={{
                borderColor: it.done ? "rgba(139,92,246,0.7)" : "rgba(255,255,255,0.25)",
                background:  it.done ? "rgba(139,92,246,0.4)" : "transparent",
              }}
            >
              {it.done && <Check size={9} strokeWidth={3} style={{ color: "#c4b5fd" }} />}
            </button>
            {/* Text / inline editor */}
            {editId === it.id ? (
              <input
                autoFocus
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => commitEdit(it.id)}
                onKeyDown={e => editKey(e, it.id)}
                className="flex-1 min-w-0 text-[11px] outline-none px-1 rounded"
                style={{ background: "rgba(139,92,246,0.2)", color: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(139,92,246,0.4)", caretColor: "#a78bfa" }}
              />
            ) : (
              <span
                onClick={() => !it.done && startEdit(it)}
                className="flex-1 min-w-0 text-[11px] leading-tight break-words select-text"
                style={{
                  color: it.done ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)",
                  textDecoration: it.done ? "line-through" : "none",
                  cursor: it.done ? "default" : "text",
                }}>
                {it.text}
              </span>
            )}
            {/* Delete */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => remove(it.id)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
              style={{ color: "#f87171" }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini Calendar Widget ──────────────────────────────────────────────────────
const CAL_KEY   = `${STORAGE_PREFIX}-calendar-events`
const CAL_DAYS  = ['Su','Mo','Tu','We','Th','Fr','Sa']
const CAL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function todayCalStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function calDateStr(y,m,d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function calDaysInMonth(y,m) { return new Date(y,m+1,0).getDate() }

const CAL_COLORS = {
  violet:'#8b5cf6', blue:'#3b82f6', green:'#10b981',
  red:'#ef4444', amber:'#f59e0b', pink:'#ec4899',
}

function CalendarWidget() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState(() => dbGet(CAL_KEY, {}))

  // Poll localStorage every 2 s so widget stays synced with the Calendar app
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = dbGet(CAL_KEY, {})
      setEvents(fresh)
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0) } else setMonth(m => m+1) }
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const todayStr  = todayCalStr()
  const firstDay  = new Date(year, month, 1).getDay()
  const totalDays = calDaysInMonth(year, month)

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  return (
    <div className="flex flex-col h-full px-2 py-1 gap-1 select-none" style={{ color: "rgba(255,255,255,0.85)" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <button onClick={prevMonth} className="text-white/40 hover:text-white/80 transition-colors p-0.5">
          <ChevronLeft size={12} />
        </button>
        <button onClick={goToday} className="text-[11px] font-semibold hover:text-white/80 transition-colors">
          {CAL_MONTHS[month]} {year}
        </button>
        <button onClick={nextMonth} className="text-white/40 hover:text-white/80 transition-colors p-0.5">
          <ChevronRight size={12} />
        </button>
      </div>
      {/* Day labels */}
      <div className="grid grid-cols-7 flex-shrink-0">
        {CAL_DAYS.map(d => (
          <div key={d} className="text-center text-[9px] font-medium text-white/30">{d}</div>
        ))}
      </div>
      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-0.5 flex-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const ds = calDateStr(year, month, day)
          const isToday = ds === todayStr
          const dayEvents = events[ds] || []
          return (
            <div key={ds}
              className="flex flex-col items-center justify-start pt-0.5"
              style={{ minHeight: 22 }}>
              <div className="text-[10px] leading-none w-5 h-5 flex items-center justify-center rounded-full"
                style={{
                  fontWeight: isToday ? 700 : 400,
                  background: isToday ? "rgba(139,92,246,0.7)" : "transparent",
                  color: isToday ? "#fff" : "rgba(255,255,255,0.7)",
                }}>
                {day}
              </div>
              {/* Event dots — max 3 */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center" style={{ maxWidth: 18 }}>
                  {dayEvents.slice(0,3).map(ev => (
                    <div key={ev.id}
                      title={ev.title}
                      style={{ width: 4, height: 4, borderRadius: "50%", background: CAL_COLORS[ev.color] || CAL_COLORS.violet, flexShrink: 0 }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── News Widget ───────────────────────────────────────────────────────────────
const NEWS_TOPICS = [
  { id: "technology",     label: "Technology",    feed: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  { id: "programming",    label: "Programming",   devto: ["programming", "javascript", "webdev"] },
  { id: "gaming",         label: "Gaming",        feed: "https://kotaku.com/rss" },
  { id: "politics",       label: "Politics",      feed: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml" },
  { id: "science",        label: "Science",       feed: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml" },
  { id: "business",       label: "Business",      feed: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { id: "health",         label: "Health",        feed: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml" },
  { id: "sports",         label: "Sports",        feed: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { id: "entertainment",  label: "Entertainment", feed: "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml" },
  { id: "world",          label: "World News",    feed: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "ai",             label: "AI & ML",       feed: "https://www.technologyreview.com/feed/" },
  { id: "crypto",         label: "Crypto",        feed: "https://cointelegraph.com/rss" },
]

// Extract the best image URL from an RSS <item> element.
function rssItemImage(item) {
  const mediaNS = "http://search.yahoo.com/mrss/"
  // media:content / media:thumbnail (with proper namespace)
  for (const local of ["content", "thumbnail"]) {
    const el  = item.getElementsByTagNameNS(mediaNS, local)[0]
    const url = el?.getAttribute("url")
    if (url?.startsWith("http")) return url
  }
  // enclosure
  const enc = item.querySelector("enclosure")
  const encUrl = enc?.getAttribute("url") || ""
  if (encUrl.startsWith("http") && (enc.getAttribute("type") || "").startsWith("image")) return encUrl
  // <img> inside CDATA description
  const descText = item.querySelector("description")?.textContent || ""
  const imgTag = descText.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgTag) return imgTag[1]
  // last resort — any image URL anywhere inside the item XML
  const rawText = item.innerHTML || new XMLSerializer().serializeToString(item)
  const anyImg = rawText.match(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>]*)?/i)
  return anyImg ? anyImg[0] : null
}

// Try multiple CORS proxies in sequence, returning the raw text of the first
// one that succeeds. This makes the widget resilient to any single proxy going down.
async function proxyFetch(url) {
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ]
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const text = await res.text()
      if (text && text.length > 200) return text
    } catch { /* try next */ }
  }
  return null
}

// Fetch one RSS feed, trying three CORS proxies as fallbacks.
async function fetchTopicFeed(topic) {
  const t = NEWS_TOPICS.find(x => x.id === topic)
  if (!t) return []

  // Dev.to public API — CORS-native, no proxy required
  if (t.devto) {
    const results = await Promise.all(t.devto.map(tag =>
      fetch(`https://dev.to/api/articles?per_page=12&tag=${tag}`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    ))
    return results.flat().map(a => ({
      title:   a.title,
      url:     a.url,
      image:   a.cover_image || a.social_image || null,
      source:  a.user?.name || "Dev.to",
      desc:    a.description || null,
      created: a.published_at ? Date.parse(a.published_at) : 0,
    })).filter(a => a.title && a.url)
  }

  const xml = await proxyFetch(t.feed)
  if (!xml) return []
  try {
    const doc    = new DOMParser().parseFromString(xml, "text/xml")
    const source = doc.querySelector("channel > title")?.textContent?.trim()
                   || new URL(t.feed).hostname
    return [...doc.querySelectorAll("item")].map(item => {
      const title   = item.querySelector("title")?.textContent?.trim()
      // RSS uses text content; Atom uses href attribute
      const link    = item.querySelector("link")?.textContent?.trim()
                      || item.querySelector("link")?.getAttribute("href")
                      || item.querySelector("guid")?.textContent?.trim()
      const pubDate = item.querySelector("pubDate")?.textContent?.trim()
      const image   = rssItemImage(item)
      const rawDesc = item.querySelector("description")?.textContent || ""
      const desc    = rawDesc.replace(/<[^>]+>/g, "").trim().slice(0, 280) || null
      if (!title || !link?.startsWith("http")) return null
      return { title, url: link, image, source, desc, created: pubDate ? Date.parse(pubDate) : 0 }
    }).filter(Boolean)
  } catch {
    return []
  }
}

// Fetch all selected topics in parallel, merge and sort newest-first.
async function fetchNews(topics) {
  if (!topics.length) return []
  const results = await Promise.all(topics.map(fetchTopicFeed))
  // Give each topic an equal share of the 20 slots so no single source dominates.
  const perTopic = Math.ceil(20 / topics.length)
  const capped   = results.map(items =>
    [...items].sort((a, b) => b.created - a.created).slice(0, perTopic)
  )
  // Interleave round-robin then shuffle so articles from every category appear mixed.
  const interleaved = []
  const maxLen = Math.max(...capped.map(a => a.length))
  for (let i = 0; i < maxLen; i++)
    capped.forEach(arr => { if (arr[i]) interleaved.push(arr[i]) })
  // Fisher-Yates shuffle for a fully randomised feed
  for (let i = interleaved.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [interleaved[i], interleaved[j]] = [interleaved[j], interleaved[i]]
  }
  return interleaved.slice(0, 20)
}

function NewsWidget({ widgetId }) {
  const prefKey  = `widget-news-topics-${widgetId}`
  const [topics,       setTopics]   = useState(() => dbGet(prefKey, ["technology"]))
  const [articles,     setArticles] = useState([])
  const [idx,          setIdx]      = useState(0)
  const [loading,      setLoading]  = useState(false)
  const [hovered,      setHovered]  = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [draftTopics,  setDraftTopics]  = useState(topics)
  const timerRef = useRef(null)

  // Fetch on mount + whenever topics change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchNews(topics).then(arts => {
      if (!cancelled) { setArticles(arts); setIdx(0); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [topics.join(",")])

  // Auto-advance carousel
  useEffect(() => {
    clearInterval(timerRef.current)
    if (!hovered && articles.length > 1) {
      timerRef.current = setInterval(() => setIdx(i => (i + 1) % articles.length), 5000)
    }
    return () => clearInterval(timerRef.current)
  }, [hovered, articles.length])

  const prev = () => setIdx(i => (i - 1 + articles.length) % articles.length)
  const next = () => setIdx(i => (i + 1) % articles.length)

  const savePref = (selected) => {
    setTopics(selected)
    dbSet(prefKey, selected)
    setShowSettings(false)
  }

  const article = articles[idx]

  if (showSettings) return (
    <div className="flex flex-col h-full p-2 gap-2" style={{ color: "rgba(255,255,255,0.85)" }}>
      <div className="text-[11px] font-semibold text-white/60 flex-shrink-0">Subscribe to topics</div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
        {NEWS_TOPICS.map(t => {
          const on = draftTopics.includes(t.id)
          return (
            <button key={t.id}
              onClick={() => setDraftTopics(d => on ? d.filter(x => x !== t.id) : [...d, t.id])}
              className="flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[11px] transition-all"
              style={{ background: on ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.05)" }}>
              <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: on ? "rgba(139,92,246,0.7)" : "rgba(255,255,255,0.1)" }}>
                {on && <Check size={9} strokeWidth={3} style={{ color: "#fff" }} />}
              </div>
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button onClick={() => setShowSettings(false)}
          className="flex-1 py-1 rounded-lg text-[11px] text-white/50 hover:text-white/80 transition-colors"
          style={{ background: "rgba(255,255,255,0.07)" }}>
          Cancel
        </button>
        <button onClick={() => savePref(draftTopics.length ? draftTopics : ["technology"])}
          className="flex-1 py-1 rounded-lg text-[11px] font-semibold text-white transition-colors"
          style={{ background: "rgba(139,92,246,0.5)" }}>
          Save
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      <div className="text-[11px] text-white/30">Loading news…</div>
    </div>
  )

  if (!articles.length) return (
    <div className="flex flex-col items-center justify-center h-full gap-2 p-3">
      <div className="text-white/25 text-[11px] text-center">No articles found.<br/>Try different topics.</div>
      <button onClick={() => { setDraftTopics(topics); setShowSettings(true) }}
        className="text-[11px] text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors">
        <Settings size={11} /> Topics
      </button>
    </div>
  )

  return (
    <div className="relative flex flex-col h-full overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {/* Settings button */}
      <button
        onClick={() => { setDraftTopics(topics); setShowSettings(true) }}
        className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded opacity-50 hover:opacity-100 transition-opacity"
        style={{ background: "rgba(0,0,0,0.4)" }}>
        <Settings size={10} style={{ color: "#fff" }} />
      </button>

      {/* Image */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {article?.image
          ? <img src={article.image} alt="" className="w-full h-full object-cover" draggable={false} />
          : <div className="w-full h-full flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.15)" }}>
              <div className="text-white/20 text-xs">No image</div>
            </div>
        }
        {/* Gradient overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)" }} />

        {/* Prev / Next on hover */}
        {hovered && articles.length > 1 && (
          <>
            <button onClick={prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity"
              style={{ background: "rgba(0,0,0,0.55)" }}>
              <ChevronLeft size={13} style={{ color: "#fff" }} />
            </button>
            <button onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity"
              style={{ background: "rgba(0,0,0,0.55)" }}>
              <ChevronRight size={13} style={{ color: "#fff" }} />
            </button>
          </>
        )}

        {/* Headline */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
          <a href={article?.url} target="_blank" rel="noopener noreferrer"
            className="block text-white hover:underline leading-tight"
            style={{ fontSize: 11, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            {article?.title}
          </a>
          {article?.source && (
            <div className="text-[9px] text-white/45 mt-0.5">{article.source}</div>
          )}
        </div>
      </div>

      {/* Expanded article on hover */}
      {hovered && article?.desc && (
        <div className="flex-shrink-0 max-h-[90px] overflow-y-auto px-2 py-1.5 text-[10px] leading-relaxed"
          style={{ background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.7)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {article.desc}
          <a href={article.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 ml-1 text-indigo-300 hover:text-indigo-200"
            style={{ whiteSpace: "nowrap" }}>
            Read more <ExternalLink size={9} />
          </a>
        </div>
      )}

      {/* Dot indicators */}
      {articles.length > 1 && !hovered && (
        <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-1 pointer-events-none">
          {articles.slice(0, 8).map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 10 : 4, height: 4, borderRadius: 2,
              background: i === idx ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              transition: "width 0.3s",
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quota Widget ──────────────────────────────────────────────────────────────
function formatBytesShort(b) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1024)          return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

function QuotaBar({ pct, color }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 9999,
        background: pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : color,
        transition: "width 0.5s ease" }} />
    </div>
  )
}

function QuotaWidget() {
  const [storage,  setStorage]  = useState(null)
  const [ai,       setAi]       = useState(null)
  const [spinning, setSpinning] = useState(false)

  // Silent background fetch — used by the interval poller
  const fetchData = useCallback(() => {
    fsQuota().then(d => setStorage(d)).catch(() => {})
    aiQuota().then(d => setAi(d)).catch(() => {})
  }, [])

  // Manual refresh — always completes at least one full spin cycle (700 ms)
  const manualRefresh = useCallback(() => {
    if (spinning) return
    setSpinning(true)
    Promise.all([
      fsQuota().then(d => setStorage(d)).catch(() => {}),
      aiQuota().then(d => setAi(d)).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 700)),  // minimum one full rotation
    ]).finally(() => setSpinning(false))
  }, [spinning])

  // Initial load + poll every 5 s (silent, no spin)
  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5_000)
    return () => clearInterval(id)
  }, [fetchData])

  const sPct = storage ? (storage.used / storage.quota) * 100 : 0
  const aPct = ai && ai.quota > 0 ? (ai.used / ai.quota) * 100 : 0

  return (
    <div className="flex flex-col justify-center h-full px-3 gap-3" style={{ color: "rgba(255,255,255,0.85)" }}>
      {/* Manual refresh button */}
      <button onClick={manualRefresh}
        className="absolute top-5 right-2 text-white/25 hover:text-white/60 transition-colors"
        style={{ animation: spinning ? "spin 0.7s linear infinite" : "none" }}
        title="Refresh">
        <RefreshCw size={10} />
      </button>

      {/* Storage */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <HardDrive size={11} /> Storage
          </div>
          <div className="text-[10px] text-white/40">
            {storage ? `${formatBytesShort(storage.used)} / ${formatBytesShort(storage.quota)}` : "—"}
          </div>
        </div>
        <QuotaBar pct={sPct} color="rgba(99,102,241,0.8)" />
        {storage && (
          <div className="text-[9px] text-white/25 text-right">
            {formatBytesShort(storage.quota - storage.used)} free
          </div>
        )}
      </div>

      {/* AI tokens */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <Cpu size={11} /> AI Tokens
          </div>
          <div className="text-[10px] text-white/40">
            {ai && ai.quota > 0 ? `${ai.used.toLocaleString()} / ${ai.quota.toLocaleString()}` : "—"}
          </div>
        </div>
        <QuotaBar pct={aPct} color="rgba(139,92,246,0.8)" />
        {ai && ai.quota > 0 && (
          <div className="text-[9px] text-white/25 text-right">
            {ai.free.toLocaleString()} tokens remaining
          </div>
        )}
      </div>
    </div>
  )
}


function WidgetContent({ widget }) {
  switch (widget.type) {
    case "clock":    return <ClockWidget />
    case "weather":  return <WeatherWidget />
    case "music":    return <MusicWidget />
    case "notes":    return <NotesWidget widgetId={widget.id} />
    case "todo":     return <TodoWidget widgetId={widget.id} />
    case "calendar": return <CalendarWidget />
    case "news":     return <NewsWidget widgetId={widget.id} />
    case "quota":    return <QuotaWidget />
    default:         return <div className="text-white/30 text-xs p-3">Unknown widget</div>
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
