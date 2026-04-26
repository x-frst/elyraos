import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { useStore } from "../store/useStore"

function MenuItem({ item, onClose }) {
  const [subOpen, setSubOpen] = useState(false)
  const [openLeft, setOpenLeft] = useState(false)
  const containerRef = useRef(null)
  const closeTimer = useRef(null)

  if (item.type === "separator")
    return <div className="my-1 mx-2 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />

  if (item.children?.length) {
    const isSmall = window.innerWidth < 640

    if (isSmall) {
      // Mobile: accordion — expands inline, overlapping the rest of the menu
      return (
        <div ref={containerRef}>
          <button
            className="flex items-center justify-between w-full px-4 py-1.5 text-[13px] text-white/85 hover:bg-white/10 transition-colors gap-8"
            onClick={(e) => { e.stopPropagation(); setSubOpen(v => !v) }}>
            <span>{item.label}</span>
            <ChevronRight size={11} className="text-white/40 flex-shrink-0"
              style={{ transform: subOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {subOpen && (
            <div className="mx-2 mb-1 rounded-xl overflow-hidden"
              style={{ background: "rgba(18,18,30,0.99)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {item.children.map((child, i) => (
                <MenuItem key={i} item={child} onClose={onClose} />
              ))}
            </div>
          )}
        </div>
      )
    }

    // Desktop: hover-based side flyout
    const handleEnter = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setOpenLeft(rect.right + 180 > window.innerWidth)
      }
      setSubOpen(true)
    }
    const handleLeave = () => {
      closeTimer.current = setTimeout(() => setSubOpen(false), 80)
    }
    return (
      <div ref={containerRef} className="relative"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}>
        <button className="flex items-center justify-between w-full px-4 py-1.5 text-[13px] text-white/85 hover:bg-white/10 transition-colors gap-8">
          <span>{item.label}</span>
          <ChevronRight size={11} className="text-white/40" style={{ transform: openLeft ? 'rotate(180deg)' : 'none', transition: 'transform 0.1s' }} />
        </button>
        {subOpen && (
          <div className="absolute top-0 z-[1001]"
            style={openLeft ? { right: '100%', paddingRight: 6 } : { left: '100%', paddingLeft: 6 }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}>
            <div className="py-1 rounded-xl min-w-[160px]"
              style={{
                background: "rgba(28,28,44,0.97)", border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)", backdropFilter: "blur(24px)",
              }}>
              {item.children.map((child, i) => (
                <MenuItem key={i} item={child} onClose={onClose} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      disabled={item.disabled}
      className="block w-full text-left px-4 py-1.5 text-[13px] text-white/85 hover:bg-white/10 disabled:opacity-35 disabled:cursor-default transition-colors"
      onClick={(e) => { e.stopPropagation(); item.action?.(); onClose() }}
    >
      {item.label}
    </button>
  )
}

export default function ContextMenu() {
  const contextMenu     = useStore(s => s.contextMenu)
  const hideContextMenu = useStore(s => s.hideContextMenu)
  const ref = useRef(null)

  // After rendering, measure the menu and adjust position to keep it on screen
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!contextMenu || !ref.current) return
    const mw = ref.current.offsetWidth  || 220
    const mh = ref.current.offsetHeight || 50
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rx = contextMenu.x
    const ry = contextMenu.y
    const x = rx + mw + 8 > vw ? Math.max(8, rx - mw) : rx
    const y = ry + mh + 8 > vh ? Math.max(8, ry - mh) : ry
    setPos({ x, y })
  }, [contextMenu])

  // Also set initial approximate position before we can measure
  const initX = contextMenu ? Math.min(contextMenu.x, window.innerWidth  - 225) : 0
  const initY = contextMenu ? Math.min(contextMenu.y, window.innerHeight - 50)  : 0

  useEffect(() => {
    if (!contextMenu) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) hideContextMenu() }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [contextMenu, hideContextMenu])

  if (!contextMenu) return null


  return (
    <motion.div
      ref={ref}
      data-contextmenu
      key={`${contextMenu.x}-${contextMenu.y}`}
      initial={{ opacity: 0, scale: 0.94, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[1000] py-1 rounded-xl min-w-[200px]"
      style={{
        left: pos.x || initX,
        top:  pos.y || initY,
        background: "rgba(28,28,44,0.96)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {contextMenu.items.map((item, i) => (
        <MenuItem key={i} item={item} onClose={hideContextMenu} />
      ))}
    </motion.div>
  )
}
