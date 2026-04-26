import { useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import { useAuthStore } from './store/useAuthStore'
import { generateWelcomeHtml } from './utils/welcomeContent'
import Desktop from './components/Desktop'
import WindowManager from './components/WindowManager'
import Dock from './components/Dock'
import StartMenu from './components/StartMenu'
import ContextMenu from './components/ContextMenu'
import Clock from './components/Clock'
import QuickBar from './components/QuickBar'
import Widgets from './components/Widgets'
import LoginScreen from './components/LoginScreen'
import { WALLPAPERS, ACCENTS } from './config.js'
import { BRANDING } from './config.js'

function NotificationToast() {
  const notification    = useStore(s => s.notification)
  const clearNotification = useStore(s => s.clearNotification)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!notification) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(clearNotification, 5000)
    return () => clearTimeout(timerRef.current)
  }, [notification?.id])

  if (!notification) return null
  return (
    <div
      onClick={clearNotification}
      style={{
        position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, cursor: 'pointer',
        background: notification.type === 'success' ? 'rgba(37,99,235,0.92)' : notification.type === 'info' ? 'rgba(15,118,110,0.92)' : 'rgba(220,38,38,0.92)',
        backdropFilter: 'blur(12px)',
        border: notification.type === 'success' ? '1px solid rgba(100,160,255,0.4)' : notification.type === 'info' ? '1px solid rgba(94,234,212,0.4)' : '1px solid rgba(255,100,100,0.4)',
        color: '#fff', borderRadius: 14, padding: '10px 18px',
        fontSize: 13, fontWeight: 500, maxWidth: 420, textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        animation: 'fadeInUp 0.2s ease',
      }}
    >
      {notification.type === 'success' ? '✓' : notification.type === 'info' ? 'ℹ️' : '⚠️'} {notification.message}
    </div>
  )
}

// Auth gate — must NOT call other hooks here to avoid Rules-of-hooks violation
export default function App() {
  const currentUserId  = useAuthStore(s => s.currentUserId)
  const sessionLoading = useAuthStore(s => s.sessionLoading)
  // Wait for initSession() to attempt restoring the session via refresh cookie
  // before deciding whether to show the login screen.
  if (sessionLoading) return null
  if (!currentUserId) return <LoginScreen />
  return <DesktopApp />
}

// All hooks live here so they always run in a consistent order
function DesktopApp() {
  const reinitForUser   = useStore(s => s.reinitForUser)
  const loadCatalog = useStore(s => s.loadCatalog)
  const hideContextMenu = useStore(s => s.hideContextMenu)
  const closeLauncher = useStore(s => s.closeLauncher)
  const settings = useStore(s => s.settings) || {}

  // For authenticated users, useAuthStore already awaited reinitForUser() before
  // setting sessionLoading:false — calling it again would do a redundant pass-consuming
  // dbInit() and reset windows/clipboard. Guest page-reloads are the only case that
  // needs it here (initSession() returns early for guests without calling reinitForUser).
  useEffect(() => {
    let cancelled = false
    const { currentUserId } = useAuthStore.getState()
    const isGuest = currentUserId?.startsWith('guest-')
    const init = isGuest ? reinitForUser() : Promise.resolve()
    init.then(() => {
      if (cancelled) return
      const { justRegistered, currentUsername, clearJustRegistered } = useAuthStore.getState()
      if (!justRegistered) return
      clearJustRegistered()
      const { createNode, openWindow } = useStore.getState()
      createNode('root', 'file', `Welcome to ${BRANDING.name}.html`, generateWelcomeHtml(currentUsername || 'there'))
      setTimeout(() => {
        openWindow('welcome', 'welcome', `${BRANDING.logoEmoji} Welcome to ${BRANDING.name}`, { username: currentUsername })
      }, 900)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  // Apply accent color as CSS variable whenever settings change
  useEffect(() => {
    const accent = ACCENTS.find(a => a.id === settings.accentColor)
    if (accent) {
      document.documentElement.style.setProperty('--nova-accent', accent.hex)
      const r = parseInt(accent.hex.slice(1, 3), 16)
      const g = parseInt(accent.hex.slice(3, 5), 16)
      const b = parseInt(accent.hex.slice(5, 7), 16)
      document.documentElement.style.setProperty('--nova-accent-rgb', `${r},${g},${b}`)
    }
  }, [settings.accentColor])

  const handleGlobalClick = (e) => {
    if (!e.target.closest('[data-contextmenu]')) hideContextMenu()
    if (!e.target.closest('[data-launcher]')) closeLauncher()
  }

  const wallpaper = WALLPAPERS[settings.wallpaperPreset] || null
  const customWallpaper = settings.customWallpaper || null

  return (
    <div
      className="w-screen h-screen overflow-hidden select-none relative"
      onClick={handleGlobalClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Wallpaper */}
      <div className="wallpaper" style={customWallpaper
        ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : wallpaper ? { background: wallpaper } : {}} />

      {/* Clock top-right (respects showClock setting) */}
      {settings.showClock !== false && <Clock />}

      {/* Widgets on desktop */}
      <Widgets />

      {/* Desktop icons */}
      <Desktop />

      {/* All app windows */}
      <WindowManager />

      {/* Start / Launcher menu */}
      <StartMenu />

      {/* Right-click context menu */}
      <ContextMenu />

      {/* Dock */}
      <Dock />

      {/* QuickBar pull sidebar */}
      <QuickBar />

      {/* Global notification toast (quota errors, etc.) */}
      <NotificationToast />
    </div>
  )
}
