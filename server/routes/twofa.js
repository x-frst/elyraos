/**
 * Elyra — Two-Factor Authentication Routes
 * GET  /api/twofa/status     — is 2FA currently enabled? + does user have email?
 * POST /api/twofa/send-otp   — send an OTP to enable or disable 2FA
 * POST /api/twofa/enable     — verify OTP and enable 2FA
 * POST /api/twofa/disable    — verify OTP and disable 2FA
 *
 * All routes require a valid Bearer token (requireAuth).
 */

import { Router }             from 'express'
import { randomBytes, createHash } from 'crypto'
import pool                   from '../db.js'
import { requireAuth }        from './auth.js'
import { OTP_EXPIRY_MINUTES } from '../config.js'
import { sendOtpEmail, isSmtpConfigured } from '../mailer.js'

export const twofaRouter = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function otpId()         { return 'otp-' + randomBytes(8).toString('hex') }
function generateOtp()   { return Math.floor(100000 + Math.random() * 900000).toString() }
function hashOtp(raw)    { return createHash('sha256').update(String(raw)).digest('hex') }

async function sendPurposeOtp(userId, userEmail, purpose) {
  const otp       = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
  const id        = otpId()
  // Invalidate any previous pending code for the same (user, purpose)
  await pool.query('DELETE FROM email_otps WHERE user_id = $1 AND purpose = $2', [userId, purpose])
  await pool.query(
    'INSERT INTO email_otps (id, user_id, purpose, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, purpose, hashOtp(otp), expiresAt]
  )
  await sendOtpEmail({ to: userEmail, otp, purpose })
}

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

// ── GET /status ───────────────────────────────────────────────────────────────

twofaRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT two_fa_enabled, email FROM users WHERE id = $1', [req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' })
    res.json({
      enabled:          Boolean(rows[0].two_fa_enabled),
      hasEmail:         Boolean(rows[0].email),
      smtpConfigured:   isSmtpConfigured(),
    })
  } catch {
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /send-otp ────────────────────────────────────────────────────────────
// Body: { purpose: 'enable_2fa' | 'disable_2fa' }

twofaRouter.post('/send-otp', requireAuth, async (req, res) => {
  const { purpose } = req.body || {}
  if (!['enable_2fa', 'disable_2fa'].includes(purpose))
    return res.status(400).json({ error: "purpose must be 'enable_2fa' or 'disable_2fa'." })

  try {
    const { rows } = await pool.query(
      'SELECT email, two_fa_enabled FROM users WHERE id = $1', [req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' })

    if (!rows[0].email)
      return res.status(400).json({ error: 'No email address on file. Please add one in Account settings first.' })
    if (!isSmtpConfigured())
      return res.status(503).json({ error: 'Email is not configured on this server.' })
    if (purpose === 'enable_2fa'  && rows[0].two_fa_enabled)
      return res.status(409).json({ error: 'Two-factor authentication is already enabled.' })
    if (purpose === 'disable_2fa' && !rows[0].two_fa_enabled)
      return res.status(409).json({ error: 'Two-factor authentication is not enabled.' })

    await sendPurposeOtp(req.user.id, rows[0].email, purpose)
    res.json({ ok: true, expiresIn: OTP_EXPIRY_MINUTES })
  } catch (e) {
    console.error('[2fa/send-otp]', e.message)
    res.status(500).json({ error: 'Failed to send code. Please try again.' })
  }
})

// ── POST /enable ──────────────────────────────────────────────────────────────
// Body: { otp: '123456' }

twofaRouter.post('/enable', requireAuth, async (req, res) => {
  const { otp } = req.body || {}
  if (!otp) return res.status(400).json({ error: 'Code is required.' })
  try {
    const row = await consumeOtp(req.user.id, 'enable_2fa', String(otp).trim())
    if (!row) return res.status(400).json({ error: 'Invalid or expired code.' })
    await pool.query('UPDATE users SET two_fa_enabled = TRUE WHERE id = $1', [req.user.id])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /disable ─────────────────────────────────────────────────────────────
// Body: { otp: '123456' }

twofaRouter.post('/disable', requireAuth, async (req, res) => {
  const { otp } = req.body || {}
  if (!otp) return res.status(400).json({ error: 'Code is required.' })
  try {
    const row = await consumeOtp(req.user.id, 'disable_2fa', String(otp).trim())
    if (!row) return res.status(400).json({ error: 'Invalid or expired code.' })
    await pool.query('UPDATE users SET two_fa_enabled = FALSE WHERE id = $1', [req.user.id])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error.' })
  }
})
