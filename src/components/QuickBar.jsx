import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Maximize2, Minimize2, Search, Clock, Sparkles, ChevronLeft, ChevronRight,
         ChevronUp, ChevronDown, MoreHorizontal, LogOut, User } from "lucide-react"
import { useStore } from "../store/useStore"
import { useAuthStore } from "../store/useAuthStore"

function QuickBtn({ icon, onClick, active, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white transition-all hover:scale-110"
      style={{ background: active ? "rgba(var(--nova-accent-rgb,130,80,255),0.5)" : "rgba(255,255,255,0.1)" }}
    >
      {icon}
    </button>
  )
}

// Renders via a portal at document.body so it escapes the panel's backdropFilter stacking context
function ClockPopover({ position, anchorRect }) {
  const [time, setTime] = useState(new Date())
  const timezone = useStore(s => s.settings?.timezone)
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!anchorRect) return null
  const tz = timezone || undefined
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const localDate = tz ? new Date(time.toLocaleString('en-US', { timeZone: tz })) : time
  const GAP = 10
  const s = { position: 'fixed', zIndex: 9900 }
  if (position === 'right')       { s.right = window.innerWidth - anchorRect.left + GAP; s.top = anchorRect.top }
  else if (position === 'left')   { s.left  = anchorRect.right  + GAP;                  s.top = anchorRect.top }
  else                             { s.top   = anchorRect.bottom + GAP; s.left = anchorRect.left + anchorRect.width / 2; s.transform = 'translateX(-50%)' }
  return createPortal(
    <div style={{ ...s, background: "rgba(18,18,32,0.97)", border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 16, padding: 16,
                  minWidth: 160, color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', ...(tz && { timeZone: tz }) })}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{days[localDate.getDay()]}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{months[localDate.getMonth()]} {localDate.getDate()}, {localDate.getFullYear()}</div>
    </div>,
    document.body
  )
}

function PositionMenuPortal({ position, anchorRect, currentPosition, onChange }) {
  if (!anchorRect) return null
  const GAP = 10
  const s = { position: 'fixed', zIndex: 9900 }
  if (position === 'right')       { s.right = window.innerWidth - anchorRect.left + GAP; s.top = anchorRect.top }
  else if (position === 'left')   { s.left  = anchorRect.right  + GAP;                  s.top = anchorRect.top }
  else                             { s.top   = anchorRect.bottom + GAP; s.left = anchorRect.left }
  return createPortal(
    <div style={{ ...s, background: "rgba(20,20,36,0.97)", border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)", borderRadius: 12, overflow: 'hidden',
                  padding: '4px 0', minWidth: 110 }}>
      {POSITIONS.map(p => (
        <button key={p} onClick={() => onChange(p)}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 12,
                   background: 'none', border: 'none', cursor: 'pointer', color: p === currentPosition ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}
          onMouseEnter={e => { if (p !== currentPosition) e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = p === currentPosition ? '#c4b5fd' : 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'none' }}>
          {p === "right" ? "Right side" : p === "left" ? "Left side" : "Top center"}
        </button>
      ))}
    </div>,
    document.body
  )
}

const POSITIONS = ["right", "left", "top"]

