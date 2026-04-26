import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { Monitor, Sliders, Info, Check, Palette, Layers, AppWindow, LogOut, ShieldCheck, HardDrive, Globe, Clock, Lock, Unlock, X, User, Shield } from "lucide-react"
import { useStore } from "../store/useStore"
import { useAuthStore } from "../store/useAuthStore"
import { WALLPAPERS, WALLPAPER_LABELS, ACCENTS } from "../config.js"
import { BRANDING } from "../config.js"
import { fsQuota, adminSetQuota, adminSetAiQuota, adminGetUserDetail, adminChangePassword, selfChangePassword, aiQuota, twoFaStatus, twoFaSendOtp, twoFaEnable, twoFaDisable } from "../utils/db"

function formatBytes(b) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1024)          return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Styled confirmation modal — replaces window.confirm() throughout the admin panel
function ConfirmModal({ title, message, confirmLabel = 'Confirm', variant = 'danger', onConfirm, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}>
      <div className="w-full max-w-xs rounded-2xl overflow-hidden"
        style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-2">
          <div className="text-base font-semibold text-white mb-1">{title}</div>
          <div className="text-sm text-white/50 leading-relaxed">{message}</div>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm text-white/60 hover:text-white/90 transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{
              background: variant === 'danger'  ? 'rgba(239,68,68,0.25)'    :
                          variant === 'warning' ? 'rgba(251,191,36,0.2)'   :
                                                  'rgba(130,80,255,0.35)',
              border:     variant === 'danger'  ? '1px solid rgba(239,68,68,0.4)'   :
                          variant === 'warning' ? '1px solid rgba(251,191,36,0.35)' :
                                                  '1px solid rgba(130,80,255,0.4)',
              color:      variant === 'danger'  ? '#fca5a5' :
                          variant === 'warning' ? 'rgba(251,191,36,0.95)' : '#c4b5fd',
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// CSS gradient for each preset - index 0 = default (aurora-like)
const WP_STYLES = [
  "radial-gradient(ellipse at 75% 10%, rgba(255,145,40,0.9) 0%, transparent 55%), radial-gradient(ellipse at 20% 35%, rgba(175,60,250,0.95) 0%, transparent 58%), linear-gradient(135deg, #3a0ca3 0%, #7b2ff7 38%, #4cc9f0 100%)",
  ...WALLPAPERS.slice(1),
]

function Tab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "text-white" : "text-white/50 hover:text-white/80"}`}
      style={active ? { background: "rgba(var(--nova-accent-rgb,130,80,255),0.12)" } : {}}
    >
      {icon}
      {label}
    </button>
  )
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {sub && <div className="text-xs text-white/40 mt-0.5">{sub}</div>}
      </div>
      <div
        role="switch"
        aria-checked={on}
        tabIndex={0}
        onClick={() => onChange(!on)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onChange(!on)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          flexShrink: 0,
          position: 'relative',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          background: on ? 'var(--nova-accent, #7c3aed)' : 'rgba(255,255,255,0.15)',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          transition: 'left 0.18s ease',
        }} />
      </div>
    </div>
  )
}

export default function Settings({ context }) {
  const settings = useStore(s => s.settings) || {}
  const updateSettings = useStore(s => s.updateSettings)
  const { users, currentUserId, currentUsername, currentUserIsAdmin, adminConfig, updateAdminConfig, fetchAdminConfig, logout, deleteUser, fetchUsers, freezeUser, revokeUserTokens, selfDeleteAccount } = useAuthStore()
  const currentUser = currentUserId?.startsWith("guest-")
    ? { id: currentUserId, username: "Guest", isGuest: true, isAdmin: false }
    : currentUserId ? (users.find(u => u.id === currentUserId) || { id: currentUserId, username: currentUsername || currentUserId, isGuest: false }) : null
  const isAdmin = currentUserIsAdmin === true
  const [tab, setTab] = useState(context?.initialTab || "appearance")
  const [quota, setQuota]       = useState(null)
  const [aiQuotaData, setAiQuotaData] = useState(null)
  const [tzQuery, setTzQuery]   = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [userDetail, setUserDetail]         = useState(null)
  const [detailLoading, setDetailLoading]   = useState(false)
  const [confirmAction, setConfirmAction]   = useState(null)
  const [editQuota, setEditQuota]           = useState({})
  const [editAiQuota, setEditAiQuota]       = useState({})
  const [newPassword, setNewPassword]       = useState('')
  const [pwError, setPwError]               = useState('')
  const [pwSaving, setPwSaving]             = useState(false)
  // Account tab — self password change
  const [acctCurPw, setAcctCurPw]           = useState('')
  const [acctNewPw, setAcctNewPw]           = useState('')
  const [acctConfPw, setAcctConfPw]         = useState('')
  const [acctPwError, setAcctPwError]       = useState('')
  const [acctPwOk, setAcctPwOk]             = useState(false)
  const [acctPwSaving, setAcctPwSaving]     = useState(false)
  const [deleteAcctOpen, setDeleteAcctOpen] = useState(false)
  const [deleteAcctPw, setDeleteAcctPw]     = useState('')
  const [deleteAcctError, setDeleteAcctError] = useState('')
  const [deleteAcctSaving, setDeleteAcctSaving] = useState(false)

  // Account tab — 2FA
  const [twoFaData, setTwoFaData]           = useState(null)   // { enabled, hasEmail, smtpConfigured }
  const [twoFaStep, setTwoFaStep]           = useState(null)   // null | 'enable' | 'disable'
  const [twoFaOtp, setTwoFaOtp]            = useState('')
  const [twoFaError, setTwoFaError]         = useState('')
  const [twoFaSaving, setTwoFaSaving]       = useState(false)
  const [twoFaSent, setTwoFaSent]           = useState(false)

  // All IANA timezones available in this browser
  const allTimezones = useMemo(() => {
    if (typeof Intl.supportedValuesOf === 'function') {
      try { return Intl.supportedValuesOf('timeZone') } catch {}
    }
    // Fallback: common zones
    return [
      'UTC',
      'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'America/Anchorage','America/Adak','Pacific/Honolulu',
      'America/Toronto','America/Vancouver','America/Sao_Paulo','America/Argentina/Buenos_Aires',
      'Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome',
      'Europe/Athens','Europe/Istanbul','Europe/Moscow',
      'Asia/Dubai','Asia/Karachi','Asia/Kolkata','Asia/Dhaka',
      'Asia/Bangkok','Asia/Singapore','Asia/Shanghai','Asia/Tokyo','Asia/Seoul',
      'Australia/Sydney','Australia/Melbourne','Pacific/Auckland',
      'Africa/Cairo','Africa/Johannesburg','Africa/Lagos',
    ]
  }, [])

  const filteredTz = useMemo(() => {
    const q = tzQuery.toLowerCase()
    return q ? allTimezones.filter(tz => tz.toLowerCase().includes(q)) : allTimezones
  }, [allTimezones, tzQuery])

  const currentTz = settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  // Fetch user list + config from server whenever the admin tab is shown
  useEffect(() => {
    if (tab === "admin" && isAdmin) { fetchUsers(); fetchAdminConfig() }
  }, [tab, isAdmin, fetchUsers, fetchAdminConfig])

  useEffect(() => {
    if (!selectedUserId) { setUserDetail(null); setNewPassword(''); setPwError(''); return }
    setDetailLoading(true)
    setUserDetail(null)
    adminGetUserDetail(selectedUserId)
      .then(d => { setUserDetail(d); setDetailLoading(false) })
      .catch(() => setDetailLoading(false))
  }, [selectedUserId])

  // Load current user's quotas when the quotas tab is shown
  useEffect(() => {
    if (tab === "quotas" && !currentUser?.isGuest) {
      fsQuota().then(setQuota).catch(() => {})
      aiQuota().then(setAiQuotaData).catch(() => {})
    }
    // Refresh user list so Account tab shows up-to-date profile fields
    if (tab === "account" && !currentUser?.isGuest) {
      fetchUsers().catch(() => {})
      twoFaStatus().then(setTwoFaData).catch(() => {})
    }
  }, [tab, currentUser?.id])

  const TABS = [
    { id: "appearance", icon: <Palette size={15} />,    label: "Appearance" },
    { id: "dock",       icon: <Layers size={15} />,     label: "Dock" },
    { id: "windows",    icon: <AppWindow size={15} />,  label: "Windows" },
    { id: "datetime",   icon: <Clock size={15} />,      label: "Date & Time" },
    ...(!currentUser?.isGuest ? [{ id: "quotas", icon: <HardDrive size={15} />, label: "Quotas" }] : []),
    ...(!currentUser?.isGuest ? [{ id: "account", icon: <User size={15} />,      label: "Account" }] : []),
    ...(isAdmin ? [{ id: "admin", icon: <ShieldCheck size={15} />, label: "Admin" }] : []),
    { id: "about",      icon: <Info size={15} />,       label: "About" },
  ]

  return (
    <div className="flex flex-col h-full text-white overflow-hidden"
      style={{ background: "rgba(14,14,24,0.95)", fontFamily: "system-ui,sans-serif" }}>

      {/* Mobile: horizontal tab pills */}
      <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto px-3 py-2 flex-shrink-0 scrollbar-none"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,20,0.7)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap flex-shrink-0 transition-all"
            style={{ background: tab === t.id ? 'rgba(130,80,255,0.35)' : 'rgba(255,255,255,0.07)', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.55)', border: tab === t.id ? '1px solid rgba(130,80,255,0.5)' : '1px solid transparent' }}>
            {t.icon}{t.label}
          </button>
        ))}
        {currentUser && (
          <button onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap flex-shrink-0 text-white/50 transition-all ml-auto"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid transparent' }}>
            <LogOut size={12} /> Sign out
          </button>
        )}
      </div>

      {/* Desktop: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - hidden on mobile */}
        <div className="hidden sm:flex w-48 flex-shrink-0 py-4 px-3 flex-col gap-1 border-r border-white/10">
          <div className="text-white/30 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Settings</div>
          {TABS.map(t => (
            <Tab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={t.icon} label={t.label} />
          ))}
          {/* Spacer + Logout */}
          <div className="flex-1" />
          {currentUser && (
            <div className="px-3 py-2 border-t border-white/10">
              <div className="text-xs text-white/40 mb-2 truncate">{currentUser.username}</div>
              <button onClick={logout}
                className="flex items-center gap-2 text-white/50 hover:text-white/80 text-[12px] transition-colors">
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
        {tab === "appearance" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Appearance</h2>

            <div className="mb-5">
              <div className="text-sm font-medium text-white/70 mb-3">Wallpaper</div>
              <div className="grid grid-cols-3 gap-2">
                {WP_STYLES.map((style, idx) => (
                  <button key={idx} onClick={() => updateSettings({ wallpaperPreset: idx, customWallpaper: null })}
                    className="relative rounded-xl overflow-hidden aspect-video border-2 transition-all"
                    style={{ background: style, borderColor: settings.wallpaperPreset === idx ? "#8250ff" : "transparent" }}>
                    {settings.wallpaperPreset === idx && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check size={18} className="text-white drop-shadow" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 p-1 text-center text-white text-[10px] font-medium"
                      style={{ background: "rgba(0,0,0,0.5)" }}>{WALLPAPER_LABELS[idx]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-sm font-medium text-white/70 mb-3">Accent Color</div>
              <div className="flex gap-2 flex-wrap">
                {ACCENTS.map(a => (
                  <button key={a.id} onClick={() => updateSettings({ accentColor: a.id })}
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all"
                    style={{ background: a.hex, borderColor: settings.accentColor === a.id ? "white" : "transparent",
                             boxShadow: settings.accentColor === a.id ? `0 0 0 3px ${a.hex}55` : "none" }}>
                    {settings.accentColor === a.id && <Check size={12} className="text-white" />}
                  </button>
                ))}
              </div>
              <div className="text-xs text-white/40 mt-2">
                Current: <span className="text-white/70 capitalize">{settings.accentColor || "violet"}</span>
                {" "}— changes selection highlights, active states, and accent elements throughout the OS.
              </div>
            </div>

          </div>
        )}

        {tab === "dock" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Dock</h2>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="py-2">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-white">Icon Size</span>
                  <span className="text-sm text-white/50">{settings.dockSize || 52}px</span>
                </div>
                <input type="range" min={36} max={80} value={settings.dockSize || 52}
                  onChange={e => updateSettings({ dockSize: Number(e.target.value) })}
                  className="w-full accent-violet-500" />
              </div>
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={settings.dockMagnification !== false} onChange={v => updateSettings({ dockMagnification: v })}
                label="Magnification" sub="Icons grow on hover" />
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={!!settings.dockAutoHide} onChange={v => updateSettings({ dockAutoHide: v })}
                label="Auto-hide" sub="Dock hides when not in use" />
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={settings.showClock !== false} onChange={v => updateSettings({ showClock: v })}
                label="Show Clock" sub="Display time in dock" />
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={settings.transparency !== false} onChange={v => updateSettings({ transparency: v })}
                label="Translucency" sub="Frosted glass effect on panels" />
            </div>
          </div>
        )}

        {tab === "windows" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Windows</h2>
            <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.05)" }}>
              <Toggle on={!!settings.titlebarButtonsRight} onChange={v => updateSettings({ titlebarButtonsRight: v })}
                label="Title bar buttons on right"
                sub="Windows-style: Minimize → Maximize → Close on the right" />
            </div>
          </div>
        )}

        {tab === "admin" && isAdmin && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>
            <div className="rounded-xl p-4 flex flex-col gap-1 mb-4" style={{ background: "rgba(255,255,255,0.05)" }}>
              <Toggle on={!!adminConfig.allowSignup} onChange={v => updateAdminConfig({ allowSignup: v })}
                label="Allow new sign-ups" sub="Users can register new accounts" />
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={!!adminConfig.allowGuest} onChange={v => updateAdminConfig({ allowGuest: v })}
                label="Allow guest access" sub="Visitors can use the OS without an account" />
              <div className="border-t border-white/10 mt-1 mb-1" />
              <Toggle on={!!adminConfig.aiDebug} onChange={v => updateAdminConfig({ aiDebug: v })}
                label="AI debug mode" sub="Skip real AI calls and return mock debug responses" />
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-white/70">Registered Users</div>
              <div className="text-xs text-white/30">{users.length} account{users.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="flex flex-col gap-2">
              {users.map(u => {
                const quotaGB = ((u.quotaBytes ?? 1073741824) / 1024 / 1024 / 1024).toFixed(0)
                const draft   = editQuota[u.id] ?? quotaGB
                const isSelf  = u.id === currentUserId
                return (
                  <div key={u.id} className="rounded-xl px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.05)", border: u.isFrozen ? '1px solid rgba(251,191,36,0.2)' : '1px solid transparent' }}>

                    {/* Row header — clicking anywhere on the name/avatar opens the detail modal */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedUserId(u.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(130,80,255,0.2)' }}>
                          <User size={13} className="text-purple-300" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-sm text-white font-medium truncate">{u.username}</span>
                          {u.isAdmin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(130,80,255,0.3)', color: 'rgba(180,140,255,1)' }}>Admin</span>
                          )}
                          {u.isFrozen && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(251,191,36,0.2)', color: 'rgba(251,191,36,0.9)' }}>Frozen</span>
                          )}
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 text-white/40"
                              style={{ background: 'rgba(255,255,255,0.08)' }}>You</span>
                          )}
                        </div>
                      </button>
                      <span className="text-[10px] text-white/30 flex-shrink-0">
                        {fmtDate(u.lastLoginAt ?? null) ?? 'Never logged in'}
                      </span>
                    </div>
                  </div>
                )
              })}
              {users.length === 0 && <div className="text-white/30 text-sm text-center py-4">No registered users</div>}
            </div>
          </div>
        )}

        {tab === "quotas" && !currentUser?.isGuest && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Quotas</h2>

            {/* ── Storage ── */}
            <div className="text-[11px] uppercase tracking-widest text-white/30 font-semibold mb-2">File Storage</div>
            {quota ? (() => {
              const pct = Math.min(100, (quota.used / quota.quota) * 100)
              const usedMB  = (quota.used  / 1024 / 1024).toFixed(1)
              const totalGB = (quota.quota / 1024 / 1024 / 1024).toFixed(1)
              const color   = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--nova-accent,#7c3aed)'
              return (
                <div className="rounded-xl p-5 mb-5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-white/70">Used storage</span>
                    <span className="text-sm font-semibold">{usedMB} MB <span className="text-white/40 font-normal">/ {totalGB} GB</span></span>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-xs text-white/30 mt-2">{pct.toFixed(1)}% of quota used</div>
                </div>
              )
            })() : (
              <div className="rounded-xl p-5 mb-5 text-white/30 text-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>Loading…</div>
            )}

            {/* ── AI Usage ── */}
            <div className="text-[11px] uppercase tracking-widest text-white/30 font-semibold mb-2">AI Usage</div>
            {aiQuotaData ? (() => {
              const pct   = Math.min(100, aiQuotaData.quota > 0 ? (aiQuotaData.used / aiQuotaData.quota) * 100 : 0)
              const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--nova-accent,#7c3aed)'
              const fmtK  = n => n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : String(n)
              return (
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-white/70">Tokens used</span>
                    <span className="text-sm font-semibold">{fmtK(aiQuotaData.used)} <span className="text-white/40 font-normal">/ {fmtK(aiQuotaData.quota)} tokens</span></span>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-xs text-white/30 mt-2">{pct.toFixed(1)}% of AI quota used · {fmtK(aiQuotaData.free)} tokens remaining</div>                  {aiQuotaData.renewsAt && (
                    <div className="text-xs text-white/25 mt-1">
                      Renews on {new Date(aiQuotaData.renewsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}                </div>
              )
            })() : (
              <div className="rounded-xl p-5 text-white/30 text-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>Loading…</div>
            )}
          </div>
        )}

        {tab === "datetime" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Date &amp; Time</h2>
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-sm font-medium text-white/70 mb-1">Timezone</div>
              <div className="text-xs text-white/40 mb-3">
                Current: <span className="text-white/70">{currentTz}</span>
                {" "}— affects Calendar, Clock, and other time-sensitive apps.
              </div>
              <input
                className="w-full px-3 py-2 rounded-xl text-white text-sm outline-none mb-2"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                placeholder="Search timezone…"
                value={tzQuery}
                onChange={e => setTzQuery(e.target.value)}
              />
              <div className="rounded-xl overflow-hidden" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                {filteredTz.map(tz => (
                  <button key={tz} onClick={() => updateSettings({ timezone: tz })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      background: tz === currentTz ? 'rgba(130,80,255,0.25)' : 'transparent',
                      color: tz === currentTz ? '#c4b5fd' : 'rgba(255,255,255,0.7)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                    <Globe size={12} className="flex-shrink-0 opacity-50" />
                    <span className="flex-1 truncate">{tz}</span>
                    {tz === currentTz && <Check size={12} className="flex-shrink-0" />}
                  </button>
                ))}
                {filteredTz.length === 0 && (
                  <div className="text-white/30 text-sm text-center py-4">No timezones found</div>
                )}
              </div>
              <button onClick={() => { updateSettings({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setTzQuery('') }}
                className="mt-3 text-xs text-white/40 hover:text-white/70 transition-colors">
                Reset to system timezone
              </button>
            </div>
          </div>
        )}

        {tab === "account" && !currentUser?.isGuest && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Account</h2>

            {/* Profile info — read-only */}
            <div className="rounded-xl overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(130,80,255,0.2)', border: '1px solid rgba(130,80,255,0.3)' }}>
                  <User size={18} className="text-purple-300" />
                </div>
                <div>
                  {(() => {
                    const full = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
                    return full
                      ? <><div className="text-sm font-semibold text-white">{full}</div><div className="text-xs text-white/45 mt-0.5">@{currentUser?.username}</div></>
                      : <div className="text-sm font-semibold text-white">{currentUser?.username}</div>
                  })()}
                  {isAdmin && <div className="text-xs text-purple-300/70 mt-0.5">Administrator</div>}
                </div>
              </div>
              {[
                ...(currentUser?.firstName || currentUser?.lastName
                  ? [{ label: 'Full name', value: [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') }]
                  : []),
                ...(currentUser?.email ? [{ label: 'Email', value: currentUser.email }] : []),
                { label: 'Username', value: currentUser?.username },
                { label: 'User ID',  value: currentUser?.id, mono: true },
              ].map(({ label, value, mono }, i, arr) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5"
                  style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.06)' } : {}}>
                  <span className="text-xs text-white/40 flex-shrink-0">{label}</span>
                  <span className={`text-xs text-white/70 text-right ml-4 truncate max-w-[200px] ${mono ? 'font-mono text-[10px] text-white/40' : ''}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* Change password */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-sm font-medium text-white mb-3">Change Password</div>
                <div className="flex flex-col gap-2.5">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={acctCurPw}
                    onChange={e => { setAcctCurPw(e.target.value); setAcctPwError(''); setAcctPwOk(false) }}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={acctNewPw}
                    onChange={e => { setAcctNewPw(e.target.value); setAcctPwError(''); setAcctPwOk(false) }}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={acctConfPw}
                    onChange={e => { setAcctConfPw(e.target.value); setAcctPwError(''); setAcctPwOk(false) }}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${acctPwError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}` }}
                  />
                  {acctPwError && <div className="text-xs text-red-400">{acctPwError}</div>}
                  {acctPwOk    && <div className="text-xs" style={{ color: 'rgba(74,222,128,0.9)' }}>Password changed successfully.</div>}
                  <button
                    disabled={acctPwSaving || !acctCurPw || acctNewPw.length < 4 || !acctConfPw}
                    onClick={async () => {
                      setAcctPwError(''); setAcctPwOk(false)
                      if (acctNewPw !== acctConfPw) { setAcctPwError('New passwords do not match.'); return }
                      if (acctNewPw.length < 4) { setAcctPwError('New password must be at least 4 characters.'); return }
                      setAcctPwSaving(true)
                      const result = await selfChangePassword(acctCurPw, acctNewPw)
                      setAcctPwSaving(false)
                      if (result?.error) { setAcctPwError(result.error) }
                      else { setAcctCurPw(''); setAcctNewPw(''); setAcctConfPw(''); setAcctPwOk(true) }
                    }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(130,80,255,0.35)', border: '1px solid rgba(130,80,255,0.4)', color: '#c4b5fd' }}>
                    {acctPwSaving ? 'Saving…' : 'Update Password'}
                  </button>
                </div>
            </div>

            {/* Two-Factor Authentication */}
            {twoFaData && twoFaData.smtpConfigured && twoFaData.hasEmail && (
              <div className="rounded-xl overflow-hidden mt-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-purple-300/70" />
                    <span className="text-sm font-medium text-white">Two-Factor Authentication</span>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${twoFaData.enabled ? 'text-green-300 bg-green-500/15 border border-green-500/25' : 'text-white/40 bg-white/5 border border-white/10'}`}>
                    {twoFaData.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {!twoFaStep && (
                  <div className="px-4 py-4 flex items-center justify-between gap-4">
                    <div className="text-xs text-white/40 leading-relaxed">
                      {twoFaData.enabled
                        ? 'A code will be emailed to you each time you sign in.'
                        : 'Require an email code in addition to your password when signing in.'}
                    </div>
                    <button
                      onClick={async () => {
                        setTwoFaError(''); setTwoFaOtp(''); setTwoFaSaving(true); setTwoFaSent(false)
                        const purpose = twoFaData.enabled ? 'disable_2fa' : 'enable_2fa'
                        const r = await twoFaSendOtp(purpose)
                        setTwoFaSaving(false)
                        if (r.error) { setTwoFaError(r.error); return }
                        setTwoFaStep(twoFaData.enabled ? 'disable' : 'enable')
                        setTwoFaSent(true)
                      }}
                      disabled={twoFaSaving}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                      style={{ background: twoFaData.enabled ? 'rgba(239,68,68,0.12)' : 'rgba(139,92,246,0.2)', border: twoFaData.enabled ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(139,92,246,0.4)', color: twoFaData.enabled ? '#fca5a5' : '#c4b5fd' }}>
                      {twoFaSaving ? 'Sending…' : twoFaData.enabled ? 'Disable 2FA' : 'Enable 2FA'}
                    </button>
                  </div>
                )}

                {twoFaStep && (
                  <div className="px-4 py-4 flex flex-col gap-3">
                    {twoFaSent && (
                      <div className="text-xs rounded-xl px-3 py-2.5 leading-relaxed" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'rgba(196,181,253,0.8)' }}>
                        A verification code was sent to your email. Enter it below to {twoFaStep === 'enable' ? 'enable' : 'disable'} 2FA.
                      </div>
                    )}
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                      placeholder="6-digit code"
                      value={twoFaOtp}
                      onChange={e => { setTwoFaOtp(e.target.value.replace(/\D/g, '')); setTwoFaError('') }}
                      className="w-full px-3 py-2 rounded-xl text-sm text-center text-white tracking-[0.3em] outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${twoFaError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`, fontSize: 18 }}
                      autoFocus
                    />
                    {twoFaError && <div className="text-xs text-red-400">{twoFaError}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (twoFaOtp.length !== 6) { setTwoFaError('Enter the 6-digit code.'); return }
                          setTwoFaSaving(true); setTwoFaError('')
                          const r = twoFaStep === 'enable' ? await twoFaEnable(twoFaOtp) : await twoFaDisable(twoFaOtp)
                          setTwoFaSaving(false)
                          if (r.error) { setTwoFaError(r.error); return }
                          const newEnabled = twoFaStep === 'enable'
                          setTwoFaData(d => ({ ...d, enabled: newEnabled }))
                          setTwoFaStep(null); setTwoFaOtp(''); setTwoFaSent(false)
                        }}
                        disabled={twoFaSaving || twoFaOtp.length !== 6}
                        className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                        style={{ background: 'rgba(130,80,255,0.35)', border: '1px solid rgba(130,80,255,0.4)', color: '#c4b5fd' }}>
                        {twoFaSaving ? 'Verifying…' : twoFaStep === 'enable' ? 'Verify & Enable' : 'Verify & Disable'}
                      </button>
                      <button
                        onClick={() => { setTwoFaStep(null); setTwoFaOtp(''); setTwoFaError(''); setTwoFaSent(false) }}
                        className="px-3 py-2 rounded-xl text-sm text-white/40 hover:text-white/70 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {twoFaError && !twoFaStep && (
                  <div className="px-4 pb-3 text-xs text-red-400">{twoFaError}</div>
                )}
              </div>
            )}

            {/* Danger Zone */}
            <div className="rounded-xl overflow-hidden mt-4" style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
                <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(252,165,165,0.7)' }}>Danger Zone</div>
              </div>
              <div className="px-4 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-white/80">Delete Account</div>
                  <div className="text-xs text-white/40 mt-0.5">Permanently delete your account and all associated data. This cannot be undone.</div>
                </div>
                <button
                  onClick={() => { setDeleteAcctOpen(true); setDeleteAcctPw(''); setDeleteAcctError('') }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "about" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">About</h2>
            <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(130,80,255,0.12)", border: "1px solid rgba(130,80,255,0.3)" }}>
              <div className="text-5xl mb-3">{BRANDING.logoEmoji}</div>
              <div className="text-2xl font-bold mb-1">{BRANDING.name}</div>
              <div className="text-white/50 text-sm mb-4">Version {BRANDING.version} · Web-based OS</div>
              <div className="text-xs text-white/30">Built with React · Vite · Framer Motion · Zustand</div>
              <div className="text-xs text-white/30">Built with ❤️ by X-FRST</div>
              <div className="text-xs text-white/30">Support: <a href={`mailto:${BRANDING.supportUrl}`} className="underline">{BRANDING.supportUrl}</a></div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          variant={confirmAction.variant}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Delete Account Modal */}
      {deleteAcctOpen && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 100001, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setDeleteAcctOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl overflow-hidden"
            style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2">
              <div className="text-base font-semibold text-white mb-1">Delete Your Account?</div>
              <div className="text-sm text-white/50 leading-relaxed mb-4">
                This is <span className="text-red-400 font-medium">irreversible</span>. Your account, all files, folders, and data will be permanently deleted from the server.
              </div>
              <div className="text-xs text-white/40 mb-1.5">Enter your password to confirm:</div>
              <input
                type="password"
                autoFocus
                placeholder="Your password"
                value={deleteAcctPw}
                onChange={e => { setDeleteAcctPw(e.target.value); setDeleteAcctError('') }}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && deleteAcctPw) {
                    setDeleteAcctSaving(true)
                    const r = await selfDeleteAccount(deleteAcctPw)
                    setDeleteAcctSaving(false)
                    if (!r.success) setDeleteAcctError(r.error)
                  }
                  if (e.key === 'Escape') setDeleteAcctOpen(false)
                }}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${deleteAcctError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}` }}
              />
              {deleteAcctError && <div className="text-xs text-red-400 mt-1.5">{deleteAcctError}</div>}
            </div>
            <div className="flex gap-2 px-6 py-4">
              <button onClick={() => setDeleteAcctOpen(false)}
                className="flex-1 py-2 rounded-xl text-sm text-white/60 hover:text-white/90 transition-colors"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancel
              </button>
              <button
                disabled={deleteAcctSaving || !deleteAcctPw}
                onClick={async () => {
                  setDeleteAcctSaving(true)
                  const r = await selfDeleteAccount(deleteAcctPw)
                  setDeleteAcctSaving(false)
                  if (!r.success) setDeleteAcctError(r.error)
                }}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.35)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}>
                {deleteAcctSaving ? 'Deleting…' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* User Detail Modal */}
      {selectedUserId && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSelectedUserId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'rgba(16,16,28,0.99)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {detailLoading && (
              <div className="p-10 text-center text-white/30 text-sm">Loading…</div>
            )}
            {!detailLoading && !userDetail && (
              <div className="p-10 text-center text-white/30 text-sm">Failed to load user details.</div>
            )}
            {!detailLoading && userDetail && (() => {
              const pct = userDetail.storage.pct
              const storageColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--nova-accent,#7c3aed)'
              const fullName = [userDetail.firstName, userDetail.lastName].filter(Boolean).join(' ') || null
              const accountRows = [
                ...(fullName  ? [{ label: 'Full name',    value: fullName }] : []),
                ...(userDetail.email ? [{ label: 'Email', value: userDetail.email }] : []),
                { label: 'Member since', value: fmtDate(userDetail.createdAt) ?? '—' },
                { label: 'Last login',   value: fmtDate(userDetail.lastLoginAt) ?? 'Never' },
                { label: 'Last active',  value: fmtDate(userDetail.lastActiveAt) ?? 'Unknown' },
                { label: 'User ID',      value: userDetail.id, mono: true },
              ]
              return (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between p-6 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(130,80,255,0.2)', border: '1px solid rgba(130,80,255,0.3)' }}>
                        <User size={22} className="text-purple-300" />
                      </div>
                      <div>
                        {fullName && <div className="text-base font-semibold text-white">{fullName}</div>}
                        <div className={fullName ? "text-xs text-white/50 mt-0.5" : "text-base font-semibold text-white"}>{userDetail.username}</div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {userDetail.isAdmin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(130,80,255,0.3)', color: 'rgba(180,140,255,1)' }}>Admin</span>
                          )}
                          {userDetail.isFrozen && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(251,191,36,0.2)', color: 'rgba(251,191,36,0.9)' }}>Frozen</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedUserId(null)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white/80 transition-colors flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <X size={16} />
                    </button>
                  </div>

                  {/* Account */}
                  <div className="px-6 pb-4">
                    <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Account</div>
                    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {accountRows.map(({ label, value, mono }, i) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2.5"
                          style={i < accountRows.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.06)' } : {}}>
                          <span className="text-xs text-white/40 flex-shrink-0">{label}</span>
                          <span className={`text-xs text-white/80 text-right ml-4 truncate max-w-[190px] ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Storage */}
                  <div className="px-6 pb-4">
                    <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Storage</div>
                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs text-white/50">Disk usage</span>
                        <span className="text-xs font-semibold" style={{ color: storageColor }}>
                          {formatBytes(userDetail.storage.used)}
                          <span className="font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}> / {formatBytes(userDetail.storage.quota)}</span>
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct.toFixed(1)}%`, background: storageColor }} />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-xs text-white/30">{pct.toFixed(1)}% used</span>
                        <span className="text-xs text-white/30">{formatBytes(userDetail.storage.free)} free</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
                      <HardDrive size={11} />
                      {userDetail.fileCount} file{userDetail.fileCount !== 1 ? 's' : ''} stored on server
                    </div>
                  </div>

                  {/* Storage Quota editor */}
                  {(() => {
                    const quotaGB = ((userDetail.quotaBytes ?? 1073741824) / 1024 / 1024 / 1024).toFixed(0)
                    const draft   = editQuota[userDetail.id] ?? quotaGB
                    return (
                      <div className="px-6 pb-4">
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Storage Quota</div>
                        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <input
                            type="number" min={1} max={1000}
                            value={draft}
                            onChange={e => setEditQuota(q => ({ ...q, [userDetail.id]: e.target.value }))}
                            className="w-24 px-3 py-1.5 rounded-lg text-sm text-white"
                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}
                          />
                          <span className="text-sm text-white/50">GB</span>
                          {String(draft) !== String(quotaGB) && (
                            <button
                              onClick={async () => {
                                const bytes = Math.round(Number(draft) * 1024 * 1024 * 1024)
                                await adminSetQuota(userDetail.id, bytes)
                                setEditQuota(q => { const n = { ...q }; delete n[userDetail.id]; return n })
                                await fetchUsers()
                                adminGetUserDetail(userDetail.id).then(setUserDetail).catch(() => {})
                              }}
                              className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-colors"
                              style={{ background: 'rgba(130,80,255,0.4)', color: '#fff' }}
                            >Save</button>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* AI Quota editor */}
                  {(() => {
                    const fmtK    = n => n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n)
                    const aiQuotaK = Math.round((userDetail.aiQuotaTokens ?? 1000000) / 1000)
                    const aiUsed   = userDetail.aiUsedTokens ?? 0
                    const aiPct    = Math.min(100, userDetail.aiQuotaTokens > 0 ? (aiUsed / userDetail.aiQuotaTokens) * 100 : 0)
                    const aiColor  = aiPct > 90 ? '#ef4444' : aiPct > 70 ? '#f59e0b' : 'var(--nova-accent,#7c3aed)'
                    const draftAi  = editAiQuota[userDetail.id] ?? aiQuotaK
                    return (
                      <div className="px-6 pb-4">
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">AI Token Quota</div>
                        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-white/50">Used:</span>
                            <span className="text-xs font-semibold" style={{ color: aiColor }}>{fmtK(aiUsed)}</span>
                            <span className="text-xs text-white/30">/ {fmtK(userDetail.aiQuotaTokens ?? 1000000)} tokens</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <div className="h-full rounded-full" style={{ width: `${aiPct.toFixed(1)}%`, background: aiColor }} />
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="number" min={1} max={100000}
                              value={draftAi}
                              onChange={e => setEditAiQuota(q => ({ ...q, [userDetail.id]: e.target.value }))}
                              className="w-28 px-3 py-1.5 rounded-lg text-sm text-white"
                              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}
                            />
                            <span className="text-sm text-white/50">K tokens</span>
                            {String(draftAi) !== String(aiQuotaK) && (
                              <button
                                onClick={async () => {
                                  const tokens = Math.round(Number(draftAi) * 1000)
                                  await adminSetAiQuota(userDetail.id, tokens)
                                  setEditAiQuota(q => { const n = { ...q }; delete n[userDetail.id]; return n })
                                  await fetchUsers()
                                  adminGetUserDetail(userDetail.id).then(setUserDetail).catch(() => {})
                                }}
                                className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-colors"
                                style={{ background: 'rgba(130,80,255,0.4)', color: '#fff' }}
                              >Save</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Actions */}
                  {userDetail.id !== currentUserId && (
                    <div className="px-6 pb-4">
                      <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Actions</div>
                      <div className="flex flex-col gap-2">
                        {/* Freeze / Unfreeze */}
                        <button
                          onClick={() => setConfirmAction({
                            title: userDetail.isFrozen ? `Unfreeze "${userDetail.username}"?` : `Freeze "${userDetail.username}"?`,
                            message: userDetail.isFrozen
                              ? 'This will unfreeze the account. The user will be able to log in again.'
                              : 'This will immediately log the user out from all active sessions and prevent them from logging in until unfrozen.',
                            confirmLabel: userDetail.isFrozen ? 'Unfreeze' : 'Freeze',
                            variant: userDetail.isFrozen ? 'primary' : 'warning',
                            onConfirm: () => {
                              setConfirmAction(null)
                              freezeUser(userDetail.id, !userDetail.isFrozen)
                              setUserDetail(d => ({ ...d, isFrozen: !d.isFrozen }))
                            },
                          })}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm transition-colors"
                          style={userDetail.isFrozen
                            ? { background: 'rgba(130,80,255,0.12)', border: '1px solid rgba(130,80,255,0.25)', color: '#c4b5fd' }
                            : { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: 'rgba(251,191,36,0.9)' }}>
                          {userDetail.isFrozen ? <Unlock size={14} /> : <Lock size={14} />}
                          {userDetail.isFrozen ? 'Unfreeze Account' : 'Freeze Account'}
                        </button>

                        {/* Remote Logout */}
                        <button
                          onClick={() => setConfirmAction({
                            title: `Remote logout "${userDetail.username}"?`,
                            message: 'This will immediately end all active sessions. The user will need to log in again.',
                            confirmLabel: 'Force Logout',
                            variant: 'warning',
                            onConfirm: () => { setConfirmAction(null); revokeUserTokens(userDetail.id) },
                          })}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                          <LogOut size={14} />
                          Force Logout All Sessions
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setConfirmAction({
                            title: `Delete "${userDetail.username}"?`,
                            message: 'This will permanently delete the account and all associated files. This cannot be undone.',
                            confirmLabel: 'Delete',
                            variant: 'danger',
                            onConfirm: () => { setConfirmAction(null); deleteUser(userDetail.id); setSelectedUserId(null) },
                          })}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm transition-colors"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                          <X size={14} />
                          Delete Account
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Remote Password Change */}
                  {userDetail.id !== currentUserId && (
                    <div className="px-6 pb-4">
                      <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Remote Password Change</div>
                      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="text-xs text-white/40 mb-3">Sets a new password and immediately logs the user out from all active sessions.</div>
                        <input
                          type="password"
                          placeholder="New password (min. 4 chars)"
                          value={newPassword}
                          onChange={e => { setNewPassword(e.target.value); setPwError('') }}
                          className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none mb-2"
                          style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${pwError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}` }}
                        />
                        {pwError && <div className="text-xs text-red-400 mb-2">{pwError}</div>}
                        <button
                          disabled={pwSaving || newPassword.length < 4}
                          onClick={async () => {
                            if (newPassword.length < 4) { setPwError('Password must be at least 4 characters'); return }
                            setPwSaving(true)
                            const result = await adminChangePassword(userDetail.id, newPassword)
                            setPwSaving(false)
                            if (result?.error) { setPwError(result.error) }
                            else { setNewPassword(''); setPwError('') }
                          }}
                          className="w-full py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                          style={{ background: 'rgba(130,80,255,0.35)', border: '1px solid rgba(130,80,255,0.4)', color: '#c4b5fd' }}>
                          {pwSaving ? 'Changing…' : 'Change Password & Logout'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-6 pb-6">
                    <button onClick={() => setSelectedUserId(null)}
                      className="w-full py-2 rounded-xl text-sm text-white/60 hover:text-white/90 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      Close
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
