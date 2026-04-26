import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, ImageIcon, Film, FolderGit2, Check,
  Download, AlertCircle,
  Bot, User, Plus, Trash2, Paperclip, X, ChevronDown,
  MessageSquare, Music, Play, Pause, Maximize, Minimize,
} from 'lucide-react'
import { useStore, findNode } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'
import { aiChat, aiImage, aiAgentPlan, aiAgentPatch, aiCreateFile, aiEditFile, aiQuota, aiVideo, aiMusic, aiSpend,
         chatGetAll, chatPut, chatDel, getJWT } from '../utils/db'
import { BRANDING } from '../config.js'

// Token costs mirrored from server/config.js AI_PRICING defaults
const GENERATION_COSTS = {
  image:   { type: 'flat',       amount: 3000 },
  video:   { type: 'perSecond',  amount: 3000, min: 3000 },
  music:   { type: 'flat',       amount: 4000 },
  project: { type: 'flat',       amount: 2000 },
}

// ── constants ──────────────────────────────────────────────────────────────────
// localStorage key used ONLY as a guest fallback or migration source
const LS_KEY_LEGACY = `${BRANDING.name}-ai-chats-v2`
const MAX_CHATS = 10

// ── Debug mode — set to true to skip all AI API calls and return mock responses ──
const AI_DEBUG = false

function cuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// --------------- Local (free) reply engine ---------------------------------
// Returns a reply string for simple prompts that don't need the AI,
// or null if the message should be forwarded to the AI.
function localReply(text, tz) {
  const t = text.trim().toLowerCase().replace(/[!?.,']+$/, '')

  // ── Greetings ──────────────────────────────────────────────────────────────
  // Neutral greetings → plain "Hello!" (no time-of-day assumption)
  const simpleGreetings = ['hi', 'hello', 'hey', 'howdy', 'hiya', 'sup', "what's up", 'whats up', 'greetings']
  if (simpleGreetings.includes(t))
    return `Hello! 👋 How can I help you today?`

  // Time-of-day greetings → echo the appropriate period back
  const timeGreetings = ['good morning', 'good afternoon', 'good evening', 'good night', 'morning', 'afternoon', 'evening']
  if (timeGreetings.includes(t)) {
    const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, ...(tz ? { timeZone: tz } : {}) })
    const h = parseInt(hour, 10)
    const timeGreeting = h >= 4 && h < 12 ? 'Good morning' : h >= 12 && h < 16 ? 'Good afternoon' : h >= 16 && h < 20 ? 'Good evening' : 'Good night'
    return `${timeGreeting}! 😊 Let me know if there's anything else I can help with.`
  }

  // ── How are you / status ────────────────────────────────────────────────────
  const howAreYou = [
    'how are you', 'how are you doing', 'how do you do', "how's it going",
    'hows it going', "how are you today", 'you okay', 'you good',
    "how's everything", 'hows everything', "what's new", 'whats new',
  ]
  if (howAreYou.includes(t))
    return `I'm doing great, thanks for asking! 😊 Ready to help — what's on your mind?`

  // ── Thank you ────────────────────────────────────────────────────────────────
  const thanks = [
    'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'thank you very much',
    'ty', 'thx', 'thnx', 'many thanks', 'cheers',
  ]
  if (thanks.includes(t))
    return `You're welcome! 😊 Let me know if there's anything else I can help with.`

  // ── OK / Acknowledgements ────────────────────────────────────────────────────
  const acks = ['ok', 'okay', 'got it', 'understood', 'noted', 'alright', 'sure', 'cool', 'great', 'perfect', 'sounds good', 'nice']
  if (acks.includes(t))
    return `Got it! 👍 Feel free to ask me anything.`

  // ── Goodbye ──────────────────────────────────────────────────────────────────
  const byes = ['bye', 'goodbye', 'see you', 'see ya', 'later', 'cya', 'take care', 'farewell', 'goodnight', 'good night']
  if (byes.includes(t))
    return `Goodbye! 👋 Come back anytime you need help.`

  // ── Who are you / what are you ───────────────────────────────────────────────
  const whoAreYou = [
    'who are you', 'what are you', 'what is your name', "what's your name",
    'whats your name', 'tell me about yourself', 'introduce yourself',
  ]
  if (whoAreYou.includes(t))
    return `I'm **${BRANDING.name} AI** — your all-in-one creative assistant built into ${BRANDING.name}. I can chat, answer questions, generate images, videos, and music, scaffold full projects, and edit files. Just ask! 🤖`

  // ── Date ────────────────────────────────────────────────────────────────────
  const dateQ = [
    "what's the date", 'whats the date', 'what is the date', 'what date is it',
    "today's date", 'todays date', 'what day is it', 'what day is today',
    'current date', 'date today',
  ]
  if (dateQ.includes(t) || /\b(what|today)\b.{0,25}\bdate\b/.test(t) || /\bwhat\s+day\b/.test(t)) {
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      ...(tz ? { timeZone: tz } : {}),
    })
    return `Today is **${dateStr}**. 📅`
  }

  // ── Time ────────────────────────────────────────────────────────────────────
  const timeQ = [
    "what's the time", 'whats the time', 'what is the time', 'what time is it',
    'current time', 'time now', 'tell me the time', 'what time',
  ]
  if (timeQ.includes(t) || /\bwhat\b.{0,25}\btime\b/.test(t)) {
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      ...(tz ? { timeZone: tz } : {}),
    })
    const tzLabel = tz || Intl.DateTimeFormat().resolvedOptions().timeZone
    return `The current time is **${timeStr}** (${tzLabel}). 🕐`
  }

  // ── Date & Time together ──────────────────────────────────────────────────
  if (/\b(date|time)\b/.test(t) && /\b(date|time)\b/.test(t.replace(/.*?\b(date|time)\b/, ''))) {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                   hour: 'numeric', minute: '2-digit', hour12: true,
                   ...(tz ? { timeZone: tz } : {}) }
    const dtStr = new Date().toLocaleString('en-US', opts)
    const tzLabel = tz || Intl.DateTimeFormat().resolvedOptions().timeZone
    return `It is **${dtStr}** (${tzLabel}). 📅🕐`
  }

  return null  // forward to AI
}

// Auto-detect generation mode from message text
function detectMode(text) {
  const t = text.toLowerCase()
  if (/\b(generate|create|draw|make|produce|render|show)\b.{0,25}\b(image|picture|photo|illustration|artwork|drawing|sketch|portrait|logo|icon|banner)\b/.test(t) ||
      /\b(image|picture|photo)\s+(of|showing|depicting)\b/.test(t)) return 'image'
  if (/\b(generate|create|make|produce|render)\b.{0,25}\b(video|clip|film|animation|movie|reel)\b/.test(t) ||
      /\bvideo\s+(of|showing|for)\b/.test(t)) return 'video'
  if (/\b(generate|create|make|produce|compose|write|play)\b.{0,25}\b(music|song|audio|track|beat|melody|tune|jingle|soundtrack|instrumental)\b/.test(t) ||
      /\b(music|song|audio|track|beat|melody)\s+(for|about|in\s+the\s+style)\b/.test(t)) return 'music'
  if (/\b(create|build|make|generate|scaffold|bootstrap|init|setup)\b.{0,25}\b(project|app|application|website|webapp|game|cli|tool|library|package|program)\b/.test(t)) return 'project'
  return 'text'
}

// Match any filename.extension — letters-only extension up to 10 chars.
// Excludes version numbers (2.0) and IPs because those have digits in the extension part.
const FILE_EXT_RE = /\b[\w][\w-]*\.([a-zA-Z]{1,10})\b/

