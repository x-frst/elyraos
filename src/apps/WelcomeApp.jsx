import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useStore } from "../store/useStore"
import { BRANDING } from "../config.js"

const FEATURES = [
  { id: "files",    emoji: "🗂️", title: "My Files",        desc: "Cloud file manager — drag & drop, grid/list views, keyboard shortcuts, rename, move, copy and organize everything." },
  { id: "notepad",  emoji: "📝", title: "Notepad",          desc: "Write, edit, and instantly save text files to your personal cloud filesystem." },
  { id: "code",     emoji: "💻", title: "Code Editor",      desc: "Syntax-highlighted editor for JS, TS, HTML, CSS, Python, and more — open any file from your FS." },
  { id: "terminal", emoji: "⚡", title: "Terminal",         desc: "Shell-like terminal: ls, cd, mkdir, touch, cat, rm, echo and more. Feels like home." },
  { id: "ai",       emoji: "🤖", title: "AI Assistant",     desc: "Ask anything. Get coding help, writing assistance, explanations, or just a conversation." },
  { id: "browser",  emoji: "🌐", title: "Browser",          desc: "Built-in web browser — surf the internet, search, and save pages to your filesystem." },
  { id: "paint",    emoji: "🎨", title: "Paint",            desc: "Digital canvas: pencil, eraser, shapes, fill, text, color picker, undo/redo — create art in your OS." },
  { id: "photos",   emoji: "🖼️", title: "Photo Viewer",    desc: "View, zoom, rotate, flip; set any image as your wallpaper. Supports JPG, PNG, GIF, WebP." },
  { id: "music",    emoji: "🎵", title: "Music Player",     desc: "Play local audio files or stream 6 built-in internet radio stations with a live visualizer." },
  { id: "video",    emoji: "🎬", title: "Video Player",     desc: "Full-featured player with speed control, Picture-in-Picture, loop, and your OS video library." },
  { id: "calendar", emoji: "📅", title: "Calendar",         desc: "Schedule events, add locations and notes, browse months, and see your day at a glance." },
  { id: "docview",  emoji: "📄", title: "Doc Viewer",       desc: "Opens PDFs, HTML, Markdown, CSV, spreadsheets, and plain text with beautiful rendering." },
  { id: "archive",  emoji: "📦", title: "Archive Manager",  desc: "Browse ZIP files, extract files or folders, and compress anything with one click." },
  { id: "camera",   emoji: "📷", title: "Camera",           desc: "Capture photos or record video in-app. Files go straight to your cloud storage." },
  { id: "calc",     emoji: "🧮", title: "Calculator",       desc: "Clean calculator with full keyboard support for all your arithmetic needs." },
  { id: "settings", emoji: "⚙️", title: "Settings",         desc: "Customize wallpapers, accent colors, dock size & behavior, timezone, and manage your account." },
  { id: "appcenter", emoji: "🏪", title: "App Center", featured: true, desc: `${BRANDING.name}'s built-in app store — discover, install, and manage third-party web apps. Browse Games, Productivity, Developer Tools, Graphics & Design, Utilities, and more. Install apps to your Desktop with one click, then uninstall them any time.` },
]

