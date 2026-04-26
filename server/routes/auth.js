import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes, createHash } from 'crypto'
import { rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pool from '../db.js'
import { JWT_SECRET, TOKEN_EXPIRY, MIN_PASSWORD_LENGTH, DEFAULT_AI_QUOTA_TOKENS, OTP_EXPIRY_MINUTES } from '../config.js'
import { STORAGE_PREFIX } from '../../src/config.js'
import { sendOtpEmail, isSmtpConfigured } from '../mailer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const authRouter = Router()

// Rate-limit last_active_at writes to at most once per 2 minutes per user
const _lastActiveWrite = new Map()

function uid()     { return 'u-'   + Math.random().toString(36).slice(2, 10) }
function otpId()   { return 'otp-' + randomBytes(8).toString('hex') }

/** Short-lived token returned while email verification is pending.
 * Carries the pending_registrations row ID — NOT a user ID.
 * Rejected by requireAuth so it can never access protected routes. */
function signPendingToken(pendingId) {
  return jwt.sign({ type: 'pending_reg', pendingId }, JWT_SECRET, { expiresIn: '30m' })
}

/** Middleware that only accepts pending_reg tokens (for verify-email endpoints). */
function requirePendingEmail(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET)
    if (payload.type !== 'pending_reg') return res.status(401).json({ error: 'Invalid token type.' })
    req.pendingId = payload.pendingId
    next()
  } catch {
    res.status(401).json({ error: 'Verification session expired. Please sign up again.' })
  }
}
function generateOtp() { return Math.floor(100000 + Math.random() * 900000).toString() }
function hashOtp(otp)  { return createHash('sha256').update(String(otp)).digest('hex') }

/** Store a new OTP record, replacing any existing pending code for the same (user, purpose). */
async function storeOtp(userId, purpose) {
  const otp       = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
  const id        = otpId()
  await pool.query('DELETE FROM email_otps WHERE user_id = $1 AND purpose = $2', [userId, purpose])
  await pool.query(
    'INSERT INTO email_otps (id, user_id, purpose, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, purpose, hashOtp(otp), expiresAt]
  )
  return { otp, id }
}

/** Validate an OTP. Returns the row on success, null otherwise. Marks used=true on success. */
async function consumeOtp(userId, purpose, rawOtp) {
  const { rows } = await pool.query(
    `SELECT * FROM email_otps
     WHERE user_id = $1 AND purpose = $2 AND otp_hash = $3
       AND used = FALSE AND expires_at > NOW()`,
    [userId, purpose, hashOtp(rawOtp)]
  )
  if (!rows[0]) return null
  await pool.query('UPDATE email_otps SET used = TRUE WHERE id = $1', [rows[0].id])
  return rows[0]
}

const REFRESH_COOKIE  = `${STORAGE_PREFIX}_refresh`
const REFRESH_TTL_MS  = 7 * 24 * 3600 * 1000   // 7 days

