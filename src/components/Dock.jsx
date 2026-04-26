import { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { useStore, SYSTEM_APPS } from "../store/useStore"
import { AppTile, CatalogTile } from "../utils/icons"

// ── Tooltip (portal-based to escape overflow clipping) ─────────────────────────────
function Tooltip({ label, anchorRef, visible }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (!visible || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top })
  }, [visible, anchorRef])
  if (!visible) return null
  return createPortal(
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y - 8,
      transform: 'translate(-50%, -100%)',
      zIndex: 99999, pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      <div className="px-2.5 py-1 rounded-lg text-white text-[12px] font-medium"
        style={{ background: 'rgba(20,20,36,0.95)', border: '1px solid rgba(255,255,255,0.14)',
                 boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
        {label}
      </div>
    </div>,
    document.body
  )
}

// ── Dock icon ─────────────────────────────────────────────────────────────────
function DockIcon({ app, mouseX, magnify = true, isRunning, onClick, onContextMenu, size }) {
  const ref = useRef(null)
  const [hover, setHover] = useState(false)
  const distancePx = useTransform(mouseX, (mx) => {
    if (!magnify || !ref.current) return Infinity
    const b = ref.current.getBoundingClientRect()
    return Math.abs(mx - (b.left + b.width / 2))
  })
  const rawScale = useTransform(distancePx, [0, 60, 120], [1.45, 1.18, 1])
  const scale = useSpring(rawScale, { stiffness: 280, damping: 24, mass: 0.8 })
  const rawY = useTransform(distancePx, [0, 80], [-12, 0])
  const y = useSpring(rawY, { stiffness: 280, damping: 24 })

  const isCatalog = app.type === "iframe" || app.hue !== undefined

  return (
    <div className="relative flex flex-col items-center flex-shrink-0" style={{ gap: 3 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Tooltip label={app.title} anchorRef={ref} visible={hover} />
      <motion.button ref={ref} style={{ scale, y }} whileTap={{ scale: 0.86 }}
        onClick={onClick} onContextMenu={onContextMenu}
        className="focus:outline-none relative">
        {isCatalog
          ? <CatalogTile app={app} size={size} />
          : <AppTile app={app} size={size} />
        }
      </motion.button>
      <div className="rounded-full flex-shrink-0"
        style={{ width: 4, height: 4, background: "var(--nova-accent,rgba(255,255,255,0.7))", opacity: isRunning ? 1 : 0, transition: "opacity 0.2s" }} />
    </div>
  )
}

// ── Dock ──────────────────────────────────────────────────────────────────────
export default function Dock() {
  const windows       = useStore(s => s.windows)
  const openWindow    = useStore(s => s.openWindow)
  const focusWindow   = useStore(s => s.focusWindow)
  const restoreWindow = useStore(s => s.restoreWindow)
  const minimizeWindow = useStore(s => s.minimizeWindow)
  const toggleLauncher = useStore(s => s.toggleLauncher)
  const closeLauncher  = useStore(s => s.closeLauncher)
  const launcherOpen   = useStore(s => s.launcherOpen)
  const dockItems     = useStore(s => s.dockItems)
  const unpinFromDock  = useStore(s => s.unpinFromDock)
  const addToDesktop   = useStore(s => s.addToDesktop)
  const desktopItems   = useStore(s => s.desktopItems)
  const showContextMenu = useStore(s => s.showContextMenu)
  const settings      = useStore(s => s.settings)
  const catalogApps   = useStore(s => s.catalogApps)
  const addRecentApp  = useStore(s => s.addRecentApp)
  const mouseX = useMotionValue(Infinity)
  const runningIds = new Set(windows.map(w => w.appId))
  const _dockSize = settings?.dockSize || 52
  // (pointer: coarse) = real touch screen; stays false on resized desktop browser windows
  const isTouchDevice = useRef(window.matchMedia('(pointer: coarse)').matches).current
  const iconSize = isTouchDevice ? Math.min(_dockSize, 36) : _dockSize
  const anyMaximized = useStore(s => s.windows.some(w => w.maximized && !w.minimized))

  // Auto-hide: when dockAutoHide setting is on OR any window is maximized,
  // show dock only when cursor is near the bottom edge (desktop) or touch is
  // near the bottom edge in landscape mode (mobile — no cursor available)
  const [dockVisible, setDockVisible] = useState(true)
  useEffect(() => {
    const needsAutoHide = settings?.dockAutoHide || anyMaximized
    if (!needsAutoHide) { setDockVisible(true); return }
    const handleMove = (e) => setDockVisible(e.clientY > window.innerHeight - 80)

    // Landscape touch: reveal dock when user swipes/taps near the bottom edge.
    // Auto-hides again after 3 s so it doesn't permanently cover content.
    let hideTimer = null
    const handleTouch = (e) => {
      if (window.innerWidth <= window.innerHeight) return   // portrait only handled by mouse fallback
      const touch = e.changedTouches[0]
      if (touch.clientY > window.innerHeight - 80) {
        setDockVisible(true)
        clearTimeout(hideTimer)
        hideTimer = setTimeout(() => setDockVisible(false), 3000)
      }
    }

    // Start hidden when first entering auto-hide mode
    setDockVisible(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('touchstart', handleTouch, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('touchstart', handleTouch)
      clearTimeout(hideTimer)
    }
  }, [settings?.dockAutoHide, anyMaximized])

  // Resolve an app id to an app definition (system or catalog)
  const resolveApp = (id, fallbackType) => {
    if (SYSTEM_APPS[id]) return SYSTEM_APPS[id]
    const fromCatalog = catalogApps.find(a => a.id === id)
    if (fromCatalog) return fromCatalog
    // Dynamic window ids like "notes-abc123", "docviewer-abc123" don't match SYSTEM_APPS keys.
    // Fall back to the base system app for the window's appType so they appear in the dock.
    if (fallbackType) {
      const byType = Object.values(SYSTEM_APPS).find(a => a.type === fallbackType)
      if (byType) return byType
    }
    return null
  }

  const handleClick = (app) => {
    if (app.id === "launcher") { toggleLauncher(); return }
    // Always close the launcher when activating any app via the taskbar
    if (launcherOpen) closeLauncher()
    const existing = windows.find(w => w.appId === app.id)
    if (existing) {
      if (existing.minimized) {
        restoreWindow(existing.id)
      } else {
        const maxZ = windows.length > 0 ? Math.max(...windows.map(w => w.zIndex)) : 0
        if (existing.zIndex < maxZ) focusWindow(existing.id)
        else minimizeWindow(existing.id)
      }
    } else {
      openWindow(app.id, app.type, app.title, app.type === "iframe" ? { app } : {})
      addRecentApp(app)
    }
  }

  const handleRightClick = (e, app) => {
    e.preventDefault(); e.stopPropagation()
    const runningWindow = windows.find(w => w.appId === app.id)
    const isSystemApp = !!SYSTEM_APPS[app.id]
    const isInstalled = desktopItems.includes(app.id)
    const canPin = isSystemApp || isInstalled
    const alreadyOnDesktop = isInstalled
    const items = [
      { label: `Open ${app.title}`, action: () => handleClick(app) },
      { type: "separator" },
    ]
    if (app.id !== "launcher" && app.id !== "trash") {
      items.push({ label: "Unpin from Dock", action: () => unpinFromDock(app.id) })
    }
    if (isSystemApp && !alreadyOnDesktop && app.id !== "launcher") {
      items.push({ label: "Add to Desktop", action: () => addToDesktop(app.id) })
    }
    if (runningWindow) {
      items.push({ type: "separator" })
      items.push({ label: "Close", action: () => useStore.getState().closeWindow(runningWindow.id) })
    }
    showContextMenu(e.clientX, e.clientY, items)
  }

  const handleDockRightClick = (e) => {
    if (e.target.closest("[data-dockicon]")) return
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      { label: "Dock Settings", action: () => openWindow("settings", "settings", "Settings", { initialTab: "dock" }) },
      { type: "separator" },
      { label: "Icon Size: Small", action: () => useStore.getState().updateSettings({ dockSize: 40 }) },
      { label: "Icon Size: Medium", action: () => useStore.getState().updateSettings({ dockSize: 52 }) },
      { label: "Icon Size: Large", action: () => useStore.getState().updateSettings({ dockSize: 64 }) },
      { type: "separator" },
      { label: settings?.dockMagnification ? "Disable Magnification" : "Enable Magnification",
        action: () => useStore.getState().updateSettings({ dockMagnification: !settings?.dockMagnification }) },
    ])
  }

  const pinnedApps = dockItems.map(resolveApp).filter(Boolean)
  const trashApp = SYSTEM_APPS.trash

  // Running apps that are NOT pinned to dock — one entry per window (not deduped)
  const pinnedSet = new Set(dockItems)
  // Build a set of running appTypes so pinned icons show the "running" dot even when
  // instances were opened with dynamic appIds (e.g. "docviewer-abc123" for appType "doc-viewer")
  const runningTypes = new Set(windows.map(w => w.appType))
  const unpinnedRunning = windows
    .filter(w => !pinnedSet.has(w.appId) && w.appId !== "trash")
    .map(w => ({ win: w, app: resolveApp(w.appId, w.appType) }))
    .filter(x => x.app !== null)

  return (
    <motion.div className="fixed bottom-0 left-0 right-0 flex justify-center items-end z-[900] pb-2 pointer-events-none" data-launcher
      animate={{ y: (settings?.dockAutoHide || anyMaximized) && !dockVisible ? 120 : 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}>
      <motion.div
        className={`flex items-end px-3 py-2 rounded-2xl pointer-events-auto${isTouchDevice ? ' no-scrollbar' : ''}`}
        style={{
          gap: Math.max(5, iconSize * 0.13),
          flexShrink: 0,
          background: "rgba(255,255,255,0.14)",
          backdropFilter: settings?.transparency === false ? "none" : "blur(32px) saturate(160%)",
          WebkitBackdropFilter: settings?.transparency === false ? "none" : "blur(32px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
          maxWidth: "calc(100vw - 16px)",
          overflowX: isTouchDevice ? 'auto' : 'visible',
          overflowY: isTouchDevice ? 'hidden' : 'visible',
          WebkitOverflowScrolling: 'touch',
        }}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        onContextMenu={handleDockRightClick}
      >
        {pinnedApps.map((app) => (
          <div key={app.id} data-dockicon className="flex-shrink-0">
            <DockIcon app={app} mouseX={mouseX}
              magnify={!isTouchDevice && settings?.dockMagnification !== false}
              isRunning={runningIds.has(app.id) || runningTypes.has(app.type)} size={iconSize}
              onClick={() => handleClick(app)} onContextMenu={(e) => handleRightClick(e, app)} />
          </div>
        ))}

        {/* Running unpinned apps */}
        {unpinnedRunning.length > 0 && (
          <>
            <div className="w-px mx-1 self-stretch flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)", marginBottom: 4 }} />
            {unpinnedRunning.map(({ win, app }) => (
              <div key={win.id} data-dockicon className="flex-shrink-0">
                <DockIcon
                  app={{ ...app, title: win.title || app.title }} mouseX={mouseX}
                  magnify={!isTouchDevice && settings?.dockMagnification !== false}
                  isRunning={true} size={iconSize}
                  onClick={() => win.minimized ? restoreWindow(win.id) : minimizeWindow(win.id)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const isSystemApp = !!SYSTEM_APPS[app.id]
                    const isInstalled = desktopItems.includes(app.id)
                    const canPin = isSystemApp || isInstalled
                    const items = [
                      { label: win.minimized ? "Restore" : `Focus ${app.title}`, action: () => win.minimized ? restoreWindow(win.id) : focusWindow(win.id) },
                      { type: "separator" },
                      ...(canPin ? [{ label: "Pin to Dock", action: () => useStore.getState().pinToDock(app.id) }] : []),
                      { label: "Close", action: () => useStore.getState().closeWindow(win.id) },
                    ]
                    showContextMenu(e.clientX, e.clientY, items)
                  }}
                />
              </div>
            ))}
          </>
        )}

        {/* Separator before Trash */}
        <div className="w-px mx-1 self-stretch flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)", marginBottom: 4 }} />

        <div data-dockicon className="flex-shrink-0">
          <DockIcon app={trashApp} mouseX={mouseX}
            magnify={!isTouchDevice && settings?.dockMagnification !== false}
            isRunning={runningIds.has("trash")} size={iconSize}
            onClick={() => handleClick(trashApp)} onContextMenu={(e) => handleRightClick(e, trashApp)} />
        </div>
      </motion.div>
    </motion.div>
  )
}