// CSS-art mini previews — shown when a card is clicked
function Preview({ id, emoji }) {
  switch (id) {
    case "files": return (
      <div className="h-full p-3 flex flex-col gap-1.5">
        {[["📁","Documents"],["🖼️","Pictures"],["🎬","Videos"],["💻","Projects"]].map(([e,n],i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] text-white/75" style={{ background:"rgba(255,255,255,0.07)" }}>
            <span>{e}</span><span>{n}</span>
          </div>
        ))}
      </div>
    )
    case "notepad": return (
      <div className="h-full p-3 font-mono text-[11px]" style={{ background:"rgba(0,0,0,0.45)" }}>
        <div className="text-yellow-300 mb-1"># Quick Notes</div>
        {["Buy groceries 🛒","Call dentist 📞","Review pull requests 💻"].map((t,i) => (
          <div key={i} className="text-white/55">· {t}</div>
        ))}
        <div className="mt-1.5 text-white/30 flex items-center gap-1">
          Line 4 · UTF-8<span className="ml-2 w-0.5 h-3 bg-violet-400 inline-block animate-pulse" />
        </div>
      </div>
    )
    case "code": return (
      <div className="h-full p-3 font-mono text-[10px]" style={{ background:"rgba(0,0,0,0.55)" }}>
        <div><span className="text-blue-400">const</span> <span className="text-yellow-300">greet</span> <span className="text-white"> = </span><span className="text-orange-300">(name)</span> <span className="text-white">=&gt;</span></div>
        <div className="pl-3"><span className="text-green-300">{"`Hello, ${name}!`"}</span></div>
        <div className="mt-1 text-violet-400">{'// ' + BRANDING.name + ' Code Editor'}</div>
        <div className="mt-1 text-white/25">JS · TypeScript · Python · HTML · CSS</div>
      </div>
    )
    case "terminal": return (
      <div className="h-full p-3 font-mono text-[11px]" style={{ background:"#030712" }}>
        <div><span className="text-green-400">{BRANDING.name.toLowerCase()}:~$</span><span className="text-white"> ls</span></div>
        <div className="text-blue-300">Documents  Pictures  Videos  Projects</div>
        <div className="mt-1"><span className="text-green-400">{BRANDING.name.toLowerCase()}:~$</span><span className="text-white"> pwd</span></div>
        <div className="text-white/50">/home</div>
        <div className="mt-1"><span className="text-green-400">{BRANDING.name.toLowerCase()}:~$</span><span className="text-violet-400 animate-pulse"> _</span></div>
      </div>
    )
    case "ai": return (
      <div className="h-full p-3 flex flex-col gap-2 text-[11px]">
        <div className="self-end bg-violet-600/70 rounded-xl rounded-br-sm px-2.5 py-1.5 text-white max-w-[90%]">Explain quantum computing simply</div>
        <div className="rounded-xl rounded-bl-sm px-2.5 py-1.5 text-white/80 max-w-[95%] leading-relaxed" style={{ background:"rgba(255,255,255,0.08)" }}>
          Quantum computers use qubits that can be 0 and 1 at the same time...
        </div>
      </div>
    )
    case "browser": return (
      <div className="h-full flex flex-col text-[10px]" style={{ background:"#181830" }}>
        <div className="h-6 flex items-center gap-1.5 px-2" style={{ background:"rgba(0,0,0,0.5)", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-500/70" /><div className="w-2 h-2 rounded-full bg-yellow-500/70" /><div className="w-2 h-2 rounded-full bg-green-500/70" /></div>
          <div className="flex-1 h-3 rounded bg-white/10 px-1.5 flex items-center text-white/40 text-[9px] truncate">https://nova-search.io</div>
        </div>
        <div className="flex-1 flex items-center justify-center text-white/25 text-lg">🌐</div>
      </div>
    )
    case "paint": return (
      <div className="h-full relative" style={{ background:"#fff" }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 90">
          <circle cx="60" cy="45" r="28" fill="rgba(139,92,246,0.3)" stroke="rgba(139,92,246,0.85)" strokeWidth="2"/>
          <path d="M20 72 Q60 18 100 72" stroke="rgba(239,68,68,0.85)" strokeWidth="2.5" fill="none"/>
          <rect x="14" y="12" width="24" height="18" rx="3" fill="rgba(59,130,246,0.35)" stroke="rgba(59,130,246,0.85)" strokeWidth="1.5"/>
          <ellipse cx="92" cy="24" rx="12" ry="8" fill="rgba(16,185,129,0.35)" stroke="rgba(16,185,129,0.85)" strokeWidth="1.5"/>
        </svg>
      </div>
    )
    case "photos": return (
      <div className="h-full flex items-center justify-center" style={{ background:"linear-gradient(135deg,#1e1b4b,#0f172a)" }}>
        <div className="text-4xl">🖼️</div>
      </div>
    )
    case "music": return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ background:"rgba(0,0,0,0.5)" }}>
        <div className="text-2xl">🎵</div>
        <div className="text-[11px] text-white/50">Groove Salad Radio</div>
        <div className="flex gap-1 items-end" style={{ height: 24 }}>
          {[3, 5, 8, 6, 4, 7, 5].map((h, i) => (
            <div key={i} className="w-1 rounded-full bg-violet-400/85"
              style={{ height: h * 3, animation: `bounce 0.75s ${i * 0.11}s infinite alternate ease-in-out` }} />
          ))}
        </div>
      </div>
    )
    case "video": return (
      <div className="h-full flex flex-col items-center justify-center gap-1" style={{ background:"#000" }}>
        <div className="w-10 h-10 rounded-full border-2 border-white/25 flex items-center justify-center">
          <span className="text-white/50 text-xl pl-0.5">▶</span>
        </div>
        <div className="text-white/25 text-[10px]">1920×1080 · 60fps</div>
      </div>
    )
    case "calendar": return (
      <div className="h-full p-2 text-[10px] text-white/70">
        <div className="text-center font-bold mb-1 text-white text-[11px]">March 2026</div>
        <div className="grid grid-cols-7 text-center gap-px text-white/35">
          {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} className="py-0.5 font-semibold text-[9px]">{d}</div>)}
          {[,"","","","","","",1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31].slice(0,35).map((d,i) => (
            <div key={i} className={`py-0.5 rounded ${d===27?"bg-violet-600 text-white":""}`}>{d||""}</div>
          ))}
        </div>
      </div>
    )
    case "appcenter": return (
      <div className="h-full flex" style={{ background:"#07071a" }}>
        <div className="flex flex-col gap-0.5 py-2 px-1 flex-shrink-0" style={{ width:86, borderRight:"1px solid rgba(255,255,255,0.08)", background:"rgba(0,0,0,0.35)", fontSize:10 }}>
          {[["🏠","Home",true],["📥","My Apps",false],["🎮","Games",false],["💼","Productivity",false],["🎨","Design",false],["💻","Dev Tools",false],["🔧","Utilities",false]].map(([e,l,active],i) => (
            <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg" style={{ color:active?"#fff":"rgba(255,255,255,0.38)", background:active?"rgba(130,80,255,0.45)":"transparent" }}>
              <span>{e}</span><span className="truncate">{l}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 p-2 grid gap-1.5" style={{ gridTemplateColumns:"repeat(auto-fill,minmax(78px,1fr))", alignContent:"start" }}>
          {[["🎮","Pixel Quest"],["📊","DataViz"],["🎵","SoundBoard"],["🔷","ShapeForge"],["🌍","GeoSphere"],["📰","NewsFlash"]].map(([e,n],i) => (
            <div key={i} className="rounded-xl p-2 text-center" style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize:18, marginBottom:3 }}>{e}</div>
              <div style={{ fontSize:9.5, color:"#fff", fontWeight:600 }} className="truncate">{n}</div>
              <div className="mt-1.5 rounded-md py-0.5" style={{ fontSize:9, fontWeight:700, color:"#fff", background:"rgba(130,80,255,0.55)" }}>Install</div>
            </div>
          ))}
        </div>
      </div>
    )
    case "settings": return (
      <div className="h-full p-2.5">
        {[["🖼️","Wallpaper"],["🎨","Accent Color"],["⚙️","Dock Size"],["👤","Account"]].map(([e,l],i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 text-[11px] text-white/70" style={{ background:"rgba(255,255,255,0.06)" }}>
            <span>{e}</span><span>{l}</span>
          </div>
        ))}
      </div>
    )
    default: return (
      <div className="h-full flex items-center justify-center text-4xl">{emoji}</div>
    )
  }
}