function signToken(user) {
  return jwt.sign(
    { type: 'access', id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  )
}

/** SHA-256 of the raw token — what gets stored in the DB. Never the raw value. */
function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Creates a new refresh session row in the DB and sets the httpOnly cookie.
 * @param {object} res       - Express response
 * @param {string} userId    - user ID
 * @param {string} familyId  - reuse-detection family (same for all rotations of one login)
 */
async function issueRefreshToken(res, userId, familyId) {
  const raw      = randomBytes(48).toString('base64url')  // 384 bits of entropy
  const hash     = hashToken(raw)
  const id       = 'rs-' + randomBytes(8).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)

  await pool.query(
    `INSERT INTO refresh_sessions (id, user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, hash, familyId, expiresAt]
  )

  const isProd = process.env.NODE_ENV === 'production'
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,          // not accessible via JS
    sameSite: 'lax',         // blocked on cross-site POST
    secure:   isProd,        // HTTPS only in production
    maxAge:   REFRESH_TTL_MS,
    path:     '/api/auth',   // cookie only sent to /api/auth/* routes
  })

  return raw
}

/** Purge all refresh sessions for a user (nuclear option on reuse detection). */
async function invalidateAllSessions(userId) {
  await pool.query('DELETE FROM refresh_sessions WHERE user_id = $1', [userId])
}

const QP_TTL_MS = 16 * 60 * 1000  // 16 minutes — slightly exceeds the 15-min access token

/**
 * Issues a single-use request pass into the DB and returns the raw value.
 * The client stores it in memory and sends it with every AI request.
 * The AI middleware atomically consumes it and returns a fresh one.
 */
export async function issueQp(userId) {
  const val       = randomBytes(32).toString('base64url')  // 256 bits, URL-safe
  const id        = 'qp-' + randomBytes(8).toString('hex')
  const expiresAt = new Date(Date.now() + QP_TTL_MS)
  await pool.query(
    'INSERT INTO qp_pool (id, user_id, qp_val, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, val, expiresAt]
  )
  return val
}

/**
 * Express middleware: validates and atomically consumes the single-use request
 * pass from the X-Nv-Qp request header, then issues a fresh one in X-Nv-Qt.
 * Apply this to every route that should be protected beyond JWT authentication.
 * Public routes (login, register, refresh) are exempt — they're where passes originate.
 */
export async function qpMiddleware(req, res, next) {
  const presented = req.headers['x-nv-qp']
  if (!presented) return res.status(403).json({ error: 'Unauthorized.' })

  try {
    const { rows } = await pool.query(
      `DELETE FROM qp_pool
       WHERE qp_val = $1 AND user_id = $2 AND expires_at > NOW()
       RETURNING id`,
      [presented, req.user.id]
    )
    if (!rows.length) return res.status(403).json({ error: 'Unauthorized.' })

    const freshQp = await issueQp(req.user.id)
    res.setHeader('X-Nv-Qt', freshQp)
    next()
  } catch (e) {
    console.error('[qp]', e.message)
    res.status(500).json({ error: 'Server error.' })
  }
}

function toPublic(u) {
  return {
    id:            u.id,
    username:      u.username,
    firstName:     u.first_name    || null,
    lastName:      u.last_name     || null,
    email:         u.email         || null,
    isAdmin:       Boolean(u.is_admin),
    emailVerified: Boolean(u.email_verified),
    twoFaEnabled:  Boolean(u.two_fa_enabled),
    createdAt:     u.created_at,
  }
}

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET)
    // Reject non-access tokens — pending_reg tokens must never reach protected routes
    if (payload.type === 'refresh' || payload.type === 'pending_email' || payload.type === 'pending_reg')
      return res.status(401).json({ error: 'Invalid token type.' })
    const { rows } = await pool.query(
      'SELECT is_frozen, tokens_invalidated_at FROM users WHERE id = $1',
      [payload.id]
    )
    const u = rows[0]
    if (!u) return res.status(401).json({ error: 'Account not found — please log in again.' })
    if (u.is_frozen) return res.status(403).json({ error: 'Account is frozen.' })
    if (u.tokens_invalidated_at && payload.iat * 1000 < new Date(u.tokens_invalidated_at).getTime())
      return res.status(401).json({ error: 'Session revoked — please log in again.' })
    req.user = payload
    // Rate-limited last_active_at update — at most once every 2 minutes per user
    const now = Date.now()
    if (!_lastActiveWrite.has(payload.id) || now - _lastActiveWrite.get(payload.id) > 120_000) {
      _lastActiveWrite.set(payload.id, now)
      pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [payload.id]).catch(() => {})
    }
    next()
  } catch {
    res.status(401).json({ error: 'Token expired or invalid — please log in again.' })
  }
}

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password, firstName, lastName, email } = req.body || {}
    if (!username?.trim())         return res.status(400).json({ error: 'Username is required' })
    if (!password || password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })

    const cfgRow = await pool.query(`SELECT value FROM app_config WHERE key = 'admin'`)
    const config = cfgRow.rows[0]?.value || {}
    if (config.allowSignup === false)
      return res.status(403).json({ error: 'New registrations are currently disabled.' })

    const trimmedEmail = email?.trim() || null

    // Check username / email conflicts in real users table
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]
    )
    if (userCheck.rows.length > 0) return res.status(409).json({ error: 'Username already taken' })

    if (trimmedEmail) {
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [trimmedEmail])
      if (emailCheck.rows.length > 0) return res.status(409).json({ error: 'Email already in use' })
    }

    // Determine admin: first registered user overall (users + pending) gets admin
    const [userCount, pendingCount] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n FROM users'),
      pool.query('SELECT COUNT(*) AS n FROM pending_registrations'),
    ])
    const isAdmin = parseInt(userCount.rows[0].n) === 0 && parseInt(pendingCount.rows[0].n) === 0

    const hash = await bcrypt.hash(password, 10)

    // ── SMTP configured + email provided ────────────────────────────────────────────
    // DO NOT insert into users yet. Store in pending_registrations and wait for OTP.
    if (isSmtpConfigured() && trimmedEmail) {
      // Replace any stale pending row for the same username or email
      await pool.query(
        'DELETE FROM pending_registrations WHERE LOWER(username) = LOWER($1) OR email = $2',
        [username.trim(), trimmedEmail]
      )
      const otp       = generateOtp()
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
      const pendingId = 'pr-' + randomBytes(12).toString('hex')
      await pool.query(
        `INSERT INTO pending_registrations
         (id, username, password_hash, first_name, last_name, email, is_admin, otp_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pendingId, username.trim(), hash,
         firstName?.trim() || null, lastName?.trim() || null, trimmedEmail,
         isAdmin, hashOtp(otp), expiresAt]
      )
      try {
        await sendOtpEmail({ to: trimmedEmail, otp, purpose: 'verify_email' })
      } catch (mailErr) {
        console.error('[register/mailer]', mailErr.message)
        // Email send failed — clean up pending row and fall through to direct creation
        await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pendingId])
        // Fall through to the direct-creation path below
        return res.status(503).json({ error: 'Failed to send verification email. Please try again.' })
      }
      return res.json({ pendingToken: signPendingToken(pendingId), emailVerificationSent: true })
    }

    // ── No email verification needed (no SMTP or no email) ────────────────────
    // Create the user directly and issue a full session.
    const result = await pool.query(
      `INSERT INTO users
       (id, username, password_hash, is_admin, first_name, last_name, email, ai_quota_tokens, last_login_at, email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),TRUE)
       ON CONFLICT (username) DO NOTHING
       RETURNING *`,
      [uid(), username.trim(), hash, isAdmin,
       firstName?.trim() || null, lastName?.trim() || null, trimmedEmail,
       DEFAULT_AI_QUOTA_TOKENS]
    )
    if (!result.rows[0]) return res.status(409).json({ error: 'Username already taken' })
    const user = result.rows[0]
    const familyId = randomBytes(16).toString('hex')
    await issueRefreshToken(res, user.id, familyId)
    const qp = await issueQp(user.id)
    res.json({ token: signToken(user), user: toPublic(user), qp, emailVerificationSent: false })
  } catch (e) {
    console.error('/register', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' })

    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]
    )
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid username or password' })

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Invalid username or password' })
    if (user.is_frozen) return res.status(403).json({ error: 'This account has been frozen by an administrator.' })

    // 2FA check — only if enabled AND SMTP is currently configured.
    // If SMTP was removed after 2FA was enabled, bypass 2FA silently so the account stays accessible.
    if (user.two_fa_enabled && user.email && isSmtpConfigured()) {
      try {
        const { id: twoFaSessionId, otp } = await storeOtp(user.id, 'login_2fa')
        await sendOtpEmail({ to: user.email, otp, purpose: 'login_2fa' })
        return res.json({ twoFaPending: true, twoFaSessionId })
      } catch (mailErr) {
        console.error('[login/2fa-mailer]', mailErr.message)
        return res.status(500).json({ error: 'Failed to send two-factor code. Please try again.' })
      }
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])
    const familyId = randomBytes(16).toString('hex')
    await issueRefreshToken(res, user.id, familyId)
    const qp = await issueQp(user.id)
    res.json({ token: signToken(user), user: toPublic(user), qp })
  } catch (e) {
    console.error('/login', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/verify-email — validate OTP, create user, issue session ────
// Uses requirePendingEmail — the user does NOT exist in the DB yet.
authRouter.post('/verify-email', requirePendingEmail, async (req, res) => {
  const { otp } = req.body || {}
  if (!otp) return res.status(400).json({ error: 'Verification code is required.' })
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pending_registrations WHERE id = $1 AND expires_at > NOW()',
      [req.pendingId]
    )
    const pending = rows[0]
    if (!pending) return res.status(400).json({ error: 'Registration session expired. Please sign up again.' })
    if (pending.otp_hash !== hashOtp(String(otp).trim()))
      return res.status(400).json({ error: 'Invalid or expired code.' })

    // Last-minute conflict checks (race condition guard)
    const [userConflict, emailConflict] = await Promise.all([
      pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [pending.username]),
      pending.email ? pool.query('SELECT id FROM users WHERE email = $1', [pending.email]) : { rows: [] },
    ])
    if (userConflict.rows.length > 0)
      return res.status(409).json({ error: 'Username was taken. Please sign up again with a different username.' })
    if (emailConflict.rows.length > 0)
      return res.status(409).json({ error: 'Email was taken. Please sign up again with a different email.' })

    // OTP valid — create the real user now
    const result = await pool.query(
      `INSERT INTO users
       (id, username, password_hash, is_admin, first_name, last_name, email, ai_quota_tokens, last_login_at, email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),TRUE)
       RETURNING *`,
      [uid(), pending.username, pending.password_hash, pending.is_admin,
       pending.first_name, pending.last_name, pending.email,
       DEFAULT_AI_QUOTA_TOKENS]
    )
    const user = result.rows[0]

    // Delete the pending row — it's consumed
    await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id])

    // Issue a real session
    const familyId = randomBytes(16).toString('hex')
    await issueRefreshToken(res, user.id, familyId)
    const qp = await issueQp(user.id)
    res.json({ ok: true, token: signToken(user), user: toPublic(user), qp })
  } catch (e) {
    console.error('/verify-email', e.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/auth/verify-email/resend — resend OTP to a pending registration ─
authRouter.post('/verify-email/resend', requirePendingEmail, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pending_registrations WHERE id = $1 AND expires_at > NOW()',
      [req.pendingId]
    )
    const pending = rows[0]
    if (!pending) return res.status(400).json({ error: 'Registration session expired. Please sign up again.' })
    if (!pending.email) return res.status(400).json({ error: 'No email on file.' })
    if (!isSmtpConfigured()) return res.status(503).json({ error: 'SMTP not configured.' })
    const newOtp    = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
    await pool.query(
      'UPDATE pending_registrations SET otp_hash = $1, expires_at = $2 WHERE id = $3',
      [hashOtp(newOtp), expiresAt, pending.id]
    )
    await sendOtpEmail({ to: pending.email, otp: newOtp, purpose: 'verify_email' })
    res.json({ ok: true })
  } catch (e) {
    console.error('/verify-email/resend', e.message)
    res.status(500).json({ error: 'Failed to send code.' })
  }
})