// Map loose user-spoken type words → file extension(s) to search for
const TYPE_EXT_MAP = {
  text: ['txt'], 'text file': ['txt'], textfile: ['txt'],
  document: ['txt', 'md', 'html', 'docx'],
  csv: ['csv'], spreadsheet: ['csv'], table: ['csv'],
  json: ['json'], data: ['json', 'csv'],
  markdown: ['md'], md: ['md'],
  html: ['html', 'htm'], webpage: ['html'],
  python: ['py'], py: ['py'], script: ['py', 'sh', 'js'],
  javascript: ['js'], js: ['js'],
  typescript: ['ts'], ts: ['ts'],
  pdf: ['pdf'],
  log: ['log'], config: ['ini', 'toml', 'env', 'yaml', 'yml', 'json'],
  yaml: ['yaml', 'yml'], xml: ['xml'],
}

function detectFileCreate(text) {
  const hasVerb = /\b(create|save|make|write|generate|produce|build)\b/i.test(text)
  if (!hasVerb) return false
  // Explicit filename.ext
  if (FILE_EXT_RE.test(text)) return true
  // Type word + file/document/script noun
  const knownType = Object.keys(TYPE_EXT_MAP).some(k => new RegExp(`\\b${k}\\b`, 'i').test(text))
  return knownType && /\bfile\b|\bdocument\b|\bscript\b|\bspreadsheet\b/i.test(text)
}

function detectFileEdit(text) {
  // Edit verbs
  const hasEditVerb = /\b(edit|modify|update|change|add|append|remove|delete|fix|insert|replace|rename)\b/i.test(text)
  // Data-level verbs (row/record/line)
  const hasDataVerb = /\b(delete|remove|add|insert|append|update|change)\b.{0,30}\b(row|record|line|entry|column|cell)\b/i.test(text)
  if (!hasEditVerb && !hasDataVerb) return false
  // Explicit filename.ext
  if (FILE_EXT_RE.test(text)) return true
  // Mentions a file/document/spreadsheet in any form
  if (/\bfile\b|\bdocument\b|\bspreadsheet\b/i.test(text)) return true
  // Pronouns referring to a prior item — only valid when paired with an edit verb
  if (hasEditVerb && /\b(it|this|that)\b/i.test(text)) return true
  // Data-level ops always imply an existing file
  if (hasDataVerb) return true
  return false
}

const MODES = [
  { id: 'text',    label: 'Text',    Icon: MessageSquare },
  { id: 'image',   label: 'Image',   Icon: ImageIcon     },
  { id: 'video',   label: 'Video',   Icon: Film          },
  { id: 'music',   label: 'Music',   Icon: Music         },
  { id: 'project', label: 'Project', Icon: FolderGit2    },
]

const PLACEHOLDERS = {
  text:    'Ask anything...',
  image:   'Describe the image to generate...',
  video:   'Describe the video to generate...',
  music:   'Describe the music to generate...',
  project: 'Describe the project to create...',
}

const WELCOME = {
  role: 'assistant', type: 'text', uiOnly: true,
  content: `👋 Hey there! I'm **${BRANDING.name} AI** — your all-in-one creative assistant.\n\nHere's what I can do for you:\n\n- 💬 **Chat & Answer** — Ask me anything, from quick questions to deep explanations\n- 🖼️ **Image Generation** — Describe a scene and I'll bring it to life\n- 🎬 **Video Generation** — Turn your ideas into short video clips\n- 🎵 **Music Generation** — Compose original tracks from a text description\n- 🗂️ **Project Scaffolding** — Build full apps, sites, or tools with all their files\n- 📄 **File Creation** — Tell me to create a document, script, spreadsheet, and more\n- ✏️ **File Editing** — Ask me to update any file already in your filesystem\n\nJust type what you want — I'll figure out the rest! ✨`,
}

// --------------- localStorage helpers (guests + migration fallback) --------

function loadChatsLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY_LEGACY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch { return null }
}

function saveChatsLocal(chats) {
  try {
    // For guests: strip large media so localStorage doesn't overflow
    const slim = chats.map(c => ({
      ...c,
      messages: c.messages.map(m =>
        (m.type === 'image' || m.type === 'audio' || m.type === 'video')
          ? { ...m, content: '[media]' }
          : m
      ),
    }))
    localStorage.setItem(LS_KEY_LEGACY, JSON.stringify(slim))
  } catch { /* storage full */ }
}

function makeChat(title = 'New Chat') {
  return { id: cuid(), title, messages: [{ ...WELCOME }], mode: 'text', agentPlan: null, agentStep: 0, agentDone: false }
}


// --------------- Markdown renderer -----------------------------------------

