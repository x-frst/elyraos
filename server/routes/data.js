import { Router } from 'express'
import pool from '../db.js'
import { requireAuth, qpMiddleware } from './auth.js'

const router = Router()
export { router as dataRouter }

router.use(requireAuth)
// Exempt read-only GETs from the pass requirement (same rationale as /api/ai/quota).
// Data reads don't mutate state so replay-protection is unnecessary; requiring the pass
// on GET would cause dbInit() to consume a pass on every page load and race with writes.
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return qpMiddleware(req, res, next)
})

// GET /api/data  — bulk fetch all KV pairs (used to warm client-side cache on login)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM user_data WHERE user_id = $1', [req.user.id]
    )
    const result = {}
    for (const row of rows) result[row.key] = row.value  // pg parses JSONB columns automatically
    res.json(result)
  } catch (e) {
    console.error('GET /data', e.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/data/:key
router.get('/:key', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM user_data WHERE user_id = $1 AND key = $2',
      [req.user.id, req.params.key]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json({ value: rows[0].value })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/data/:key
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body
    if (value === undefined) return res.status(400).json({ error: '"value" field is required' })
    await pool.query(
      `INSERT INTO user_data (user_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.user.id, req.params.key, JSON.stringify(value)]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/data/:key
router.delete('/:key', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_data WHERE user_id = $1 AND key = $2',
      [req.user.id, req.params.key]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})