// ── POST /api/auth/login/verify-2fa — complete 2FA login ──────────────────────
authRouter.post('/login/verify-2fa', async (req, res) => {
  const { twoFaSessionId, otp } = req.body || {}
  if (!twoFaSessionId || !otp) return res.status(400).json({ error: 'Session ID and code are required.' })
  try {
    // Look up the pending OTP by its ID
    const { rows: otpRows } = await pool.query(
      `SELECT * FROM email_otps
       WHERE id = $1 AND purpose = 'login_2fa' AND used = FALSE AND expires_at > NOW()`,
      [twoFaSessionId]
    )
    const otpRow = otpRows[0]
    if (!otpRow) return res.status(400).json({ error: 'Session expired. Please log in again.' })
    if (otpRow.otp_hash !== hashOtp(String(otp).trim()))
      return res.status(400).json({ error: 'Invalid code.' })

    // Consume the OTP
    await pool.query('UPDATE email_otps SET used = TRUE WHERE id = $1', [otpRow.id])

    // Load the user and complete the login
    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [otpRow.user_id])
    const user = userRows[0]
    if (!user) return res.status(404).json({ error: 'Account not found.' })
    if (user.is_frozen) return res.status(403).json({ error: 'This account has been frozen.' })

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])
    const familyId = randomBytes(16).toString('hex')
    await issueRefreshToken(res, user.id, familyId)
    const qp = await issueQp(user.id)
    res.json({ token: signToken(user), user: toPublic(user), qp })
  } catch (e) {
    console.error('/login/verify-2fa', e.message)
    res.status(500).json({ error: 'Server error.' })
  }
})

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json({ user: toPublic(result.rows[0]) })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

