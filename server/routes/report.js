/**
 * Elyra — App Report Route
 * POST /api/report/app  (requireAuth)
 *
 * Accepts a JSON body with { appTitle, appUrl?, category, description, attachment? }
 * Looks up the reporter's profile from the DB (never trusts client-sent name/email),
 * then fires an email to OWNER_EMAIL via the mailer.
 */

import { Router }            from 'express'
import pool                  from '../db.js'
import { requireAuth }       from './auth.js'
import { sendAppReportEmail } from '../mailer.js'

const router = Router()

const VALID_CATEGORIES = new Set([
  'app_not_working',
  'needs_update',
  'broken_link',
  'removal_request',
  'inappropriate',
  'copyright',
  'security',
  'spam_misleading',
  'feature_request',
  'duplicate',
  'other',
])

const MAX_DESCRIPTION_LEN = 4_000
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB base64 decoded

router.post('/app', requireAuth, async (req, res) => {
  try {
    const { appTitle, appUrl, category, description, attachment } = req.body || {}

    // ── Input validation ───────────────────────────────────────────────────────
    if (!appTitle || typeof appTitle !== 'string' || !appTitle.trim())
      return res.status(400).json({ error: 'appTitle is required.' })

    if (!category || !VALID_CATEGORIES.has(category))
      return res.status(400).json({ error: 'Invalid category.' })

    if (!description || typeof description !== 'string' || !description.trim())
      return res.status(400).json({ error: 'description is required.' })

    if (description.length > MAX_DESCRIPTION_LEN)
      return res.status(400).json({ error: 'Description is too long (max 4 000 characters).' })

    if (appUrl && typeof appUrl === 'string') {
      try { new URL(appUrl) } catch { return res.status(400).json({ error: 'Invalid appUrl.' }) }
    }

    // ── Attachment validation ──────────────────────────────────────────────────
    let safeAttachment = null
    if (attachment && typeof attachment === 'object') {
      const { name, type, data } = attachment
      if (!name || !type || !data || typeof data !== 'string')
        return res.status(400).json({ error: 'Attachment must have name, type, and base64 data.' })

      const decoded = Buffer.byteLength(data, 'base64')
      if (decoded > MAX_ATTACHMENT_BYTES)
        return res.status(413).json({ error: 'Attachment exceeds 5 MB limit.' })

      safeAttachment = { name: String(name).slice(0, 255), type: String(type).slice(0, 100), data }
    }

    // ── Look up reporter profile from DB (authoritative) ─────────────────────
    const { rows } = await pool.query(
      'SELECT username, first_name, last_name, email FROM users WHERE id = $1',
      [req.user.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' })

    const u = rows[0]
    const reporterName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username

    // ── Send email (fire-and-forget — don't block the response) ──────────────
    sendAppReportEmail({
      reporterName,
      reporterUsername: u.username,
      reporterEmail:    u.email || '(no email on record)',
      appTitle:         appTitle.trim(),
      appUrl:           appUrl || null,
      category,
      description:      description.trim(),
      attachment:       safeAttachment,
    }).catch(err => console.error('[report] Email delivery failed:', err))

    return res.json({ ok: true })
  } catch (err) {
    console.error('[report] Unexpected error:', err)
    return res.status(500).json({ error: 'Server error.' })
  }
})

export { router as reportRouter }
