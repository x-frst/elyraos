import { create } from "zustand"
import { useStore } from "./useStore"
import { setJWT, getJWT, refreshAccessToken, setQp, getQp, dbInit, rawGet, rawSet, rawDel } from '../utils/db'
import { STORAGE_KEYS, STORAGE_PREFIX } from '../config.js'

const SESSION_KEY = STORAGE_KEYS.session
const API         = '/api'
let   _sseConnection  = null  // EventSource | null
let   _refreshTimer   = null  // auto-refresh timer handle

// ── Decode JWT payload client-side (no verification — just for UI state) ──────
function parseJWT(token) {
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    if (payload.exp && payload.exp * 1000 < Date.now()) return null // expired
    return payload
  } catch { return null }
}

// Restore guest session only (no JWT in localStorage — access tokens are short-lived)
const _storedSession  = rawGet(STORAGE_KEYS.session)
const _isGuestSession = _storedSession?.startsWith('guest-')

// ── Schedule a silent token refresh before expiry ───────────────────────────
function scheduleRefresh(token) {
  clearTimeout(_refreshTimer)
  const payload = parseJWT(token)
  if (!payload?.exp) return
  // Refresh 2 minutes before the token expires
  const msUntilRefresh = (payload.exp * 1000) - Date.now() - 2 * 60 * 1000
  if (msUntilRefresh <= 0) return
  _refreshTimer = setTimeout(async () => {
    const ok = await refreshAccessToken()
    if (ok) scheduleRefresh(getJWT()) // reschedule with the new token
    else useAuthStore.getState().logout() // refresh cookie also expired
  }, msUntilRefresh)
}

// ── Auth headers helper ─────────────────────────────────────────────────────────────────
function ah() {
  const jwt = getJWT()
  const qp  = getQp()
  return {
    'Content-Type': 'application/json',
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    ...(qp  ? { 'X-Nv-Qp': qp }                : {}),
  }
}