function MarkdownBlock({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const out   = []
  let   i     = 0
  let   k     = 0   // independent key counter — never collides regardless of how i moves
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      out.push(
        <div key={k++} className="my-2 rounded-xl overflow-hidden text-[12px]"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {lang && (
            <div className="flex items-center gap-1 px-3 py-1.5 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.04)' }}>
              <span className="text-[10px] text-violet-300 font-mono">{lang}</span>
            </div>
          )}
          <pre className="p-3 overflow-x-auto font-mono leading-relaxed text-emerald-200" style={{ margin: 0 }}>{codeLines.join('\n')}</pre>
        </div>
      )
      i++; continue
    }
    if (/^#{1,3}\s/.test(line)) {
      const level   = line.match(/^(#{1,3})/)[1].length
      const content = line.slice(level + 1)
      const cls = level === 1 ? 'text-base font-bold mt-3 mb-1' : level === 2 ? 'text-[13px] font-semibold mt-2.5 mb-1' : 'text-[12px] font-semibold mt-2 mb-0.5'
      out.push(<div key={k++} className={cls}>{content}</div>); i++; continue
    }
    if (/^[-*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].slice(2)); i++ }
      out.push(
        <ul key={k++} className="my-1.5 pl-4 flex flex-col gap-0.5 list-none">
          {items.map((item, j) => (
            <li key={j} className="text-[13px] leading-relaxed flex gap-2">
              <span className="text-violet-400 flex-shrink-0 mt-1 text-[10px]">*</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      ); continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      out.push(
        <ol key={k++} className="my-1.5 pl-4 flex flex-col gap-0.5 list-none">
          {items.map((item, j) => (
            <li key={j} className="text-[13px] leading-relaxed flex gap-2">
              <span className="text-violet-400 flex-shrink-0 font-mono text-[11px] mt-0.5 min-w-[16px]">{j + 1}.</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ol>
      ); continue
    }
    if (line.trim() === '') { out.push(<div key={k++} className="h-1.5" />); i++; continue }
    out.push(<p key={k++} className="text-[13px] leading-relaxed my-0.5">{inlineFormat(line)}</p>); i++
  }
  return <div>{out}</div>
}

function inlineFormat(text) {
  const parts = []
  let rem = text, key = 0
  const patterns = [
    { re: /\*\*(.+?)\*\*/, tag: s => <strong key={key++} className="font-semibold text-white">{s}</strong> },
    { re: /`(.+?)`/,       tag: s => <code key={key++} className="px-1 py-0.5 rounded text-[11px] font-mono text-emerald-300" style={{ background: 'rgba(0,0,0,0.35)' }}>{s}</code> },
    { re: /\*(.+?)\*/,     tag: s => <em key={key++} className="italic text-white/80">{s}</em> },
  ]
  while (rem.length) {
    let earliest = null
    for (const p of patterns) {
      const m = p.re.exec(rem)
      if (m && (!earliest || m.index < earliest.index)) earliest = { ...m, tag: p.tag }
    }
    if (!earliest) { parts.push(rem); break }
    if (earliest.index > 0) parts.push(rem.slice(0, earliest.index))
    parts.push(earliest.tag(earliest[1]))
    rem = rem.slice(earliest.index + earliest[0].length)
  }
  return parts
}

// --------------- Avatar + Dots helpers ------------------------------------

function AvatarBot() {
  return (
    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
      style={{ background: 'rgba(130,80,255,0.2)', border: '1px solid rgba(130,80,255,0.3)' }}>
      <Bot size={13} className="text-violet-300" />
    </div>
  )
}
function AvatarUser() {
  return (
    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ background: 'rgba(130,80,255,0.5)' }}>
      <User size={13} />
    </div>
  )
}
function Dots() {
  return (
    <div className="px-4 py-3 flex gap-1" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px 18px 18px 18px' }}>
      {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </div>
  )
}

// --------------- Bubble components ----------------------------------------

function MessageBubble({ msg, loading }) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-2.5 flex-row-reverse">
        <AvatarUser />
        <div className="flex flex-col items-end gap-1.5 max-w-[82%]">
          {(msg.attachments || []).length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {msg.attachments.map((a, i) =>
                a.mimeType?.startsWith('image/') && (
                  <img key={i} src={a.dataUrl} alt={a.name} className="h-20 rounded-xl object-cover" />
                )
              )}
            </div>
          )}
          <div className="px-3.5 py-2.5 text-[13px] leading-relaxed"
            style={{ background: 'rgba(130,80,255,0.22)', borderRadius: '18px 6px 18px 18px', border: '1px solid rgba(130,80,255,0.28)', userSelect: 'text', cursor: 'text' }}>
            {msg.content}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5">
      <AvatarBot />
      <div className="flex-1 min-w-0 max-w-[85%]">
        {msg.type === 'image' ? <ImageBubble msg={msg} /> :
         msg.type === 'audio' ? <AudioBubble msg={msg} /> :
         msg.type === 'video' ? <VideoBubble msg={msg} /> :
         msg.type === 'error' ? <ErrorBubble msg={msg} /> :
         msg.type === 'agent' ? <AgentBubble msg={msg} loading={loading} /> :
         <TextBubble msg={msg} />}
      </div>
    </div>
  )
}

function TextBubble({ msg }) {
  return (
    <div className="px-3.5 py-2.5"
      style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px 18px 18px 18px', border: '1px solid rgba(255,255,255,0.07)', userSelect: 'text', cursor: 'text' }}>
      {msg.streaming && !msg.content ? <Dots /> : <MarkdownBlock text={msg.content} />}
    </div>
  )
}

function ImageBubble({ msg }) {
  const fsRoot   = useStore(s => s.fsRoot)
  const loadFile = useStore(s => s.loadFile)

  // Start with the in-memory data URL if present, otherwise null (will be resolved from VFS)
  const [src, setSrc] = useState(
    msg.content && msg.content !== '[media]' ? msg.content : null
  )

  useEffect(() => {
    // Already have the data URL in memory — nothing to do
    if (src) return
    // No saved filename — can't look it up
    if (!msg.savedName) return
    // Find the file node in the Pictures folder by name
    const pictures = (fsRoot.children || []).find(n => n.name === 'Pictures')
    if (!pictures) return
    const node = (pictures.children || []).find(n => n.name === msg.savedName && n.type === 'file')
    if (!node) return
    loadFile(node.id).then(content => { if (content) setSrc(content) })
  }, [msg.savedName, fsRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasContent = !!src
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      {hasContent
        ? <img src={src} alt="Generated" className="w-full block" style={{ maxHeight: 380, objectFit: 'contain', background: '#000' }} />
        : <div className="h-28 flex items-center justify-center text-white/25 text-[12px]">Image not available</div>}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {msg.caption && <p className="text-[11px] text-white/30 truncate">{msg.caption}</p>}
          {msg.savedName && <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5"><Check size={10} /> Saved: <span className="font-mono">{msg.savedName}</span></p>}
        </div>
        {hasContent && (
          <a href={src} download={msg.savedName || 'image.png'}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/80 transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <Download size={13} />
          </a>
        )}
      </div>
    </div>
  )
}

function AudioBubble({ msg }) {
  const fsRoot   = useStore(s => s.fsRoot)
  const loadFile = useStore(s => s.loadFile)
  const audioRef = useRef(null)

  const [src,         setSrc]         = useState(msg.content && msg.content !== '[media]' ? msg.content : null)
  const [playing,     setPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)

  useEffect(() => {
    if (src) return
    if (!msg.savedName) return
    const music = (fsRoot.children || []).find(n => n.name === 'Music')
    if (!music) return
    const node = (music.children || []).find(n => n.name === msg.savedName && n.type === 'file')
    if (!node) return
    loadFile(node.id).then(content => { if (content) setSrc(content) })
  }, [msg.savedName, fsRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) audioRef.current.pause(); else audioRef.current.play()
  }

  const seek = (e) => {
    if (!audioRef.current || !duration) return
    const rect  = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="rounded-2xl p-3" style={{ background: 'rgba(90,50,200,0.12)', border: '1px solid rgba(130,80,255,0.22)' }}>
      {src && (
        <audio ref={audioRef} src={src} preload="metadata"
          onPlay={()           => setPlaying(true)}
          onPause={()          => setPlaying(false)}
          onEnded={()          => { setPlaying(false); setCurrentTime(0) }}
          onLoadedMetadata={e  => setDuration(e.target.duration)}
          onTimeUpdate={e      => setCurrentTime(e.target.currentTime)} />
      )}
      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <button onClick={togglePlay} disabled={!src}
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ background: src ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,0.08)',
                   boxShadow: src ? '0 0 12px rgba(124,58,237,0.4)' : 'none' }}>
          {playing
            ? <Pause size={15} className="text-white" />
            : <Play  size={15} className="text-white" style={{ marginLeft: 2 }} />}
        </button>

        {/* Progress + time */}
        <div className="flex-1 min-w-0">
          <div className="relative h-1.5 rounded-full cursor-pointer mb-1.5 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            onClick={seek}>
            <div className="absolute inset-y-0 left-0 rounded-full transition-none"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#818cf8)' }} />
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{fmt(currentTime)}</span>
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{duration > 0 ? fmt(duration) : '--:--'}</span>
          </div>
        </div>

        {/* Download */}
        {src && (
          <a href={src} download={msg.savedName || 'audio.mp3'}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}>
            <Download size={13} />
          </a>
        )}
      </div>

      {!src && <p className="text-[12px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Audio not available</p>}
      {msg.savedName && (
        <p className="text-[11px] flex items-center gap-1 mt-2" style={{ color: 'rgba(52,211,153,0.8)' }}>
          <Check size={10} /> Saved: <span className="font-mono">{msg.savedName}</span>
        </p>
      )}
    </div>
  )
}