export default function QuickBar() {
  const [open, setOpen]               = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showClock, setShowClock]     = useState(false)
  const [showPositionMenu, setShowPositionMenu] = useState(false)
  const [clockAnchorRect, setClockAnchorRect]     = useState(null)
  const [posMenuAnchorRect, setPosMenuAnchorRect] = useState(null)
  const clockBtnRef   = useRef(null)
  const posMenuBtnRef = useRef(null)
  const toggleLauncher  = useStore(s => s.toggleLauncher)
  const openWindow      = useStore(s => s.openWindow)
  const updateSettings  = useStore(s => s.updateSettings)
  const position        = useStore(s => s.settings?.quickbarPosition || "right")
  const logout          = useAuthStore(s => s.logout)
  const currentUsername = useAuthStore(s => s.currentUsername)

  // Hover timeout refs — open on hover, close after delay when mouse leaves
  const openTimer  = useRef(null)
  const closeTimer = useRef(null)

  const handleMouseEnter = useCallback(() => {
    clearTimeout(closeTimer.current)
    openTimer.current = setTimeout(() => setOpen(true), 80)
  }, [])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(openTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setShowClock(false)
      setShowPositionMenu(false)
    }, 280)
  }, [])

  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current) }, [])

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  }

  const changePosition = (pos) => {
    updateSettings({ quickbarPosition: pos })
    setShowPositionMenu(false)
  }

  // ── Layout helpers ──────────────────────────────────────────────────────
  const isVertical = position === "right" || position === "left"
  const isRight = position === "right"
  const isTop   = position === "top"

  const panelVariants = {
    right: { initial: { opacity: 0, x: 20, scaleX: 0.7 }, animate: { opacity: 1, x: 0, scaleX: 1 }, exit: { opacity: 0, x: 20, scaleX: 0.7 } },
    left:  { initial: { opacity: 0, x: -20, scaleX: 0.7 }, animate: { opacity: 1, x: 0, scaleX: 1 }, exit: { opacity: 0, x: -20, scaleX: 0.7 } },
    top:   { initial: { opacity: 0, y: -20, scaleY: 0.7 }, animate: { opacity: 1, y: 0, scaleY: 1 }, exit: { opacity: 0, y: -20, scaleY: 0.7 } },
  }
  const pv = panelVariants[position]

  const wrapperStyle = isRight
    ? { right: 0, top: "50%", transform: "translateY(-50%)" }
    : isTop
    ? { top: 0, left: "50%", transform: "translateX(-50%)" }
    : { left: 0, top: "50%", transform: "translateY(-50%)" }

  const buttonsClass  = isVertical ? "flex flex-col gap-2 p-2 items-center" : "flex flex-row gap-2 p-2 items-center"
  const tabClass      = isVertical ? "flex items-center justify-center w-4 h-16 transition-all" : "flex items-center justify-center h-4 w-16 transition-all"
  const tabRounded    = isRight ? "rounded-l-lg" : isTop ? "rounded-b-lg" : "rounded-r-lg"
  const panelRounded  = isRight ? "rounded-l-2xl" : isTop ? "rounded-b-2xl" : "rounded-r-2xl"
  const panelOrigin   = isRight ? "right center" : isTop ? "center top" : "left center"
  const panelBorderStyle = isRight ? { borderRight: "none" } : isTop ? { borderTop: "none" } : { borderLeft: "none" }

  const TabArrow = open
    ? (isRight ? ChevronRight : isTop ? ChevronDown : ChevronLeft)
    : (isRight ? ChevronLeft  : isTop ? ChevronUp   : ChevronRight)

  return (
    <div
      data-launcher
      className={`fixed z-[850] flex ${isTop ? "flex-col" : "flex-row"} items-center`}
      style={wrapperStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Expanded panel — pull-out with spring animation */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={pv.initial}
            animate={pv.animate}
            exit={pv.exit}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={`${buttonsClass} ${panelRounded} relative`}
            style={{
              background: "rgba(18,18,32,0.90)",
              backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              transformOrigin: panelOrigin,
              ...panelBorderStyle,
            }}
          >
            <QuickBtn icon={isFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
              onClick={toggleFullscreen} active={isFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} />
            <QuickBtn icon={<Search size={16}/>}
              onClick={() => { toggleLauncher(); setOpen(false) }} title="Search" />
            <div ref={clockBtnRef} className="flex items-center justify-center">
              {showClock && <ClockPopover position={position} anchorRect={clockAnchorRect} />}
              <QuickBtn icon={<Clock size={16}/>}
                onClick={() => {
                  if (!showClock && clockBtnRef.current)
                    setClockAnchorRect(clockBtnRef.current.getBoundingClientRect())
                  setShowClock(v => !v)
                  setShowPositionMenu(false)
                }} active={showClock} title="Clock" />
            </div>
            <QuickBtn icon={<Sparkles size={16}/>}
              onClick={() => { openWindow("ai", "ai", "AI Assistant"); setOpen(false) }} title="AI Assistant" />
            {/* Position selector */}
            <div ref={posMenuBtnRef} className="flex items-center justify-center">
              {showPositionMenu && <PositionMenuPortal position={position} anchorRect={posMenuAnchorRect} currentPosition={position} onChange={changePosition} />}
              <QuickBtn icon={<MoreHorizontal size={16}/>}
                onClick={() => {
                  if (!showPositionMenu && posMenuBtnRef.current)
                    setPosMenuAnchorRect(posMenuBtnRef.current.getBoundingClientRect())
                  setShowPositionMenu(v => !v)
                  setShowClock(false)
                }} active={showPositionMenu} title="Position" />
            </div>
            {/* Divider */}
            <div className={isVertical ? "w-full h-px my-0.5" : "h-full w-px mx-0.5"}
              style={{ background: "rgba(255,255,255,0.1)" }} />
            {/* User info */}
            {currentUsername && (
              <div className={`flex items-center gap-1 px-1 ${isVertical ? "flex-col" : "flex-row"}`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  <User size={15} className="text-white/50" />
                </div>
                <span className="text-white/40 text-[10px] max-w-[48px] truncate text-center leading-tight">
                  {currentUsername}
                </span>
              </div>
            )}
            <QuickBtn icon={<LogOut size={16}/>}
              onClick={() => logout()} title={`Sign out${currentUsername ? ` (${currentUsername})` : ''}`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slim pull tab — always visible, kept in front via z-index */}
      <div
        className={`${tabClass} ${tabRounded} cursor-pointer`}
        style={{
          order: isRight ? 1 : -1,
          background: "rgba(130,80,255,0.55)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: isRight ? "-4px 0 16px rgba(130,80,255,0.3)" : isTop ? "0 4px 16px rgba(130,80,255,0.3)" : "4px 0 16px rgba(130,80,255,0.3)",
          backdropFilter: "blur(8px)",
        }}
      >
        <TabArrow size={11} className="text-white/90" />
      </div>
    </div>
  )
}
