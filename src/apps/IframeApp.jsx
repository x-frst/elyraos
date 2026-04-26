import { useState, useEffect, useRef } from "react"
import { ExternalLink, AlertCircle, MousePointerClick, X, Check } from "lucide-react"
import { useStore } from "../store/useStore"
import { useAuthStore } from "../store/useAuthStore"
import { motion, AnimatePresence } from "framer-motion"

export default function IframeApp({ windowId, app }) {
  const currentUserId = useAuthStore(s => s.currentUserId)
  const isGuest = !!currentUserId?.startsWith('guest-')

  const [key, setKey] = useState(0)
  const isCursorApp = app?.showCursor === false
  const [cursorHidden, setCursorHidden] = useState(isCursorApp)
  const [showOverlay, setShowOverlay] = useState(isCursorApp)
  const iframeRef = useRef(null)
  const catcherRef = useRef(null)

  // Apply body cursor
  useEffect(() => {
    if (!isCursorApp) return
    document.body.style.cursor = cursorHidden ? 'none' : ''
    return () => { document.body.style.cursor = '' }
  }, [cursorHidden, isCursorApp])

  // When pointer lock is released by game (Escape) — show overlay again
  useEffect(() => {
    if (!isCursorApp) return
    const onChange = () => {
      if (!document.pointerLockElement && cursorHidden) {
        setShowOverlay(true)
      }
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [isCursorApp, cursorHidden])

  // "/" key handler — attached to the transparent catcher div (works until game gets pointer lock)
  function handleCatcherKey(e) {
    if (e.key !== '/') return
    e.preventDefault()
    setCursorHidden(v => {
      const next = !v
      if (!next && document.pointerLockElement) document.exitPointerLock()
      setShowOverlay(next)
      useStore.setState({
        notification: {
          message: next ? 'Cursor hidden — Esc to release, / to show' : 'Cursor visible — / to hide',
          id: Date.now(),
          type: 'info',
        }
      })
      return next
    })
  }

  // Clicking overlay: hide it, focus the transparent catcher (not iframe directly)
  // so "/" keeps working until the game acquires pointer lock itself
  function handleOverlayClick() {
    setShowOverlay(false)
    // Small delay so overlay is gone before focus shift
    setTimeout(() => catcherRef.current?.focus(), 0)
  }

  if (!app?.url) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-3"
        style={{ background: "rgba(14,14,24,0.85)", color: "rgba(255,255,255,0.4)" }}>
        <AlertCircle size={32} />
        <p className="text-sm">No URL configured for this app.</p>
      </div>
    )
  }

  // Guest users cannot run iframe apps
  if (isGuest) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full text-center px-8 overflow-hidden"
        style={{ background: 'linear-gradient(155deg,#0f0b28 0%,#13103a 60%,#0a0818 100%)' }}>
        {/* glow */}
        <div className="absolute" style={{ top: -80, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(130,80,255,0.2) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div className="relative" style={{ fontSize: 52, lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(130,80,255,0.55))', marginBottom: 18 }}>🏪</div>
        <h2 className="relative text-[19px] font-extrabold tracking-tight mb-2"
          style={{ background: 'linear-gradient(90deg,#c4b5fd,#818cf8,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Sign in to run this app
        </h2>
        <p className="relative text-[13px] leading-relaxed max-w-xs mb-6" style={{ color: 'rgba(255,255,255,0.42)' }}>
          App Center apps are only available to registered users. Create a free account to install and launch any app.
        </p>
        <div className="relative flex flex-wrap justify-center gap-2 mb-7">
          {['Install any app', 'Sync across devices', 'Browse all categories'].map(f => (
            <span key={f} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
              style={{ background: 'rgba(130,80,255,0.14)', border: '1px solid rgba(130,80,255,0.28)', color: '#c4b5fd' }}>
              <Check size={9} strokeWidth={3} />{f}
            </span>
          ))}
        </div>
        <button
          onClick={() => useAuthStore.getState().logout()}
          className="relative px-6 py-3 rounded-2xl text-[13.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.95),rgba(99,50,210,0.95))', boxShadow: '0 6px 28px rgba(130,80,255,0.45)' }}>
          Create Free Account
        </button>
      </div>
    )
  }

  // Sites that block iframe embedding — open in a real browser tab instead
  if (app.allowIframe === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8"
        style={{ background: "rgba(14,14,24,0.92)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ExternalLink size={28} className="text-white/50" />
        </div>
        <div>
          <p className="text-white font-semibold text-[15px] mb-1">{app.title}</p>
          <p className="text-white/40 text-[13px] leading-relaxed max-w-xs">
            This app restricts embedding. Click below to open it in your browser.
          </p>
        </div>
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:opacity-90"
          style={{ background: "rgba(var(--nova-accent-rgb,130,80,255),0.75)" }}
        >
          <ExternalLink size={14} />
          Open in Browser
        </a>
        <p className="text-white/20 text-[11px]">{app.url}</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full" style={{ colorScheme: 'only light' }}>
      {/* Transparent keyboard catcher — pointer-events:none so all mouse events pass through to iframe,
          but it holds focus so "/" works until the game acquires its own pointer lock */}
      {isCursorApp && !showOverlay && (
        <div
          ref={catcherRef}
          tabIndex={0}
          onKeyDown={handleCatcherKey}
          className="absolute inset-0 outline-none"
          style={{ zIndex: 2, pointerEvents: 'none' }}
        />
      )}
      {/* Click-to-play overlay */}
      {isCursorApp && showOverlay && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 select-none"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', cursor: 'pointer' }}
          onClick={handleOverlayClick}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <MousePointerClick size={28} className="text-white/80" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-[14px] mb-1">Click to play</p>
            <p className="text-white/40 text-[12px]">
              <span className="text-white/60 font-mono bg-white/10 px-1.5 py-0.5 rounded">Esc</span>
              {' '}to release cursor &nbsp;·&nbsp;{' '}
              <span className="text-white/60 font-mono bg-white/10 px-1.5 py-0.5 rounded">/</span>
              {' '}to toggle cursor mode
            </p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={key}
        src={app.url}
        className="flex-1 w-full border-none"
        title={app.title}
        allow="fullscreen; autoplay; camera; microphone; pointer-lock"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads allow-pointer-lock"
        referrerPolicy="no-referrer"
        style={{ colorScheme: 'only light' }}
      />
    </div>
  )
}
