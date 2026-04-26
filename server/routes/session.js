import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'
import { JWT_SECRET } from '../config.js'
import { addClient, removeClient } from '../sseClients.js'

const router = Router()
export { router as sessionRouter }

/**
 * GET /api/session/events?t=<jwt>
 *
 * Opens a persistent Server-Sent Events stream for the authenticated user.
 * The server can push 'frozen' or 'logout' events at any time, which the
 * client handles by immediately calling logout().
 *
 * Also updates last_active_at on connect, and sends a keep-alive ping every
 * 25 s so proxies and load balancers don't close the idle connection.
 */
router.get('/events', async (req, res) => {
  const token = req.query.t
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Validate user status before opening the stream
  try {
    const { rows } = await pool.query(
      'SELECT is_frozen, tokens_invalidated_at FROM users WHERE id = $1',
      [payload.id]
    )
    const u = rows[0]
    if (!u) return res.status(401).json({ error: 'Account not found' })
    if (u.is_frozen) return res.status(403).json({ error: 'Account is frozen' })
    if (u.tokens_invalidated_at && payload.iat * 1000 < new Date(u.tokens_invalidated_at).getTime())
      return res.status(401).json({ error: 'Session revoked' })
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }

  // Mark user as active (fire-and-forget)
  pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [payload.id]).catch(() => {})

  // SSE headers — disable all buffering
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')  // disable nginx buffering
  res.flushHeaders()

  // Send a comment immediately so the browser knows the stream is open
  res.write(': connected\n\n')

  // Register connection
  addClient(payload.id, res)

  // Keep-alive ping every 25 s (prevents proxy / browser timeout)
  const ping = setInterval(() => {
    try { res.write(': ping\n\n') }
    catch { clearInterval(ping) }
  }, 25_000)

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(ping)
    removeClient(payload.id, res)
  })
})
