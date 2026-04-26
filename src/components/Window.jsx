import { useRef, useState, useCallback, memo } from 'react'
import { motion } from 'framer-motion'
// Titlebar button icons — inline SVG for crispness at small sizes
const IconClose    = () => <svg viewBox="0 0 10 10" fill="none" className="w-full h-full"><line x1="2" y1="2" x2="8" y2="8" stroke="#7a1f1b" strokeWidth="1.6" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="#7a1f1b" strokeWidth="1.6" strokeLinecap="round"/></svg>
const IconMinimize = () => <svg viewBox="0 0 10 10" fill="none" className="w-full h-full"><line x1="2" y1="5" x2="8" y2="5" stroke="#7a5300" strokeWidth="1.6" strokeLinecap="round"/></svg>
const IconMaximize = () => <svg viewBox="0 0 10 10" fill="none" className="w-full h-full"><path d="M2 4V2h2" stroke="#0a4d18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 2h2v2" stroke="#0a4d18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 6v2h2" stroke="#0a4d18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 8h2V6" stroke="#0a4d18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IconRestore  = () => <svg viewBox="0 0 10 10" fill="none" className="w-full h-full"><rect x="3" y="2" width="5" height="5" rx="1" stroke="#0a4d18" strokeWidth="1.5"/><path d="M2 4v4h4" stroke="#0a4d18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
import { useStore } from '../store/useStore'
import { renderApp } from '../apps/renderApp'

// ── Spring config ────────────────────────────────────────────────────────────
const SPRING = { type: 'spring', stiffness: 380, damping: 28, mass: 0.85 }

// True when the viewport is phone-sized AND in portrait orientation (touch-first full-screen layout).
// Landscape mode on touch devices intentionally falls through to the desktop positional layout
// so windows can be moved and are not locked to full-screen.
function isMobile() { return window.innerWidth < 768 && window.innerHeight > window.innerWidth }