export default function WelcomeApp({ windowId, context }) {
  const closeWindow = useStore(s => s.closeWindow)
  const openWindow  = useStore(s => s.openWindow)
  const username    = context?.username || "there"
  const [activeId, setActiveId] = useState(null)

  return (
    <div className="relative flex flex-col h-full overflow-hidden select-none"
      style={{ background: "linear-gradient(155deg,#06030f 0%,#0c0828 45%,#06030f 100%)", fontFamily: "system-ui,sans-serif", color: "#fff" }}>

      {/* Background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute" style={{ top:-180, left:-150, width:520, height:520, borderRadius:"50%", background:"radial-gradient(circle,rgba(130,80,255,0.16) 0%,transparent 65%)" }} />
        <div className="absolute" style={{ bottom:-120, right:-120, width:420, height:420, borderRadius:"50%", background:"radial-gradient(circle,rgba(59,130,246,0.13) 0%,transparent 65%)" }} />
        <div className="absolute" style={{ top:"38%", right:"12%", width:280, height:280, borderRadius:"50%", background:"radial-gradient(circle,rgba(236,72,153,0.09) 0%,transparent 65%)" }} />
      </div>

      {/* Hero header */}
      <div className="relative flex-shrink-0 flex flex-col items-center text-center px-6 pt-8 pb-5">
        <motion.div
          initial={{ scale: 0.3, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>
          {BRANDING.logoEmoji}
        </motion.div>
        <motion.h1
          initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 300, damping: 24 }}
          style={{ fontSize: "clamp(1.5rem,3.5vw,2.4rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, lineHeight: 1.2 }}>
          Welcome,{" "}
          <span style={{ background: "linear-gradient(90deg,#c4b5fd,#818cf8,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            {username}
          </span>!
        </motion.h1>
        <motion.p
          initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.30 }}
          style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, maxWidth: 440, lineHeight: 1.6 }}>
          Your personal web-based OS is ready. Click any card below to preview what each app does.
        </motion.p>
      </div>

      {/* Feature grid */}
      <div className="relative flex-1 overflow-y-auto px-5 pb-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        <div className="grid gap-2.5 max-w-3xl mx-auto"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {FEATURES.map((f, i) => {
            const isActive  = activeId === f.id
            const isFeatured = f.featured === true
            return (
              <motion.div key={f.id}
                initial={{ y: 22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.08 + i * 0.03, type: "spring", stiffness: 280, damping: 26 }}
                onClick={() => setActiveId(prev => prev === f.id ? null : f.id)}
                className="cursor-pointer rounded-2xl overflow-hidden"
                style={{
                  ...(isFeatured ? { gridColumn: "1 / -1" } : {}),
                  background: isActive ? "rgba(130,80,255,0.18)" : isFeatured ? "rgba(130,80,255,0.07)" : "rgba(255,255,255,0.04)",
                  border: isActive ? "1px solid rgba(130,80,255,0.65)" : isFeatured ? "1px solid rgba(130,80,255,0.32)" : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: isFeatured ? "0 0 28px rgba(130,80,255,0.12)" : isActive ? "0 0 22px rgba(130,80,255,0.18)" : "none",
                  transition: "background 0.2s, border 0.2s, box-shadow 0.2s",
                }}>
                {isFeatured ? (
                  <div className="flex items-center gap-4 p-4">
                    <div style={{ fontSize: 38, lineHeight: 1, flexShrink: 0 }}>{f.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</span>
                        <span style={{ background: "linear-gradient(90deg,#f59e0b,#d97706)", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.04em", flexShrink: 0 }}>FEATURED</span>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12.5, lineHeight: 1.6 }}>{f.desc}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 11, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
                      {isActive ? "▲ hide" : "▼ preview"}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5">
                    <div style={{ fontSize: 22, marginBottom: 7 }}>{f.emoji}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{f.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 11, lineHeight: 1.55 }}
                      className="line-clamp-2">{f.desc}</div>
                  </div>
                )}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: isFeatured ? 145 : 112 }} exit={{ height: 0 }}
                      style={{ overflow: "hidden", borderTop: "1px solid rgba(130,80,255,0.22)" }}>
                      <div style={{ height: isFeatured ? 145 : 112 }}>
                        <Preview id={f.id} emoji={f.emoji} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}
        className="relative flex-shrink-0 flex items-center justify-between px-6 py-3 flex-wrap gap-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)" }}>
        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12 }}>
          {BRANDING.name} v{BRANDING.version} · Your files, themes & apps are synced to the cloud
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => {
            closeWindow(windowId)
            useStore.getState().reloadFs().then(() => {
              openWindow("files", "files", "My Files")
            })
          }}
            style={{ background: "linear-gradient(135deg,rgba(130,80,255,0.9),rgba(99,102,241,0.9))", border: "1px solid rgba(130,80,255,0.55)", borderRadius: 12, padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.82"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Get Started →
          </button>
          <button
            onClick={() => closeWindow(windowId)}
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 20px", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.13)"; e.currentTarget.style.color = "#fff" }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)" }}>
            Close
          </button>
        </div>
      </motion.div>

      <style>{`
        @keyframes bounce {
          from { transform: scaleY(0.5); }
          to   { transform: scaleY(1.4); }
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}