authRouter.put('/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Current and new password are required.' })
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found.' })
    const match = await bcrypt.compare(currentPassword, user.password_hash)
    if (!match) return res.status(400).json({ error: 'Current password is incorrect.' })
    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

authRouter.delete('/me', requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' })
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'User not found.' })
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Incorrect password.' })
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id])
    const storageDir = join(__dirname, '..', 'storage', req.user.id)
    try { rmSync(storageDir, { recursive: true, force: true }) } catch {}
    res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /auth/me', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

authRouter.get('/config', async (_req, res) => {
  try {
    const row = await pool.query(`SELECT value FROM app_config WHERE key = 'admin'`)
    const cfg = row.rows[0]?.value || {}
    res.json({ allowSignup: cfg.allowSignup !== false, allowGuest: cfg.allowGuest !== false, aiDebug: cfg.aiDebug === true })
  } catch {
    res.json({ allowSignup: true, allowGuest: true, aiDebug: false })
  }
})

// ── POST /api/auth/refresh — issue a new 15-min access token from the refresh cookie ──
authRouter.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE]
  if (!raw) return res.status(401).json({ error: 'No refresh token.' })

  const hash = hashToken(raw)

  try {
    // Look up the token hash in the DB
    const { rows } = await pool.query(
      `SELECT rs.*, u.is_frozen, u.tokens_invalidated_at,
              u.username, u.is_admin
       FROM   refresh_sessions rs
       JOIN   users u ON u.id = rs.user_id
       WHERE  rs.token_hash = $1`,
      [hash]
    )
    const session = rows[0]

    if (!session) {
      // Token hash not found at all — could be expired+cleaned-up or just invalid
      return res.status(401).json({ error: 'Session not found — please log in again.' })
    }

    // ★ REUSE DETECTION: token exists but was already replaced — replay attack detected
    if (session.replaced) {
      // A stolen token is being cycled. Nuke every session in this family.
      await pool.query('DELETE FROM refresh_sessions WHERE family_id = $1', [session.family_id])
      console.warn(`[security] Refresh token reuse detected for user ${session.user_id} — all sessions invalidated`)
      res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/api/auth' })
      return res.status(401).json({ error: 'Session reuse detected — all sessions have been terminated. Please log in again.' })
    }

    // Hard expiry check (belt-and-suspenders over DB expires_at)
    if (new Date(session.expires_at) < new Date()) {
      await pool.query('DELETE FROM refresh_sessions WHERE id = $1', [session.id])
      return res.status(401).json({ error: 'Refresh token expired — please log in again.' })
    }

    if (session.is_frozen) {
      return res.status(403).json({ error: 'Account is frozen.' })
    }

    if (session.tokens_invalidated_at && session.created_at < session.tokens_invalidated_at) {
      await pool.query('DELETE FROM refresh_sessions WHERE family_id = $1', [session.family_id])
      return res.status(401).json({ error: 'Session revoked — please log in again.' })
    }

    // Mark the current token as replaced (one-time use enforced)
    await pool.query('UPDATE refresh_sessions SET replaced = TRUE WHERE id = $1', [session.id])

    // Issue a new token in the same family (rotation)
    const user = { id: session.user_id, username: session.username, is_admin: session.is_admin }
    await issueRefreshToken(res, user.id, session.family_id)
    const qp = await issueQp(user.id)
    res.json({ token: signToken(user), user: { id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) }, qp })
  } catch (e) {
    console.error('/refresh', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/logout — invalidate refresh token in DB + clear cookie ────────
authRouter.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE]
  if (raw) {
    const hash = hashToken(raw)
    // Delete just this session (not the whole family — user may have other devices)
    await pool.query('DELETE FROM refresh_sessions WHERE token_hash = $1', [hash]).catch(() => {})
  }
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/api/auth' })
  res.json({ ok: true })
})