export default memo(function Window({ win }) {
  const focusWindow    = useStore(s => s.focusWindow)
  const closeWindow    = useStore(s => s.closeWindow)
  const minimizeWindow = useStore(s => s.minimizeWindow)
  const toggleMaximize = useStore(s => s.toggleMaximize)
  const updateWindowPos  = useStore(s => s.updateWindowPos)
  const updateWindowSize = useStore(s => s.updateWindowSize)
  const titlebarButtonsRight = useStore(s => s.settings?.titlebarButtonsRight)

  // local "closing" animation flag
  const [isClosing, setIsClosing] = useState(false)
  const isDragging  = useRef(false)
  const isResizing  = useRef(false)
  const dragOrigin  = useRef({ mx: 0, my: 0, wx: 0, wy: 0 })
  const resizeOrigin = useRef({ mx: 0, my: 0, ww: 0, wh: 0, wx: 0, wy: 0, dir: '' })
  // DOM ref — position/size written directly during drag/resize (no React re-renders mid-drag)
  const nodeRef = useRef(null)
  const lastPos  = useRef({ x: 0, y: 0 })
  const lastSize = useRef({ w: 0, h: 0 })

  // ── Touch drag (landscape only) ────────────────────────────────────────────
  const onTitlebarTouchStart = useCallback((e) => {
    // Only activate in landscape mode on touch devices
    if (window.innerWidth <= window.innerHeight) return
    if (win.maximized) return
    if (e.target.closest('[data-wcbtn]')) return

    const touch = e.touches[0]
    // Require a 300 ms hold before drag starts, so taps/button presses aren't accidentally dragged
    const longPressTimer = setTimeout(() => {
      isDragging.current = true
      dragOrigin.current = { mx: touch.clientX, my: touch.clientY, wx: win.x, wy: win.y }
      lastPos.current    = { x: win.x, y: win.y }
      focusWindow(win.id)
    }, 300)

    const onTouchMove = (ev) => {
      if (!isDragging.current) {
        // Cancel long-press if finger moved significantly before the timer fires
        const t = ev.touches[0]
        if (Math.abs(t.clientX - touch.clientX) > 8 || Math.abs(t.clientY - touch.clientY) > 8) {
          clearTimeout(longPressTimer)
        }
        return
      }
      ev.preventDefault()
      const t = ev.touches[0]
      const dx = t.clientX - dragOrigin.current.mx
      const dy = t.clientY - dragOrigin.current.my
      const nx = Math.max(0, Math.min(window.innerWidth  - win.width,  dragOrigin.current.wx + dx))
      const ny = Math.max(0, Math.min(window.innerHeight - 80,          dragOrigin.current.wy + dy))
      if (nodeRef.current) {
        nodeRef.current.style.left = nx + 'px'
        nodeRef.current.style.top  = ny + 'px'
      }
      lastPos.current = { x: nx, y: ny }
    }

    const onTouchEnd = () => {
      clearTimeout(longPressTimer)
      if (isDragging.current) {
        isDragging.current = false
        updateWindowPos(win.id, lastPos.current.x, lastPos.current.y)
      }
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
  }, [win.id, win.x, win.y, win.width, win.maximized, focusWindow, updateWindowPos])

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onTitlebarMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.target.closest('[data-wcbtn]')) return
    if (win.maximized) return
    e.preventDefault()
    isDragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, wx: win.x, wy: win.y }
    lastPos.current    = { x: win.x, y: win.y }
    focusWindow(win.id)

    const onMove = (ev) => {
      if (!isDragging.current) return
      const dx = ev.clientX - dragOrigin.current.mx
      const dy = ev.clientY - dragOrigin.current.my
      const nx = Math.max(0, Math.min(window.innerWidth  - win.width,  dragOrigin.current.wx + dx))
      const ny = Math.max(0, Math.min(window.innerHeight - 80,          dragOrigin.current.wy + dy))
      // Write directly to DOM — zero React renders while dragging
      if (nodeRef.current) {
        nodeRef.current.style.left = nx + 'px'
        nodeRef.current.style.top  = ny + 'px'
      }
      lastPos.current = { x: nx, y: ny }
    }
    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Single store commit — one React render when drag finishes
      updateWindowPos(win.id, lastPos.current.x, lastPos.current.y)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [win.id, win.x, win.y, win.width, win.maximized, focusWindow, updateWindowPos])

  // ── Resize (SE corner) ───────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e) => {
    if (e.button !== 0 || win.maximized) return
    e.preventDefault()
    e.stopPropagation()
    isResizing.current = true
    resizeOrigin.current = { mx: e.clientX, my: e.clientY, ww: win.width, wh: win.height, wx: win.x, wy: win.y }
    lastSize.current = { w: win.width, h: win.height }
    focusWindow(win.id)

    const onMove = (ev) => {
      if (!isResizing.current) return
      const dw = ev.clientX - resizeOrigin.current.mx
      const dh = ev.clientY - resizeOrigin.current.my
      const nw = Math.max(360, resizeOrigin.current.ww + dw)
      const nh = Math.max(240, resizeOrigin.current.wh + dh)
      // Write directly to DOM — zero React renders while resizing
      if (nodeRef.current) {
        nodeRef.current.style.width  = nw + 'px'
        nodeRef.current.style.height = nh + 'px'
      }
      lastSize.current = { w: nw, h: nh }
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Single store commit — one React render when resize finishes
      updateWindowSize(win.id, lastSize.current.w, lastSize.current.h)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [win.id, win.width, win.height, win.maximized, focusWindow, updateWindowSize])

  // ── Close with animation ─────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => closeWindow(win.id), 180)
  }, [win.id, closeWindow])

  // ── Derived layout ────────────────────────────────────────────────────────
  const mobile = isMobile()
  const DOCK_H = 80

  const style = mobile
    // On mobile: fill from top to just above the dock using bottom anchor (more reliable than dvh)
    ? { left: 0, top: 0, right: 0, bottom: `${DOCK_H}px`, width: '100%',
        borderRadius: 0, zIndex: win.zIndex, transform: 'none' }
    : win.maximized
    ? { left: 0, top: 0, width: '100vw', height: '100vh', zIndex: win.zIndex }
    : { left: win.x, top: win.y, width: win.width, height: win.height }

  const animate = isClosing
    ? { opacity: 0, scale: 0.82, transition: { duration: 0.16, ease: [0.4, 0, 0.8, 1] } }
    : win.minimized
    ? { opacity: [1, 0.85, 0], scaleX: [1, 0.68, 0.08], scaleY: [1, 0.2, 0.02], y: ['0%', '16vh', '50vh'],
        transition: { duration: 0.36, ease: [0.4, 0, 0.9, 0.6], times: [0, 0.38, 1] } }
    : { opacity: 1, scale: 1, scaleX: 1, scaleY: 1, y: 0,
        transition: { type: 'spring', stiffness: 340, damping: 28, mass: 0.85 } }

  return (
    <motion.div
      ref={nodeRef}
      initial={{ opacity: 0, scale: 0.88, y: -10 }}
      animate={animate}
      className="fixed rounded-xl overflow-hidden flex flex-col"
      style={{ ...style, transformOrigin: 'center bottom',
        zIndex: win.zIndex,
        background: 'rgb(15, 15, 26)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.05)',
        pointerEvents: win.minimized ? 'none' : 'all',
      }}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div
        className="relative flex items-center px-3 h-9 flex-shrink-0 cursor-default"
        style={{
          background: 'rgba(26, 26, 42, 0.96)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
        onMouseDown={onTitlebarMouseDown}
        onTouchStart={onTitlebarTouchStart}
        onDoubleClick={!mobile ? () => toggleMaximize(win.id) : undefined}
      >
      {titlebarButtonsRight ? (
          /* Windows-style: buttons on right — title absolutely centered */
          <>
            {/* Absolutely centered title — same position regardless of button side */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-16">
              <span className="text-white/60 text-[13px] font-medium truncate">{win.title}</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 ml-3 flex-shrink-0" data-wcbtn>
              <button data-wcbtn onClick={() => minimizeWindow(win.id)}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[3px]"
                style={{ background: '#febc2e' }} title="Minimize">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full"><IconMinimize /></span>
              </button>
              {!mobile && (
                <button data-wcbtn onClick={() => toggleMaximize(win.id)}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[2.5px]"
                  style={{ background: '#28c840' }} title={win.maximized ? 'Restore' : 'Maximize'}>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full">
                    {win.maximized ? <IconRestore /> : <IconMaximize />}
                  </span>
                </button>
              )}
              <button data-wcbtn onClick={handleClose}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[2.5px]"
                style={{ background: '#ff5f57' }} title="Close">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full"><IconClose /></span>
              </button>
            </div>
          </>
        ) : (
          /* macOS-style: buttons on left — title absolutely centered */
          <>
            <div className="flex items-center gap-2 mr-3 flex-shrink-0" data-wcbtn>
              <button data-wcbtn onClick={handleClose}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[2.5px]"
                style={{ background: '#ff5f57' }} title="Close">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full"><IconClose /></span>
              </button>
              <button data-wcbtn onClick={() => minimizeWindow(win.id)}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[3px]"
                style={{ background: '#febc2e' }} title="Minimize">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full"><IconMinimize /></span>
              </button>
              {!mobile && (
                <button data-wcbtn onClick={() => toggleMaximize(win.id)}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-all hover:brightness-110 active:scale-90 p-[2.5px]"
                  style={{ background: '#28c840' }} title={win.maximized ? 'Restore' : 'Maximize'}>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity w-full h-full">
                    {win.maximized ? <IconRestore /> : <IconMaximize />}
                  </span>
                </button>
              )}
            </div>
            {/* Absolutely centered title */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-16">
              <span className="text-white/60 text-[13px] font-medium truncate">{win.title}</span>
            </div>
            <div className="flex-1" />
          </>
        )}
      </div>

      {/* ── App content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        {renderApp(win)}
      </div>

      {/* ── Resize handle (bottom-right) ─────────────────────────────── */}
      {!win.maximized && !mobile && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
          onMouseDown={onResizeMouseDown}
          style={{ background: 'transparent' }}
        />
      )}
    </motion.div>
  )
})
