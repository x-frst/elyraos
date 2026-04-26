/**
 * /api/chats — Account-scoped AI chat storage
 *
 * Each chat (title + messages + mode) is stored per-user in the ai_chats table.
 * Full message content (including base64 images and audio) is preserved so chats
 * are portable across devices and browsers for the same account.
 *
 * Routes:
 *   GET    /api/chats      — fetch all chats for the authenticated user
 *   PUT    /api/chats/:id  — upsert a single chat (create or update)
 *   DELETE /api/chats/:id  — delete a single chat
 */

import { Router } from 'express'
import pool from '../db.js'
import { requireAuth, qpMiddleware } from './auth.js'

const router = Router()
export { router as chatsRouter }

router.use(requireAuth)
// Reads are pass-free; writes consume the single-use request pass (same pattern as /api/data)
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return qpMiddleware(req, res, next)
})

// ── GET /api/chats ─────────────────────────────────────────────────────────────
// Returns all chats for the user, ordered most-recently-updated first.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT chat_id, title, mode, messages, agent_plan, updated_at
       FROM ai_chats
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user.id]
    )
    res.json(rows.map(r => ({
      id:        r.chat_id,
      title:     r.title,
      mode:      r.mode,
      messages:  r.messages,
      agentPlan: r.agent_plan ?? null,
      updatedAt: r.updated_at,
    })))
  } catch (e) {
    console.error('GET /chats', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PUT /api/chats/:id ─────────────────────────────────────────────────────────
// Upsert a chat. Strips streaming/uiOnly messages before persisting.
router.put('/:id', async (req, res) => {
  try {
    const { title, mode, messages, agentPlan } = req.body
    if (!title) return res.status(400).json({ error: '"title" is required' })

    // Filter out ephemeral messages that shouldn't be stored
    const persistable = (messages || []).filter(m => !m.streaming && !m.uiOnly)

    await pool.query(
      `INSERT INTO ai_chats (user_id, chat_id, title, mode, messages, agent_plan, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW())
       ON CONFLICT (user_id, chat_id)
       DO UPDATE SET
         title      = EXCLUDED.title,
         mode       = EXCLUDED.mode,
         messages   = EXCLUDED.messages,
         agent_plan = EXCLUDED.agent_plan,
         updated_at = NOW()`,
      [
        req.user.id,
        req.params.id,
        title,
        mode || 'text',
        JSON.stringify(persistable),
        agentPlan ? JSON.stringify(agentPlan) : null,
      ]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('PUT /chats/:id', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/chats/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM ai_chats WHERE user_id = $1 AND chat_id = $2',
      [req.user.id, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /chats/:id', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})