function VideoBubble({ msg }) {
  const fsRoot   = useStore(s => s.fsRoot)
  const loadFile = useStore(s => s.loadFile)
  const videoRef = useRef(null)

  const [src,         setSrc]         = useState(msg.content && msg.content !== '[media]' ? msg.content : null)
  const [playing,     setPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [volume,      setVolume]      = useState(1)
  const [muted,       setMuted]       = useState(false)
  const [showVol,     setShowVol]     = useState(false)
  const [fullscreen,  setFullscreen]  = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (src) return
    if (!msg.savedName) return
    const videos = (fsRoot.children || []).find(n => n.name === 'Videos')
    if (!videos) return
    const node = (videos.children || []).find(n => n.name === msg.savedName && n.type === 'file')
    if (!node) return
    loadFile(node.id).then(content => { if (content) setSrc(content) })
  }, [msg.savedName, fsRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync fullscreen state with browser events
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) videoRef.current.pause(); else videoRef.current.play()
  }

  const seek = (e) => {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    setMuted(v === 0)
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0 }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    const next = !muted
    setMuted(next)
    videoRef.current.muted = next
  }

  const toggleFullscreen = () => {
    if (!wrapRef.current) return
    if (!document.fullscreenElement) wrapRef.current.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const volIcon = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'

  return (
    <div ref={wrapRef} className="rounded-2xl overflow-hidden"
      style={{ background: '#000', border: '1px solid rgba(130,80,255,0.22)' }}>
      {/* Video element — native controls hidden */}
      {src
        ? <video ref={videoRef} src={src} className="w-full block" preload="metadata"
            style={{ maxHeight: fullscreen ? '100vh' : 320, display: 'block', background: '#000' }}
            onPlay={()          => setPlaying(true)}
            onPause={()         => setPlaying(false)}
            onEnded={()         => { setPlaying(false); setCurrentTime(0) }}
            onLoadedMetadata={e => setDuration(e.target.duration)}
            onTimeUpdate={e     => setCurrentTime(e.target.currentTime)}
            onClick={togglePlay} />
        : <div className="h-44 flex items-center justify-center text-[12px]"
            style={{ color: 'rgba(255,255,255,0.2)' }}>Video not available</div>
      }

      {/* Custom control bar */}
      <div className="px-3 pt-2 pb-2.5" style={{ background: 'rgba(10,5,25,0.92)' }}>
        {/* Progress bar */}
        <div className="relative h-1 rounded-full cursor-pointer mb-2.5 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.1)' }}
          onClick={seek}>
          <div className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#818cf8)', transition: 'width 0.1s linear' }} />
        </div>

        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button onClick={togglePlay} disabled={!src}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center active:scale-95 transition-all"
            style={{ background: src ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,0.08)',
                     boxShadow: src ? '0 0 10px rgba(124,58,237,0.45)' : 'none' }}>
            {playing
              ? <Pause size={12} className="text-white" />
              : <Play  size={12} className="text-white" style={{ marginLeft: 1 }} />}
          </button>

          {/* Time */}
          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {fmt(currentTime)} / {duration > 0 ? fmt(duration) : '--:--'}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="relative flex items-center" onMouseEnter={() => setShowVol(true)} onMouseLeave={() => setShowVol(false)}>
            <button onClick={toggleMute} disabled={!src}
              className="text-[13px] leading-none px-1 disabled:opacity-30" title="Toggle mute">
              {volIcon}
            </button>
            {showVol && src && (
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={changeVolume}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-20 accent-violet-500"
                style={{ writingMode: 'horizontal-tb', transform: 'translateX(-50%)' }} />
            )}
          </div>

          {/* Fullscreen */}
          {src && (
            <button onClick={toggleFullscreen}
              className="flex-shrink-0 p-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {fullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
            </button>
          )}

          {/* Download */}
          {src && (
            <a href={src} download={msg.savedName || 'video.mp4'}
              className="flex-shrink-0 p-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
              <Download size={12} />
            </a>
          )}
        </div>

        {msg.savedName && (
          <p className="text-[10px] flex items-center gap-1 mt-1.5" style={{ color: 'rgba(52,211,153,0.75)' }}>
            <Check size={9} /> Saved: <span className="font-mono">{msg.savedName}</span>
          </p>
        )}
      </div>
    </div>
  )
}

function ErrorBubble({ msg }) {
  return (
    <div className="px-3.5 py-2.5 flex items-start gap-2"
      style={{ background: 'rgba(239,68,68,0.1)', borderRadius: '6px 18px 18px 18px', border: '1px solid rgba(239,68,68,0.22)', userSelect: 'text', cursor: 'text' }}>
      <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
      <span className="text-[13px] text-red-300">{msg.content}</span>
    </div>
  )
}