// ── Store ──────────────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  users:              [],
  currentUserId:      _isGuestSession ? _storedSession : null,
  currentUsername:    _isGuestSession ? 'Guest'        : null,
  currentUserIsAdmin: false,
  adminConfig:        { allowSignup: true, allowGuest: true, aiDebug: false },
  justRegistered:     false,
  sessionLoading:     !_isGuestSession, // true until initSession() completes
  // Pending state for email verification (set right after register)
  pendingUser:        null,
  pendingToken:       null,
  // Pending state for 2FA login (set when server returns twoFaPending: true)
  twoFaSessionId:     null,

  // Fetch public config from server (shown on login screen before login)
  async fetchAdminConfig() {
    try {
      const res = await fetch(`${API}/auth/config`)
      if (res.ok) set({ adminConfig: await res.json() })
    } catch {}
  },
  // ── Session restore on page load ──────────────────────────────────────────
  // Called once at startup. Uses the httpOnly refresh cookie to silently
  // re-issue a 15-min access token. No JWT needed in localStorage.
  async initSession() {
    if (_isGuestSession) { set({ sessionLoading: false }); return }
    try {
      const ok = await refreshAccessToken()
      if (!ok) { set({ sessionLoading: false }); return }
      const token = getJWT()
      const payload = parseJWT(token)
      if (!payload) { set({ sessionLoading: false }); return }
      rawSet(SESSION_KEY, payload.id)
      set({
        currentUserId:      payload.id,
        currentUsername:    payload.username,
        currentUserIsAdmin: payload.isAdmin || false,
        // sessionLoading stays true until reinitForUser finishes — prevents
        // components from sending protected requests while dbInit is still
        // consuming the first pass (race would cause 403 on concurrent calls)
      })
      scheduleRefresh(token)
      await useStore.getState().reinitForUser()
      get().startSessionWatch()
      set({ sessionLoading: false })
    } catch { set({ sessionLoading: false }) }
  },
  // ── Auth ─────────────────────────────────────────────────────────────────
  async login(username, password) {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',   // receive the httpOnly refresh cookie
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        return { success: false, error: d.error || 'Invalid username or password' }
      }
      const data = await res.json()
      // 2FA required — server sent OTP to email; wait for code before issuing tokens
      if (data.twoFaPending) {
        set({ twoFaSessionId: data.twoFaSessionId })
        return { success: false, twoFaPending: true }
      }
      const { token, user, qp } = data
      setJWT(token)
      if (qp) setQp(qp)
      scheduleRefresh(token)
      rawSet(SESSION_KEY, user.id)
      set({ currentUserId: user.id, currentUsername: user.username, currentUserIsAdmin: user.isAdmin || false, users: [user] })
      await useStore.getState().reinitForUser()
      get().startSessionWatch()
      set({ sessionLoading: false })
      return { success: true }
    } catch {
      return { success: false, error: 'Cannot reach server. Is it running? (npm run server)' }
    }
  },

  /** Complete a 2FA login by submitting the OTP received by email. */
  async loginWith2fa(otp) {
    const twoFaSessionId = get().twoFaSessionId
    if (!twoFaSessionId) return { success: false, error: 'No pending 2FA session.' }
    try {
      const res = await fetch(`${API}/auth/login/verify-2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ twoFaSessionId, otp }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        return { success: false, error: d.error || 'Invalid code.' }
      }
      const { token, user, qp } = await res.json()
      setJWT(token)
      if (qp) setQp(qp)
      scheduleRefresh(token)
      rawSet(SESSION_KEY, user.id)
      set({ currentUserId: user.id, currentUsername: user.username, currentUserIsAdmin: user.isAdmin || false, users: [user], twoFaSessionId: null })
      await useStore.getState().reinitForUser()
      get().startSessionWatch()
      set({ sessionLoading: false })
      return { success: true }
    } catch {
      return { success: false, error: 'Cannot reach server.' }
    }
  },

  async register(username, password, extra = {}) {
    if (!username?.trim() || (password?.length ?? 0) < 4)
      return { success: false, error: 'Username required and password must be ≥ 4 chars' }
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',   // receive the httpOnly refresh cookie
        body: JSON.stringify({ username, password, ...extra }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        return { success: false, error: d.error || 'Registration failed' }
      }
      const data = await res.json()

      if (data.emailVerificationSent) {
        // Server returned only a pendingToken — the user does NOT exist in DB yet.
        // No setJWT, no session, no refresh cookie.
        set({ pendingToken: data.pendingToken })
        return { success: true, emailVerificationSent: true }
      }

      // No email verification required — complete session immediately
      const { token, user, qp } = data
      setJWT(token)
      if (qp) setQp(qp)
      scheduleRefresh(token)
      rawSet(SESSION_KEY, user.id)
      set({ currentUserId: user.id, currentUsername: user.username, currentUserIsAdmin: user.isAdmin || false, users: [user], justRegistered: true })
      await useStore.getState().reinitForUser()
      get().startSessionWatch()
      set({ sessionLoading: false })
      return { success: true }
    } catch {
      return { success: false, error: 'Cannot reach server. Is it running? (npm run server)' }
    }
  },

  /** Called after the user submits the email verification OTP successfully. Completes session. */
  completeEmailVerification(token, user, qp) {
    setJWT(token)
    if (qp) setQp(qp)
    scheduleRefresh(token)
    rawSet(SESSION_KEY, user.id)
    set({ currentUserId: user.id, currentUsername: user.username, currentUserIsAdmin: user.isAdmin || false, users: [user], pendingUser: null, pendingToken: null, justRegistered: true })
    useStore.getState().reinitForUser().then(() => {
      get().startSessionWatch()
      set({ sessionLoading: false })
    })
  },

  clearJustRegistered() { set({ justRegistered: false }) },

  loginGuest() {
    const id = 'guest-' + Math.random().toString(36).slice(2, 8)
    rawSet(SESSION_KEY, id)
    set({ currentUserId: id, currentUsername: 'Guest' })
    // Clear any previous user's localStorage-mirrored data so it doesn't bleed into the
    // guest session via dbInit's localStorage fallback (guest has no JWT so it reads LS).
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(`${STORAGE_PREFIX}data:`)) keysToRemove.push(k)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch {}
    useStore.getState().reinitForUser()  // guest: no JWT, store runs in memory-only mode
  },

  logout() {
    get().stopSessionWatch()
    clearTimeout(_refreshTimer)
    _refreshTimer = null
    // Ask server to clear the httpOnly refresh cookie
    fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    setJWT(null)
    rawDel(SESSION_KEY)
    set({ currentUserId: null, currentUsername: null, currentUserIsAdmin: false, users: [], sessionLoading: false })
    window.location.reload()
  },

  // ── Admin operations ───────────────────────────────────────────────────────
  async updateAdminConfig(patch) {
    const config = { ...get().adminConfig, ...patch }
    set({ adminConfig: config })
    try {
      const res = await fetch(`${API}/admin/config`, { method: 'PUT', headers: ah(), body: JSON.stringify(config) })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    } catch {}
  },

  async fetchUsers() {
    try {
      const res = await fetch(`${API}/admin/users`, { headers: ah() })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
      if (res.ok) set({ users: await res.json() })
    } catch {}
  },

  async promoteUser(userId) {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/promote`, { method: 'PUT', headers: ah() })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
      await get().fetchUsers()
    } catch {}
  },

  async deleteUser(userId) {
    try {
      const res = await fetch(`${API}/admin/users/${userId}`, { method: 'DELETE', headers: ah() })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
      set(s => ({ users: s.users.filter(u => u.id !== userId) }))
    } catch {}
  },

  async freezeUser(userId, frozen) {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/freeze`, { method: 'PUT', headers: ah(), body: JSON.stringify({ frozen }) })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
      set(s => ({ users: s.users.map(u => u.id === userId ? { ...u, isFrozen: frozen } : u) }))
    } catch {}
  },

  async revokeUserTokens(userId) {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/revoke-tokens`, { method: 'POST', headers: ah() })
      const qt = res.headers.get('x-nv-qt');  if (qt) setQp(qt)
    } catch {}
  },

  async selfDeleteAccount(password) {
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'DELETE',
        headers: ah(),
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        return { success: false, error: d.error || 'Failed to delete account.' }
      }
      get().logout()
      return { success: true }
    } catch {
      return { success: false, error: 'Cannot reach server.' }
    }
  },

  startSessionWatch() {
    if (_sseConnection) return
    const token = getJWT()
    if (!token) return

    let _retryTimer = null
    const connect = () => {
      const es = new EventSource(`${API}/session/events?t=${encodeURIComponent(token)}`)
      _sseConnection = es

      // Only this explicit event should trigger a logout
      es.addEventListener('logout', () => {
        es.close()
        _sseConnection = null
        useAuthStore.getState().logout()
      })

      // Real-time catalog updates pushed by admin edits
      es.addEventListener('catalog-update', (e) => {
        try { useStore.getState().applyCatalogUpdate(JSON.parse(e.data)) } catch {}
      })

      es.onerror = () => {
        // If the connection is being retried by the browser (CONNECTING),
        // do nothing — EventSource auto-reconnects.
        // If it has been permanently closed (only happens on explicit .close() calls
        // or when we close it ourselves below), still do nothing here.
        // We NEVER logout on a network error — only on the explicit 'logout' event.
        if (es.readyState === EventSource.CLOSED) {
          _sseConnection = null
          // Retry after 5 s in case the server restarted during dev
          clearTimeout(_retryTimer)
          _retryTimer = setTimeout(() => {
          if (rawGet(STORAGE_KEYS.jwt)) connect()
          }, 5_000)
        }
      }
    }

    connect()
  },

  stopSessionWatch() {
    if (_sseConnection) { _sseConnection.close(); _sseConnection = null }
  },
}))

// Auto-start session restore on page load (reads httpOnly refresh cookie — no localStorage JWT)
if (!_isGuestSession) setTimeout(() => useAuthStore.getState().initSession(), 0)

// ── Derived helpers ───────────────────────────────────────────────────────────────
export function getCurrentUser() {
  const { users, currentUserId } = useAuthStore.getState()
  if (!currentUserId) return null
  if (currentUserId.startsWith('guest-')) return { id: currentUserId, username: 'Guest', isGuest: true, isAdmin: false }
  const jwt  = getJWT()
  const info = parseJWT(jwt)
  return users.find(u => u.id === currentUserId)
    || (info ? { id: info.id, username: info.username, isAdmin: info.isAdmin } : null)
}

export function userScopedKey(baseKey) { return baseKey }