function AgentBubble({ msg, loading }) {
  const plan = msg.plan
  const step = msg.step ?? 0
  const done = msg.done ?? false
  if (!plan) return null
  const todos = plan.todos || []
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(130,80,255,0.07)', border: '1px solid rgba(130,80,255,0.18)' }}>
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(130,80,255,0.12)', background: 'rgba(130,80,255,0.1)' }}>
        <FolderGit2 size={14} className="text-violet-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-violet-200">{plan.projectName}</div>
          <div className="text-[11px] text-white/40 truncate">{plan.description}</div>
        </div>
        {done && (
          <span className="text-[10px] px-2 py-0.5 rounded-full text-emerald-300"
            style={{ background: 'rgba(52,211,153,0.13)', border: '1px solid rgba(52,211,153,0.22)' }}>Done</span>
        )}
        {!done && loading && (
          <span className="text-[10px] px-2 py-0.5 rounded-full text-violet-300"
            style={{ background: 'rgba(130,80,255,0.15)', border: '1px solid rgba(130,80,255,0.3)' }}>Building...</span>
        )}
      </div>
      {todos.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
          {todos.map((todo, i) => {
            const isDone   = step > i || done
            const isActive = !done && loading && i === Math.min(step, todos.length - 1)
            return (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isDone ? 'rgba(52,211,153,0.18)' : isActive ? 'rgba(130,80,255,0.28)' : 'rgba(255,255,255,0.07)',
                    border:     isDone ? '1px solid rgba(52,211,153,0.35)' : isActive ? '1px solid rgba(130,80,255,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  }}>
                  {isDone   ? <Check size={9} className="text-emerald-300" /> :
                   isActive ? <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> :
                              <span className="w-1 h-1 rounded-full bg-white/20" />}
                </div>
                <span className="text-[12px]"
                  style={{ color: isDone ? 'rgba(255,255,255,0.65)' : isActive ? '#c4b5fd' : 'rgba(255,255,255,0.35)' }}>
                  {todo}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="px-4 py-2.5 text-[11px] text-white/30"
        style={todos.length > 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 } : {}}>
        {done
          ? `${plan.files.length} files created in Projects/${plan.projectName}`
          : loading
            ? `Creating files... (${Math.min(step + 1, plan.files.length)}/${plan.files.length})`
            : `${plan.files.length} files planned`}
      </div>
    </div>
  )
}

// --------------- Sidebar ---------------------------------------------------

function ChatSidebar({ chats, activeChatId, onSelect, onNew, onDelete, canNew, open, onClose, overlay }) {
  if (!open) return null
  return (
    <>
      {overlay && (
        <div className="absolute inset-0 z-20" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      )}
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: 200,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(5,5,15,0.97)',
          ...(overlay ? { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 30 } : {}),
        }}>
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Chats</span>
          <div className="flex items-center gap-1.5">
            <button onClick={onNew} disabled={!canNew} title={canNew ? 'New Chat' : 'Limit of 10 chats reached'}
              className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 transition-colors"
              style={{ background: 'rgba(130,80,255,0.25)', color: '#c4b5fd' }}>
              <Plus size={13} />
            </button>
            {overlay && (
              <button onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded-lg"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {chats.map(chat => (
            <button key={chat.id} onClick={() => { onSelect(chat.id); if (overlay) onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left group"
              style={{
                background:  chat.id === activeChatId ? 'rgba(130,80,255,0.15)' : 'transparent',
                borderLeft:  chat.id === activeChatId ? '2px solid rgba(130,80,255,0.55)' : '2px solid transparent',
              }}>
              <span className="flex-1 text-[11px] truncate min-w-0"
                style={{ color: chat.id === activeChatId ? '#ddd6fe' : 'rgba(255,255,255,0.4)' }}>
                {chat.title}
              </span>
              <span className="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                onClick={(e) => onDelete(chat.id, e)}
                style={{ color: 'rgba(255,255,255,0.25)', cursor: 'pointer' }}>
                <Trash2 size={10} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// --------------- Main component --------------------------------------------

export default function AIAssistant({ windowId }) {
  const fsRoot     = useStore(s => s.fsRoot)
  const createNode = useStore(s => s.createNode)
  const writeFile  = useStore(s => s.writeFile)
  const timezone   = useStore(s => s.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const adminConfig = useAuthStore(s => s.adminConfig)
  const aiDebug    = AI_DEBUG || !!adminConfig?.aiDebug
  const currentUserId = useAuthStore(s => s.currentUserId)
  const isLoggedIn = !!currentUserId && !currentUserId.startsWith('guest-')
  const isGuest = !!currentUserId?.startsWith('guest-')

  // ── Chat state — null until loaded (shows spinner) ─────────────────────────
  const [chats, setChats]               = useState(null)
  const [chatsReady, setChatsReady]     = useState(false)
  const [activeChatId, setActiveChatId] = useState(null)
  const [guestPrompt, setGuestPrompt]   = useState(false)

  // ── Load chats on mount (server for logged-in users, localStorage for guests) ──
  useEffect(() => {
    let cancelled = false
    async function loadChats() {
      if (isLoggedIn) {
        try {
          const serverChats = await chatGetAll()
          if (cancelled) return
          if (serverChats && serverChats.length > 0) {
            // Restore the welcome message (uiOnly) into each chat so it displays correctly
            const withWelcome = serverChats.map(c => ({
              ...c,
              messages: c.messages.length > 0
                ? c.messages
                : [{ ...WELCOME }],
            }))
            setChats(withWelcome)
            setActiveChatId(withWelcome[0].id)
          } else {
            // Server empty — check localStorage for migration (first login on new backend)
            const legacy = loadChatsLocal()
            const initial = legacy || [makeChat()]
            setChats(initial)
            setActiveChatId(initial[0].id)
            // Migrate legacy data to server immediately
            if (legacy) legacy.forEach(c => chatPut(c))
          }
        } catch {
          if (cancelled) return
          const legacy = loadChatsLocal()
          const initial = legacy || [makeChat()]
          setChats(initial)
          setActiveChatId(initial[0].id)
        }
      } else {
        // Guest — use localStorage only
        const local = loadChatsLocal()
        const initial = local || [makeChat()]
        if (!cancelled) { setChats(initial); setActiveChatId(initial[0].id) }
      }
      if (!cancelled) setChatsReady(true)
    }
    loadChats()
    return () => { cancelled = true }
  // Reload when user logs in/out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  // ── Persist chats when they change ─────────────────────────────────────────
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (!chatsReady || !chats) return
    if (!isLoggedIn) {
      // Guest — keep localStorage up to date
      saveChatsLocal(chats)
      return
    }
    // Logged in — debounce saves to server (one PUT per modified chat)
    // Skip if any chat currently has a streaming message (mid-generation)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      chats.forEach(chat => {
        const hasStreaming = chat.messages.some(m => m.streaming)
        if (!hasStreaming) chatPut(chat)
      })
    }, 1500)
    return () => clearTimeout(saveTimerRef.current)
  }, [chats, chatsReady, isLoggedIn])

  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const abortRef                    = useRef(false)
  const activeChatIdRef             = useRef(activeChatId)

  const [attachments, setAttachments] = useState([])
  const fileInputRef                  = useRef(null)

  const [showModeMenu, setShowModeMenu] = useState(false)

  const [quota, setQuota]           = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isNarrow, setIsNarrow]       = useState(false)
  const containerRef = useRef(null)
  const bottomRef    = useRef(null)
  const modeMenuRef  = useRef(null)

  // keep ref current
  useEffect(() => { activeChatIdRef.current = activeChatId }, [activeChatId])

  // quota
  const refreshQuota = useCallback(() => { aiQuota().then(setQuota).catch(() => {}) }, [])
  useEffect(() => { refreshQuota() }, [refreshQuota])

  // scroll to bottom when active chat messages change
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chats, activeChatId])

  // close mode menu on outside click
  useEffect(() => {
    const h = e => { if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) setShowModeMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // responsive: observe container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      const narrow = w < 480
      setIsNarrow(narrow)
      // auto-collapse sidebar when window shrinks below threshold
      setSidebarOpen(prev => narrow ? false : prev)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeChat = chats?.find(c => c.id === activeChatId) || chats?.[0]
  const mode       = activeChat?.mode || 'text'
  const ModeIcon   = MODES.find(m => m.id === mode)?.Icon || MessageSquare

  // --- chat mutations (functional updates, safe for async) ---

  const patchChat = useCallback((id, patch) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  const appendMsg = useCallback((chatId, msg) => {
    setChats(prev => prev.map(c =>
      c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c
    ))
  }, [])

  const updateMsg = useCallback((chatId, idx, patch) => {
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c
      return { ...c, messages: c.messages.map((m, i) => i === idx ? { ...m, ...patch } : m) }
    }))
  }, [])

  // --- filesystem helpers ---

  const findSystemFolder = useCallback((name) =>
    (fsRoot.children || []).find(n => n.name === name) || null, [fsRoot])

  const saveToFs = useCallback((folderName, fileName, content) => {
    const folder = findSystemFolder(folderName)
    if (!folder) return null
    return createNode(folder.id, 'file', fileName, content)
  }, [findSystemFolder, createNode])

  // --- chat management ---

  const newChat = useCallback(() => {
    if ((chats?.length ?? 0) >= MAX_CHATS) return
    const c = makeChat()
    setChats(prev => [c, ...prev])
    setActiveChatId(c.id)
    setInput('')
    setAttachments([])
  }, [chats?.length])

  const deleteChat = useCallback((id, e) => {
    e.stopPropagation()
    if (isLoggedIn) chatDel(id)  // immediate server delete
    setChats(prev => {
      const next = prev.filter(c => c.id !== id)
      if (next.length === 0) {
        const fresh = makeChat()
        setActiveChatId(fresh.id)
        return [fresh]
      }
      if (id === activeChatIdRef.current) setActiveChatId(next[0].id)
      return next
    })
  }, [isLoggedIn])

  const maybeTitleChat = useCallback((chatId, text) => {
    setChats(prev => prev.map(c => {
      if (c.id !== chatId || c.title !== 'New Chat') return c
      return { ...c, title: text.slice(0, 38) + (text.length > 38 ? '...' : '') }
    }))
  }, [])

  const setMode = useCallback((m) => {
    patchChat(activeChatIdRef.current, { mode: m })
    setShowModeMenu(false)
  }, [patchChat])

  // --- file attachment ---

  const handleAttach = useCallback((e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (file.type.startsWith('image/')) {
          // Downsample to max 512px before sending — prevents "request entity too large"
          const img = new Image()
          img.onload = () => {
            const MAX = 512
            const scale = Math.min(1, MAX / Math.max(img.width, img.height))
            const canvas = document.createElement('canvas')
            canvas.width  = Math.round(img.width  * scale)
            canvas.height = Math.round(img.height * scale)
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
            setAttachments(prev => [...prev, { name: file.name, dataUrl, mimeType: 'image/jpeg' }])
          }
          img.src = ev.target.result
        } else {
          setAttachments(prev => [...prev, { name: file.name, dataUrl: ev.target.result, mimeType: file.type }])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  // --- send ---

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || loading) return
    if (isGuest) { setGuestPrompt(true); return }

    const chatId = activeChatIdRef.current
    const chat   = chats.find(c => c.id === chatId)
    if (!chat) return

    // Auto-detect if in text mode — use detected mode for processing only,
    // do NOT switch the UI mode so the chat stays on "Chat (auto)".
    let effectiveMode = chat.mode
    if (effectiveMode === 'text' && text) {
      const detected = detectMode(text)
      if (detected !== 'text') effectiveMode = detected
    }

    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    setLoading(true)
    abortRef.current = false
    if (text) maybeTitleChat(chatId, text)

    // Append user message
    const userMsg = {
      role: 'user', type: 'text',
      content: text || '(attachment)',
      attachments: currentAttachments,
    }
    appendMsg(chatId, userMsg)
    const msgs = [...(chat.messages || []), userMsg]

    // Declared outside try so catch can access it to replace the placeholder
    // bubble with the error instead of appending a second bubble.
    let replyIdx = -1

    try {
      // ── Local reply — no credits burned (runs even in debug mode) ─────────
      if (effectiveMode === 'text' && text) {
        const local = localReply(text, timezone)
        if (local) {
          appendMsg(chatId, { role: 'assistant', type: 'text', streaming: false, content: local })
          aiSpend(text.length, local.length)  // deduct OS user quota for local reply
          return
        }
      }

      if (aiDebug) {
        replyIdx = msgs.length
        const debugLabels = {
          image: 'image generation',
          video: 'video generation',
          music: 'music generation',
          project: 'project scaffolding',
          fileEdit: 'file editing',
          fileCreate: 'file creation',
          text: 'chat / text generation',
        }
        const modeKey = effectiveMode === 'text'
          ? (detectFileEdit(text) ? 'fileEdit' : detectFileCreate(text) ? 'fileCreate' : 'text')
          : effectiveMode
        const label = debugLabels[modeKey] || modeKey
        appendMsg(chatId, {
          role: 'assistant', type: 'text', streaming: false,
          content: `🐛 **[Debug]** This query will be sent to **${label}**.`,
        })
        return
      }

      if (effectiveMode === 'image') {
        replyIdx = msgs.length
        appendMsg(chatId, { role: 'assistant', type: 'text', content: 'Generating image...', streaming: true })
        const { dataUrl, revisedPrompt } = await aiImage(text)
        const name = `AI_Gen_${cuid()}.png`
        saveToFs('Pictures', name, dataUrl)
        updateMsg(chatId, replyIdx, { type: 'image', content: dataUrl, caption: revisedPrompt || '', savedName: name, streaming: false })

      } else if (effectiveMode === 'video') {
        replyIdx = msgs.length
        appendMsg(chatId, { role: 'assistant', type: 'text', content: 'Generating video... this may take up to 2 minutes.', streaming: true })
        const { url } = await aiVideo(text, 8)
        const name = `AI_Gen_${cuid()}.mp4`
        saveToFs('Videos', name, url)
        updateMsg(chatId, replyIdx, { type: 'video', content: url, savedName: name, streaming: false })

      } else if (effectiveMode === 'music') {
        replyIdx = msgs.length
        appendMsg(chatId, { role: 'assistant', type: 'text', content: 'Generating music...', streaming: true })
        const { dataUrl } = await aiMusic(text)
        const ext  = dataUrl.startsWith('data:audio/wav') ? 'wav' : 'mp3'
        const name = `AI_Gen_${cuid()}.${ext}`
        saveToFs('Music', name, dataUrl)
        updateMsg(chatId, replyIdx, { type: 'audio', content: dataUrl, savedName: name, streaming: false })

      } else if (effectiveMode === 'project') {
        const hasPlan  = !!chat.agentPlan
        const isPatch  = hasPlan && /\b(fix|bug|error|broken|wrong|incorrect|update|modify|change|improve|add|remove|refactor|adjust|correct|repair|edit|rewrite)\b/i.test(text)
        // A message in an existing project chat that isn't a patch request is a
        // conversational question about the code — route to chat mode, not create.
        const isQuestion = hasPlan && !isPatch

        if (isQuestion) {
          // ── Chat about existing project ──────────────────────────────────
          const fileList = (chat.agentPlan.files || []).map(f => `${f.folder ? f.folder + '/' : ''}${f.name}`).join('\n')
          const projectCtx = `The user is asking about a project called "${chat.agentPlan.projectName}": ${chat.agentPlan.description}\n\nProject files:\n${fileList}\n\nAnswer the user's question about this project. Use markdown formatting.`
          const apiMsgs = msgs
            .filter(m => !m.uiOnly)
            .map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content || '',
            }))
          replyIdx = msgs.length
          appendMsg(chatId, { role: 'assistant', type: 'text', content: '', streaming: true })
          let reply = ''
          await aiChat(apiMsgs, projectCtx, (delta) => {
            if (abortRef.current) return
            reply += delta
            updateMsg(chatId, replyIdx, { content: reply })
          })
          updateMsg(chatId, replyIdx, { streaming: false })

        } else if (isPatch) {
          // ── Patch mode: edit existing files in the project ───────────────
          replyIdx = msgs.length
          appendMsg(chatId, { role: 'assistant', type: 'text', content: 'Analyzing and patching the project...', streaming: true })
          // Pass recent chat history so the model has context for references like "this logic"
          const patchHistory = msgs.slice(-8).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || '',
          }))
          const patch = await aiAgentPatch(text, chat.agentPlan, patchHistory)
          const patchFiles = patch.files || []

          const projectsFolder  = findSystemFolder('Projects')
          if (!projectsFolder) throw new Error('Projects folder not found.')

          // Navigate / create the project folder path
          const resolveOrCreate = (parentId, parts) => {
            let pid = parentId
            for (const part of parts.filter(Boolean)) {
              const state    = useStore.getState()
              const pNode    = findNode(state.fsRoot, pid)
              const existing = (pNode?.children || []).find(n => n.name === part)
              pid = existing ? existing.id : createNode(pid, 'folder', part, '')
            }
            return pid
          }

          // Find root project folder (create if somehow missing)
          const state0     = useStore.getState()
          const projFolder = findNode(state0.fsRoot, projectsFolder.id)
          const projRoot   = (projFolder?.children || []).find(n => n.name === chat.agentPlan.projectName)
          const projRootId = projRoot ? projRoot.id : createNode(projectsFolder.id, 'folder', chat.agentPlan.projectName, '')

          for (const file of patchFiles) {
            const parentId = resolveOrCreate(projRootId, (file.folder || '').split('/'))
            const state1   = useStore.getState()
            const parentNode = findNode(state1.fsRoot, parentId)
            const existing   = (parentNode?.children || []).find(n => n.name === file.name && n.type === 'file')
            if (existing) {
              writeFile(existing.id, file.content)
            } else {
              createNode(parentId, 'file', file.name, file.content)
            }
            await new Promise(r => setTimeout(r, 40))
          }

          // Merge patch files into stored agentPlan so future patches know the full state
          const mergedFiles = [...(chat.agentPlan.files || [])]
          for (const pf of patchFiles) {
            const idx = mergedFiles.findIndex(f => f.name === pf.name && (f.folder || '') === (pf.folder || ''))
            if (idx >= 0) mergedFiles[idx] = pf; else mergedFiles.push(pf)
          }
          patchChat(chatId, { agentPlan: { ...chat.agentPlan, files: mergedFiles } })

          updateMsg(chatId, replyIdx, {
            type: 'text', streaming: false,
            content: `Patched **${patchFiles.length}** file${patchFiles.length !== 1 ? 's' : ''} in **Projects/${chat.agentPlan.projectName}**.`,
          })

        } else {
          // ── Create mode: scaffold a brand new project ────────────────────
          replyIdx = msgs.length
          // Show a streaming text bubble while the plan is being generated
          // (keeps the fallback Dots from appearing alongside it)
          appendMsg(chatId, { role: 'assistant', type: 'text', content: '', streaming: true })
          const plan = await aiAgentPlan(text)
          // Store plan on the chat for future patch/question routing
          patchChat(chatId, { agentPlan: plan })
          // Replace the placeholder with the agent bubble immediately —
          // todos are now visible and will animate live as files are written
          updateMsg(chatId, replyIdx, { type: 'agent', plan, step: 0, done: false, streaming: false })

          const projectsFolder = findSystemFolder('Projects')
          if (!projectsFolder) throw new Error('Projects folder not found.')
          const projectFolderId = createNode(projectsFolder.id, 'folder', plan.projectName, '')
          for (let fi = 0; fi < plan.files.length; fi++) {
            // Advance step counter — maps to todos (1 todo per file roughly)
            const todoStep = Math.floor((fi / plan.files.length) * (plan.todos?.length || 1))
            updateMsg(chatId, replyIdx, { step: todoStep })
            const file = plan.files[fi]
            let parentId = projectFolderId
            if (file.folder) {
              for (const part of file.folder.split('/').filter(Boolean)) {
                const state = useStore.getState()
                const parentNode = findNode(state.fsRoot, parentId)
                const existing   = (parentNode?.children || []).find(n => n.name === part && n.type === 'folder')
                parentId = existing ? existing.id : createNode(parentId, 'folder', part, '')
              }
            }
            createNode(parentId, 'file', file.name, file.content)
            await new Promise(r => setTimeout(r, 80))
          }
          // Mark done
          updateMsg(chatId, replyIdx, { step: (plan.todos?.length || 1), done: true })
        }

      } else if (detectFileEdit(text)) {
        // ── File-edit mode: read an existing file, modify it, write it back ─
        // 1. Try explicit filename.ext in the current message
        let targetName = (text.match(FILE_EXT_RE) || [])[0] || null

        // 2. Scan recent chat history for the last mentioned filename
        if (!targetName) {
          for (let mi = msgs.length - 1; mi >= 0; mi--) {
            const match = (msgs[mi].content || '').match(FILE_EXT_RE)
            if (match) { targetName = match[0]; break }
          }
        }

        // 3. Map a spoken type word to an extension and find the newest matching file
        if (!targetName) {
          // Build a flat list of candidate extensions from the message
          const candidates = []
          for (const [word, exts] of Object.entries(TYPE_EXT_MAP)) {
            if (new RegExp(`\\b${word.replace(' ', '\\s+')}\\b`, 'i').test(text)) {
              candidates.push(...exts)
            }
          }
          if (candidates.length > 0) {
            const SEARCH_FOLDERS2 = ['Documents', 'Desktop', 'Projects', 'Pictures', 'Videos', 'Music']
            outer: for (const fn of SEARCH_FOLDERS2) {
              const fd = findSystemFolder(fn)
              if (!fd) continue
              const byDate = [...(fd.children || [])].sort((a, b) =>
                new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
              )
              for (const ext of candidates) {
                const found = byDate.find(n => n.type === 'file' && n.name.endsWith('.' + ext))
                if (found) { targetName = found.name; break outer }
              }
            }
          }
        }

        // 4. Last resort: newest file in Documents/Desktop
        if (!targetName) {
          const LAST_RESORT = ['Documents', 'Desktop']
          for (const fn of LAST_RESORT) {
            const fd = findSystemFolder(fn)
            if (!fd) continue
            const newest = [...(fd.children || [])]
              .filter(n => n.type === 'file')
              .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0]
            if (newest) { targetName = newest.name; break }
          }
        }

        // 5. Find the node in the filesystem
        const SEARCH_FOLDERS = ['Documents', 'Desktop', 'Projects', 'Pictures', 'Videos', 'Music']
        let targetNode = null
        if (targetName) {
          for (const folderName of SEARCH_FOLDERS) {
            const folder = findSystemFolder(folderName)
            if (!folder) continue
            const found = (folder.children || []).find(n => n.type === 'file' && n.name === targetName)
            if (found) { targetNode = found; break }
          }
        }

        if (!targetNode) {
          // Ambiguous — fall through to normal chat rather than showing a dead-end error
          replyIdx = msgs.length
          appendMsg(chatId, { role: 'assistant', type: 'text', content: '', streaming: true })
          let reply = ''
          const apiMsgsFallback = msgs.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '' }))
          await aiChat(apiMsgsFallback, 'You are a helpful assistant. Use markdown formatting.', delta => {
            if (abortRef.current) return
            reply += delta
            updateMsg(chatId, replyIdx, { content: reply })
          })
          updateMsg(chatId, replyIdx, { streaming: false })
        } else {
          replyIdx = msgs.length
          appendMsg(chatId, { role: 'assistant', type: 'text', content: `Reading **${targetNode.name}**...`, streaming: true })
          const existingContent = await useStore.getState().loadFile(targetNode.id)
          updateMsg(chatId, replyIdx, { content: `Editing **${targetNode.name}**...` })
          const updated = await aiEditFile(existingContent || '', text, targetNode.name)
          useStore.getState().writeFile(targetNode.id, updated)
          const ext2          = targetNode.name.split('.').pop().toLowerCase()
          const previewLines2 = updated.split('\n').slice(0, 15).join('\n')
          const preview2      = `\`\`\`${ext2}\n${previewLines2}${updated.split('\n').length > 15 ? '\n...' : ''}\n\`\`\``
          updateMsg(chatId, replyIdx, {
            streaming: false,
            content: `Updated **${targetNode.name}**\n\n${preview2}\n\nSaved to filesystem.`,
          })
        }

      } else if (detectFileCreate(text)) {
        // ── File-create mode: write a named file directly to the filesystem ──
        replyIdx = msgs.length
        appendMsg(chatId, { role: 'assistant', type: 'text', content: 'Creating file...', streaming: true })
        const fileResult = await aiCreateFile(text)
        let { fileName, folder, content: fileContent } = fileResult

        // PDF → always handled by aiCreateFile which produces a real PDF blob
        // (no extension swap needed here — the util handles it)

        // saveToFs returns the new node id (truthy) on success, null if the folder doesn't exist.
        const savedId     = saveToFs(folder, fileName, fileContent)
        const actualFolder = savedId ? folder : 'Documents'
        if (!savedId) saveToFs('Documents', fileName, fileContent)

        // Show a content preview (first 15 lines)
        const ext          = fileName.split('.').pop().toLowerCase()
        const previewLines = fileContent.split('\n').slice(0, 15).join('\n')
        const preview      = `\`\`\`${ext}\n${previewLines}${fileContent.split('\n').length > 15 ? '\n...' : ''}\n\`\`\``
        updateMsg(chatId, replyIdx, {
          streaming: false,
          content: `Created **${fileName}**\n\n${preview}\n\nSaved to **${actualFolder}/${fileName}**.`,
        })

      } else {
        // text / chat / code
        const apiMsgs = msgs.filter(m => !m.uiOnly).map(m => {
          if (m.role === 'assistant') return { role: 'assistant', content: m.content || '' }
          if ((m.attachments || []).length > 0) {
            return {
              role: 'user',
              content: [
                ...m.attachments.filter(a => a.mimeType?.startsWith('image/')).map(a => ({
                  type: 'image_url', image_url: { url: a.dataUrl },
                })),
                { type: 'text', text: m.content },
              ],
            }
          }
          return { role: 'user', content: m.content }
        })
        replyIdx = msgs.length
        appendMsg(chatId, { role: 'assistant', type: 'text', content: '', streaming: true })
        let reply = ''
        await aiChat(apiMsgs, 'You are a helpful, concise assistant. Use markdown formatting.', (delta) => {
          if (abortRef.current) return
          reply += delta
          updateMsg(chatId, replyIdx, { content: reply })
        })
        updateMsg(chatId, replyIdx, { streaming: false })
      }
    } catch (err) {
      if (!abortRef.current) {
        // If a placeholder bubble was already appended, replace it with the error.
        // Otherwise append a fresh error bubble (e.g. pre-flight failures).
        if (typeof replyIdx === 'number' && replyIdx >= 0) {
          updateMsg(chatId, replyIdx, { type: 'error', content: err.message, streaming: false })
        } else {
          appendMsg(chatId, { role: 'assistant', type: 'error', content: err.message })
        }
      }
    } finally {
      setLoading(false)
      abortRef.current = false
      refreshQuota()
    }
  }, [input, loading, chats, attachments, timezone, aiDebug,
      patchChat, appendMsg, updateMsg, saveToFs, findSystemFolder, createNode, writeFile,
      maybeTitleChat, refreshQuota])



  const canAttach = mode === 'text' || mode === 'project'
  const quotaPct  = quota?.quota > 0 ? Math.min(100, (quota.used / quota.quota) * 100) : 0
  const quotaFill = quotaPct > 90 ? '#ef4444' : quotaPct > 70 ? '#f59e0b' : '#8b5cf6'

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden relative"
      style={{ background: 'rgba(10,10,20,0.98)', color: '#fff', fontFamily: 'system-ui,sans-serif' }}>

      {/* ── Guest sign-up prompt modal ── */}
      <AnimatePresence>
        {guestPrompt && (
          <motion.div
            key="ai-guest-prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.72)' }}
            onClick={() => setGuestPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.92, opacity: 0, y: 8  }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              className="relative flex flex-col items-center text-center rounded-3xl overflow-hidden mx-4"
              style={{
                width: 340,
                background: 'linear-gradient(155deg,#0f0b28 0%,#13103a 60%,#0a0818 100%)',
                border: '1px solid rgba(130,80,255,0.35)',
                boxShadow: '0 0 0 1px rgba(130,80,255,0.12), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(100,60,200,0.18)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute" style={{ top: -60, left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(130,80,255,0.22) 0%,transparent 65%)', pointerEvents: 'none' }} />
              <button onClick={() => setGuestPrompt(false)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-xl z-10 transition-colors"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                <X size={14} />
              </button>
              <div className="relative mt-8 mb-1" style={{ fontSize: 52, lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(130,80,255,0.6))' }}>🤖</div>
              <h2 className="relative mt-4 text-[20px] font-extrabold tracking-tight px-4" style={{ letterSpacing: '-0.02em' }}>
                <span style={{ background: 'linear-gradient(90deg,#c4b5fd,#818cf8,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sign in to chat with AI</span>
              </h2>
              <p className="relative mt-2 px-6 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.42)' }}>
                The AI Assistant is only available to registered users. Create a free account to unlock unlimited conversations.
              </p>
              <div className="relative flex flex-wrap justify-center gap-2 mt-5 px-6">
                {['Unlimited chats', 'Chat history saved & synced', 'All content generation', 'Monthly token renewal'].map(f => (
                  <span key={f} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                    style={{ background: 'rgba(130,80,255,0.14)', border: '1px solid rgba(130,80,255,0.28)', color: '#c4b5fd' }}>
                    <Check size={9} strokeWidth={3} />{f}
                  </span>
                ))}
              </div>
              <div className="relative flex flex-col gap-2.5 w-full px-6 mt-7 mb-7">
                <button
                  onClick={() => { setGuestPrompt(false); useAuthStore.getState().logout() }}
                  className="w-full py-3 rounded-2xl text-[13.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.95),rgba(99,50,210,0.95))', boxShadow: '0 6px 28px rgba(130,80,255,0.45)' }}>
                  Create Free Account
                </button>
                <button
                  onClick={() => setGuestPrompt(false)}
                  className="w-full py-2.5 rounded-2xl text-[13px] font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.42)' }}>
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading spinner — while chats load from server */}
      {(!chatsReady || !chats) ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading chats…</span>
          </div>
        </div>
      ) : (<>

      {/* Left sidebar — collapsible */}
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelect={id => { setActiveChatId(id); setInput(''); setAttachments([]) }}
        onNew={newChat}
        onDelete={deleteChat}
        canNew={(chats?.length ?? 0) < MAX_CHATS}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        overlay={isNarrow}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header bar — toggle + active chat title */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
            style={{ background: sidebarOpen && !isNarrow ? 'rgba(130,80,255,0.2)' : 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            title={sidebarOpen ? 'Hide chats' : 'Show chats'}>
            <MessageSquare size={13} />
          </button>
          <span className="flex-1 text-[12px] truncate min-w-0" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {activeChat?.title || 'New Chat'}
          </span>
          {quota && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full" style={{ width: `${quotaPct}%`, background: quotaFill }} />
              </div>
              <span className="text-[10px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {fmtTokens(quota.free)} tokens
              </span>
              {quota.renewsAt && (
                <span className="text-[10px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.18)' }}>
                  · Renews {new Date(quota.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0">
          {(activeChat?.messages || []).map((msg, i) => (
            <MessageBubble key={i} msg={msg} loading={loading} />
          ))}
          {loading && !(activeChat?.messages || []).at(-1)?.streaming && (activeChat?.messages || []).at(-1)?.type !== 'agent' && (
            <div className="flex gap-2.5">
              <AvatarBot />
              <Dots />
            </div>
          )}
          <div ref={bottomRef} className="h-0" aria-hidden="true" />
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex-shrink-0 flex gap-2 px-4 py-2 flex-wrap"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {attachments.map((a, i) => (
              <div key={i} className="relative group">
                {a.mimeType?.startsWith('image/') ? (
                  <img src={a.dataUrl} alt={a.name} className="h-14 w-14 object-cover rounded-lg" />
                ) : (
                  <div className="h-14 w-14 rounded-lg flex items-center justify-center text-[9px] text-white/50 text-center p-1 overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {a.name}
                  </div>
                )}
                <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: '#ef4444', opacity: 0 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex-shrink-0 px-3 pb-3 pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-end gap-2">

            {/* Attach */}
            {canAttach && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAttach} />
                <button onClick={() => fileInputRef.current?.click()} disabled={loading}
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg disabled:opacity-30 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                  <Paperclip size={14} />
                </button>
              </>
            )}

            {/* Textarea */}
            <textarea
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              disabled={loading}
              placeholder={PLACEHOLDERS[mode] || 'Ask anything...'}
              className="flex-1 resize-none px-3 py-2 rounded-xl text-[13px] text-white outline-none"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                lineHeight: 1.5, maxHeight: 120, minHeight: 40,
              }}
            />

            {/* Mode dropdown */}
            <div className="relative flex-shrink-0" ref={modeMenuRef}>
              <button onClick={() => setShowModeMenu(v => !v)} disabled={loading}
                className="h-8 px-2 flex items-center gap-1 rounded-lg disabled:opacity-40 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.55)',
                }}>
                <ModeIcon size={12} />
                <ChevronDown size={10} />
              </button>
              {showModeMenu && (
                <div className="absolute bottom-full right-0 mb-1 rounded-xl overflow-hidden z-50 w-36"
                  style={{ background: 'rgba(18,18,30,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 28px rgba(0,0,0,0.6)' }}>
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-left transition-colors"
                      style={{
                        color:      mode === m.id ? '#c4b5fd' : 'rgba(255,255,255,0.65)',
                        background: mode === m.id ? 'rgba(130,80,255,0.18)' : 'transparent',
                      }}>
                      <m.Icon size={13} />
                      {m.label}
                      {m.id === 'text' && <span className="ml-auto text-[9px] opacity-40">auto</span>}
                    </button>
                  ))}

                </div>
              )}
            </div>

            {/* Send */}
            <button onClick={send} disabled={loading || (!input.trim() && attachments.length === 0)}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl disabled:opacity-40 transition-all"
              style={{ background: 'rgba(130,80,255,0.6)', border: '1px solid rgba(130,80,255,0.5)' }}>
              <Send size={14} />
            </button>

          </div>

          {/* Cost hint — shown for paid generation modes */}
          {GENERATION_COSTS[mode] && (() => {
            const c = GENERATION_COSTS[mode]
            return (
              <div className="px-1 pt-1.5"
                style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                {c.type === 'perSecond' ? (
                  <>
                    This will cost{' '}
                    <span style={{ color: 'rgba(255,200,80,0.7)' }}>{c.amount.toLocaleString()}</span>
                    {' '}tokens per second (minimum{' '}
                    <span style={{ color: 'rgba(255,200,80,0.7)' }}>{c.min.toLocaleString()}</span>
                    {' '}tokens) for video generation.*
                  </>
                ) : (
                  <>
                    This will cost a flat fee of{' '}
                    <span style={{ color: 'rgba(255,200,80,0.7)' }}>{c.amount.toLocaleString()}</span>
                    {' '}tokens for {mode} generation.*
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </div>
      </>)}
    </div>
  )
}