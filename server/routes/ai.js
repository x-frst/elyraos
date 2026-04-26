/**
 * /api/ai  — Server-side AI generation proxy
 *
 * All requests are routed through the server so the API key is never
 * exposed to the browser. Token usage is tracked per user and enforced
 * against a per-user quota stored in the `ai_used_tokens` / `ai_quota_tokens`
 * database columns.
 *
 * Routes:
 *   GET  /api/ai/quota           — current user's AI quota usage
 *   POST /api/ai/chat            — streaming text / code completion (SSE)
 *   POST /api/ai/image           — image generation (returns data-URL)
 *   POST /api/ai/audio           — text-to-speech (returns base64 audio)
 *   POST /api/ai/agent-plan      — plan a project → structured JSON
 */

import { Router } from 'express'
import { experimental_generateVideo } from 'ai'
import rateLimit from 'express-rate-limit'
import pool from '../db.js'
import { requireAuth, issueQp, qpMiddleware } from './auth.js'
import { BRANDING } from '../../src/config.js'
import { VERCEL_AI_BASE, AI_MODELS, DEFAULT_AI_QUOTA_TOKENS, AI_PRICING, calcTextCost, calcVideoCost,
         AI_PROVIDER, AI_API_KEY, GEMINI_AI_BASE, GEMINI_REST_BASE } from '../config.js'

const router = Router()
export { router as aiRouter }

router.use(requireAuth)

// Per-user rate limit: 20 AI requests per minute.
// Uses user ID (from validated JWT) so abuse from one account cannot
// exhaust the limit for other users, regardless of shared IP.
const aiRateLimiter = rateLimit({
  windowMs:     60 * 1000,
  max:          20,
  keyGenerator: (req) => req.user.id,
  handler:      (_req, res) => res.status(429).json({ error: 'Too many requests — please wait a moment before trying again.' }),
  standardHeaders: true,
  legacyHeaders:   false,
})
router.use(aiRateLimiter)

// The pass (X-Nv-Qp) is required only for AI generation requests (POST).
// GET requests like /quota are read-only and can be called by multiple
// open components simultaneously — enforcing the pass there would cause
// concurrent calls to race and 403 each other.
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return qpMiddleware(req, res, next)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute the next renewal date: same day-of-month as `anchorDate`, on or
 * after `afterDate`.  Handles month-end overflow (e.g. Jan 31 → Feb 28/29).
 */
function nextRenewalDate(anchorDate, afterDate) {
  const renewDay = anchorDate.getUTCDate()
  // Try the same day this month
  const candidate = new Date(Date.UTC(
    afterDate.getUTCFullYear(),
    afterDate.getUTCMonth(),
    renewDay,
    0, 0, 0, 0
  ))
  // If the day overflowed (e.g. Feb 30 → Mar 2), clamp to end of that month
  // by trying the last day available (getUTCDate will mismatch if it overflowed)
  if (candidate.getUTCDate() !== renewDay) {
    // Clamp to last day of month
    candidate.setUTCDate(0) // 0 = last day of previous month — back one month, so use:
    const eom = new Date(Date.UTC(afterDate.getUTCFullYear(), afterDate.getUTCMonth() + 1, 0))
    return eom < afterDate ? nextRenewalDate(anchorDate, new Date(afterDate.getUTCFullYear(), afterDate.getUTCMonth() + 1, 1)) : eom
  }
  if (candidate <= afterDate) {
    // Already passed this month — advance to next month
    return nextRenewalDate(anchorDate, new Date(Date.UTC(
      afterDate.getUTCFullYear(),
      afterDate.getUTCMonth() + 1,
      1
    )))
  }
  return candidate
}

/**
 * If the user's monthly renewal date has arrived, reset ai_used_tokens to 0
 * and record the renewal timestamp.  Safe to call on every request — it's a
 * no-op when renewal isn't due yet.
 */
async function maybeRenewAiQuota(userId) {
  const { rows } = await pool.query(
    'SELECT created_at, ai_quota_renewed_at FROM users WHERE id = $1', [userId]
  )
  if (!rows[0]) return
  const createdAt  = new Date(rows[0].created_at)
  const renewedAt  = rows[0].ai_quota_renewed_at ? new Date(rows[0].ai_quota_renewed_at) : null
  const now        = new Date()

  // Anchor is the registration date; last renewal resets the "after" window
  const windowStart = renewedAt ?? createdAt
  // Renewal is due if the anchor day has passed in the current month since windowStart
  const renewDay = createdAt.getUTCDate()
  // Build the candidate renewal date for the current cycle
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), renewDay))
  // Clamp end-of-month overflow
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const clampedDay = Math.min(renewDay, daysInMonth)
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), clampedDay))

  // Due if: dueDate has passed today AND dueDate is after the last renewal window start
  if (now >= dueDate && dueDate > windowStart) {
    await pool.query(
      'UPDATE users SET ai_used_tokens = 0, ai_quota_renewed_at = $1 WHERE id = $2',
      [now.toISOString(), userId]
    )
  }
}

async function getAiQuota(userId) {
  await maybeRenewAiQuota(userId)
  const { rows } = await pool.query(
    'SELECT ai_quota_tokens, ai_used_tokens, created_at, ai_quota_renewed_at FROM users WHERE id = $1', [userId]
  )
  // pg returns BIGINT columns as strings — always parse to integer before comparing
  const quota = parseInt(rows[0]?.ai_quota_tokens, 10)
  const used  = parseInt(rows[0]?.ai_used_tokens,  10)
  const q     = (isNaN(quota) || quota === 0) ? DEFAULT_AI_QUOTA_TOKENS : quota
  const u     = isNaN(used) ? 0 : used

  // Compute next renewal date for the response
  const createdAt = rows[0]?.created_at ? new Date(rows[0].created_at) : new Date()
  const renewedAt = rows[0]?.ai_quota_renewed_at ? new Date(rows[0].ai_quota_renewed_at) : null
  const windowStart = renewedAt ?? createdAt
  const renewsAt = nextRenewalDate(createdAt, windowStart)

  return { quota: q, used: u, free: Math.max(0, q - u), renewsAt }
}

// ── Provider helpers ──────────────────────────────────────────────────────────

/** Returns true when the active provider is Gemini. */
const isGemini = () => AI_PROVIDER === 'gemini'

/**
 * Active API key — Gemini key when AI_PROVIDER=gemini, Vercel key otherwise.
 * All routes call this so the 503 "not configured" check works for both.
 */
function activeKey() { return AI_API_KEY }

/**
 * Headers for OpenAI-compatible chat/text endpoints.
 * Both Vercel and Gemini use Authorization: Bearer <key> here.
 */
function aiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeKey()}`,
  }
}

/**
 * Base URL for chat/text completions.
 * Vercel: configured VERCEL_AI_BASE
 * Gemini: OpenAI-compat layer at generativelanguage.googleapis.com
 */
function chatBase() { return isGemini() ? GEMINI_AI_BASE : VERCEL_AI_BASE }

/**
 * Call the Gemini native REST API.
 * Uses x-goog-api-key header (not Authorization: Bearer) like the Gemini REST docs prescribe.
 */
function geminiRestFetch(path, body) {
  return fetch(`${GEMINI_REST_BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_API_KEY },
    body:    JSON.stringify(body),
  })
}

/**
 * Poll a Gemini long-running operation until it completes or times out.
 * @param {string} opName   — full operation name returned by the initial POST
 * @param {number} timeoutMs — max wait in ms (default 3 minutes)
 */
async function pollGeminiOperation(opName, timeoutMs = 180_000) {
  const start    = Date.now()
  const interval = 4_000   // poll every 4 seconds
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, interval))
    const resp = await fetch(
      `${GEMINI_REST_BASE}/${opName}`,
      { headers: { 'x-goog-api-key': AI_API_KEY } }
    )
    if (!resp.ok) throw new Error(`Operation poll failed: ${resp.status}`)
    const op = await resp.json()
    if (op.done) return op
  }
  throw new Error('Gemini operation timed out')
}
/**
 * Extract a human-readable error message from a non-2xx upstream response.
 * Gemini and Vercel both return { error: { message } } JSON, but rate-limit
 * responses from CDN layers can be plain text or HTML — so we read as text first
 * and fall back gracefully rather than calling .json() which throws on non-JSON.
 */
async function upstreamError(res, upstream, fallback) {
  const text = await upstream.text().catch(() => '')
  let msg = fallback || `Upstream error ${upstream.status}`
  try {
    const j = JSON.parse(text)
    // Gemini native: { error: { message } }  |  OpenAI-compat: { error: { message } }
    msg = j.error?.message || j.message || msg
  } catch {
    // Not JSON — show raw body if it's short plain text, otherwise use fallback
    if (text && text.length < 300 && !text.trimStart().startsWith('<')) msg = text.trim()
  }
  return res.status(upstream.status).json({ error: msg })
}

function insufficientCredits(res, cost, free) {
  return res.status(429).json({
    error: `Insufficient credits. This operation costs ${cost} credits but you only have ${free} remaining. Contact your administrator to top up.`,
  })
}

async function spendTokens(userId, tokens) {
  await pool.query(
    `UPDATE users
     SET ai_used_tokens = LEAST(
       ai_used_tokens + $1,
       GREATEST(COALESCE(NULLIF(ai_quota_tokens, 0), $2), 0)
     )
     WHERE id = $3`,
    [Math.max(0, Math.round(tokens)), DEFAULT_AI_QUOTA_TOKENS, userId]
  )
}

/**
 * Call Gemini native generateContent with responseMimeType=application/json.
 * The model is *forced* to emit valid JSON — no markdown fences, no truncated output.
 * @param {string}   systemPrompt
 * @param {Array}    messages     — OpenAI-style [{role:'user'|'assistant', content:'...'}]
 * @param {number}   maxTokens
 * @returns {Response}  raw fetch Response (caller checks .ok then awaits .json())
 */
function geminiGenerateJson(systemPrompt, messages, maxTokens = 32768) {
  // Gemini requires alternating user/model turns; map assistant→model
  const contents = messages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  return fetch(
    `${GEMINI_REST_BASE}/models/${AI_MODELS.text}:generateContent`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens:  maxTokens,
          temperature:      0.3,
        },
      }),
    }
  )
}

function extractJson(text) {
  // If the model wrapped the JSON in a fenced code block anywhere, pull out that content first
  let t = text
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) t = fenced[1].trim()
  // Walk brace depth to extract the outermost { ... } object
  const start = t.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++
    else if (t[i] === '}') { depth--; if (depth === 0) return t.slice(start, i + 1) }
  }
  return null
}

// ── GET /api/ai/quota ─────────────────────────────────────────────────────────
router.get('/quota', async (req, res) => {
  try {
    const q = await getAiQuota(req.user.id)
    res.json({ used: q.used, quota: q.quota, free: Math.max(0, q.quota - q.used), renewsAt: q.renewsAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/spend — deduct credits for locally-handled replies ───────────
// Called when the AI assistant answers from its local engine (greetings, time,
// date, etc.) without hitting an external model.  The cost mirrors a minimal
// text completion so the user's quota still tracks meaningful usage.
router.post('/spend', async (req, res) => {
  try {
    const inputChars  = Math.max(0, parseInt(req.body?.inputChars,  10) || 0)
    const outputChars = Math.max(0, parseInt(req.body?.outputChars, 10) || 0)
    const cost = calcTextCost(Math.ceil(inputChars / 4), Math.ceil(outputChars / 4))
    await spendTokens(req.user.id, cost)
    const q = await getAiQuota(req.user.id)
    res.json({ used: q.used, quota: q.quota, free: Math.max(0, q.quota - q.used) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/chat — streaming text/code (Server-Sent Events) ──────────────
router.post('/chat', async (req, res) => {
  try {
    const { messages = [], system } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'messages array required' })

    // Quota check before calling upstream
    const q = await getAiQuota(req.user.id)
    if (q.free <= 0)
      return res.status(429).json({ error: 'AI quota exhausted. Contact your administrator.' })

    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    // Build OS-aware system prompt enriched with user context
    const { rows: uRows } = await pool.query(
      'SELECT username, first_name FROM users WHERE id = $1', [req.user.id]
    )
    const u = uRows[0]
    const displayName = u?.first_name || u?.username || 'User'
    const osContext = `You are a helpful AI assistant built into ${BRANDING.name} v${BRANDING.version}, a browser-based desktop operating system. The current user is ${displayName}. The virtual file system has these top-level folders: Desktop, Documents, Pictures, Videos, Music, Projects. Use markdown formatting in responses. Be concise unless detail is requested.`
    const fullSystem = system ? `${osContext}\n\n${system}` : osContext

    if (isGemini()) {
      // ── Native Gemini streamGenerateContent (SSE) ─────────────────────────
      // The OpenAI compat layer is unreliable for gemini-2.5-flash (thinking
      // model) — use the same native REST path as image/video/music routes.
      const contents = messages.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: Array.isArray(m.content)
          ? m.content
              .filter(p => p.type === 'text' || p.type === 'image_url')
              .map(p => p.type === 'image_url'
                ? { inlineData: { mimeType: 'image/jpeg', data: p.image_url.url.replace(/^data:[^;]+;base64,/, '') } }
                : { text: p.text || '' })
          : [{ text: String(m.content || '') }],
      }))

      const upstream = await geminiRestFetch(
        `/models/${AI_MODELS.text}:streamGenerateContent?alt=sse`,
        {
          contents,
          systemInstruction: { parts: [{ text: fullSystem }] },
          generationConfig:  { maxOutputTokens: 4096 },
        }
      )

      if (!upstream.ok) return upstreamError(res, upstream, `Upstream error ${upstream.status}`)

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      let promptTokens = 0, completionTokens = 0
      const reader  = upstream.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''

      const flush = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop()
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (!data) continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.usageMetadata) {
                promptTokens     = parsed.usageMetadata.promptTokenCount     || promptTokens
                completionTokens = parsed.usageMetadata.candidatesTokenCount || completionTokens
              }
              // Filter out thinking tokens (thought:true), emit only real text
              const text = (parsed.candidates?.[0]?.content?.parts || [])
                .filter(p => !p.thought)
                .map(p => p.text || '')
                .join('')
              if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
            } catch { /* skip malformed lines */ }
          }
        }
        res.write('data: [DONE]\n\n')
        res.end()
        if (!promptTokens && !completionTokens) {
          promptTokens     = Math.ceil(messages.reduce((s, m) => s + String(m.content || '').length, 0) / 4)
          completionTokens = 500
        }
        await spendTokens(req.user.id, calcTextCost(promptTokens, completionTokens)).catch(() => {})
      }

      flush().catch(e => {
        if (!res.headersSent) res.status(500).json({ error: e.message || 'Stream error' })
        else res.end()
      })
      return
    }

    // ── Vercel / OpenAI-compat path ───────────────────────────────────────
    const apiMessages = [{ role: 'system', content: fullSystem }, ...messages]

    const upstream = await fetch(`${chatBase()}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({
        model: AI_MODELS.text,
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
      }),
    })

    if (!upstream.ok) return upstreamError(res, upstream, `Upstream error ${upstream.status}`)

    // Stream SSE back to the client
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let promptTokens = 0, completionTokens = 0
    const reader    = upstream.body.getReader()
    const decoder   = new TextDecoder()
    let   buf       = ''

    const flush = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() // keep the last (potentially incomplete) line
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue }
          try {
            const parsed = JSON.parse(data)
            // Capture prompt + completion tokens separately for accurate pricing
            if (parsed.usage?.prompt_tokens)     promptTokens     = parsed.usage.prompt_tokens
            if (parsed.usage?.completion_tokens) completionTokens = parsed.usage.completion_tokens
            res.write(`data: ${JSON.stringify(parsed)}\n\n`)
          } catch { /* skip malformed lines */ }
        }
      }
      res.end()
      // Fallback estimate if the model didn't return usage fields
      if (!promptTokens && !completionTokens) {
        const promptChars = apiMessages.reduce((s, m) => s + String(m.content || '').length, 0)
        promptTokens     = Math.ceil(promptChars / 4)
        completionTokens = 500 // conservative estimate
      }
      await spendTokens(req.user.id, calcTextCost(promptTokens, completionTokens)).catch(() => {})
    }

    flush().catch(e => {
      if (!res.headersSent) res.status(500).json({ error: e.message || 'Stream error' })
      else res.end()
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/image ────────────────────────────────────────────────────────
router.post('/image', async (req, res) => {
  try {
    const { prompt } = req.body || {}
    if (!prompt) return res.status(400).json({ error: 'prompt required' })

    const q = await getAiQuota(req.user.id)
    if (q.free < AI_PRICING.image.perImage)
      return insufficientCredits(res, AI_PRICING.image.perImage, q.free)
    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    let b64, revisedPrompt

    if (isGemini()) {
      // ── Imagen 3 native REST — POST /v1beta/models/<model>:predict ──────────
      const upstream = await geminiRestFetch(
        `/models/${AI_MODELS.image}:predict`,
        { instances: [{ prompt }], parameters: { sampleCount: 1 } }
      )
      if (!upstream.ok) return upstreamError(res, upstream, `Image generation failed (${upstream.status})`)
      const data = await upstream.json()
      b64 = data.predictions?.[0]?.bytesBase64Encoded
      if (!b64) return res.status(500).json({ error: 'No image returned from Gemini' })
    } else {
      // ── Vercel AI Gateway — OpenAI /images/generations ──────────────────────
      const upstream = await fetch(`${VERCEL_AI_BASE}/images/generations`, {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({
          model: AI_MODELS.image, prompt, n: 1,
          size: '1024x1024', quality: 'standard', response_format: 'b64_json',
        }),
      })
      if (!upstream.ok) return upstreamError(res, upstream, `Image generation failed (${upstream.status})`)
      const data = await upstream.json()
      b64 = data.data?.[0]?.b64_json
      revisedPrompt = data.data?.[0]?.revised_prompt
      if (!b64) return res.status(500).json({ error: 'No image returned from AI service' })
    }

    await spendTokens(req.user.id, AI_PRICING.image.perImage).catch(() => {})
    res.json({ dataUrl: `data:image/png;base64,${b64}`, revisedPrompt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/create-file — create a single file by name and save to FS ──
// Returns { fileName, folder, content } so the client can write it directly.
router.post('/create-file', async (req, res) => {
  try {
    const { request } = req.body || {}
    if (!request) return res.status(400).json({ error: 'request required' })

    const q = await getAiQuota(req.user.id)
    if (q.free <= 0)
      return res.status(429).json({ error: 'AI quota exhausted. Contact your administrator.' })
    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    const systemPrompt = [
      `You are a file-creation assistant inside ${BRANDING.name}.`,
      `Valid save folders: Desktop, Documents, Pictures, Videos, Music.`,
      ``,
      `INSTRUCTIONS:`,
      `- Output ONLY raw JSON. No prose, no markdown fences, no explanations.`,
      `- The JSON must match this exact shape:`,
      `{"fileName":"exact-filename-with-extension","folder":"Documents","content":"full file text content"}`,
      `- Choose the most appropriate folder for the file type.`,
      `- For .pdf, .doc, .txt, .md, .csv files use Documents.`,
      `- For .png, .jpg, .svg files use Pictures.`,
      `- For .mp3, .wav files use Music.`,
      `- For code/script files use Desktop.`,
      `- Write complete, realistic content for the file as requested.`,
      `- For PDF requests, produce readable plain text content (no binary encoding).`,
    ].join('\n')

    const upstream = await fetch(`${chatBase()}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({
        model: AI_MODELS.text,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: request },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    })

    if (!upstream.ok) return upstreamError(res, upstream, `File creation failed (${upstream.status})`)

    const data    = await upstream.json()
    const content = data.choices?.[0]?.message?.content || ''
    const ptok = data.usage?.prompt_tokens     || Math.ceil(request.length / 4)
    const ctok = data.usage?.completion_tokens || Math.ceil(content.length  / 4)
    await spendTokens(req.user.id, calcTextCost(ptok, ctok)).catch(() => {})

    const jsonStr = extractJson(content)
    if (!jsonStr) return res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' })

    let parsed
    try { parsed = JSON.parse(jsonStr) }
    catch { return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' }) }

    if (!parsed.fileName || !parsed.folder || parsed.content == null)
      return res.status(500).json({ error: 'AI response was missing required fields. Please try again.' })

    // Sanitize folder to only allowed values
    const allowed = ['Desktop', 'Documents', 'Pictures', 'Videos', 'Music']
    if (!allowed.includes(parsed.folder)) parsed.folder = 'Documents'

    res.json(parsed)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/agent-patch — patch/fix files in an existing project ─────────
// Returns { files: [...] } with only the files that need to be created/modified.
router.post('/agent-patch', async (req, res) => {
  try {
    const { request, existingPlan, history = [] } = req.body || {}
    if (!request) return res.status(400).json({ error: 'request required' })
    if (!existingPlan) return res.status(400).json({ error: 'existingPlan required' })

    const q = await getAiQuota(req.user.id)
    if (q.free < AI_PRICING.agent.planFlat)
      return insufficientCredits(res, AI_PRICING.agent.planFlat, q.free)
    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    const fileList = (existingPlan.files || []).map(f => `${f.folder ? f.folder + '/' : ''}${f.name}`).join('\n')

    const systemPrompt = [
      `You are a code editor for a project called "${existingPlan.projectName}".`,
      `Existing files:\n${fileList}`,
      ``,
      `INSTRUCTIONS:`,
      `- Output ONLY raw JSON. No prose, no markdown, no code fences, no explanations before or after.`,
      `- The JSON must match this exact shape:`,
      `{"files":[{"name":"filename.ext","folder":"optional/sub/path or empty string","content":"full file content here"}]}`,
      `- Include ONLY the files that need to be created or changed.`,
      `- Write complete, working code in every file.`,
      `- If no changes are needed, return {"files":[]}`,
    ].join('\n')

    // Build messages: system + recent conversation history for context + final user request
    const trimmedHistory = (Array.isArray(history) ? history : [])
      .filter(m => m.role && m.content)
      .slice(-6)
    const messages = [
      ...trimmedHistory,
      { role: 'user', content: request },
    ]

    let content, ptok, ctok

    if (isGemini()) {
      // Native Gemini: responseMimeType forces valid JSON, supports large outputs
      const upstream = await geminiGenerateJson(systemPrompt, messages)
      if (!upstream.ok) return upstreamError(res, upstream, `Patch planning failed (${upstream.status})`)
      const data = await upstream.json()
      content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      ptok    = data.usageMetadata?.promptTokenCount     || Math.ceil(request.length / 4)
      ctok    = data.usageMetadata?.candidatesTokenCount || Math.ceil(content.length  / 4)
    } else {
      const upstream = await fetch(`${chatBase()}/chat/completions`, {
        method: 'POST', headers: aiHeaders(),
        body: JSON.stringify({ model: AI_MODELS.text,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: 16384, temperature: 0.3 }),
      })
      if (!upstream.ok) return upstreamError(res, upstream, `Patch planning failed (${upstream.status})`)
      const data = await upstream.json()
      content = data.choices?.[0]?.message?.content || ''
      ptok    = data.usage?.prompt_tokens     || Math.ceil(request.length / 4)
      ctok    = data.usage?.completion_tokens || Math.ceil(content.length  / 4)
    }

    // agent-patch is priced per output token using its own rate from AI_PRICING
    await spendTokens(req.user.id, Math.ceil(ctok * AI_PRICING.agent.patchPerToken)).catch(() => {})

    let patch
    if (isGemini()) {
      if (!content) return res.status(500).json({ error: 'AI returned an empty response. Please try again.' })
      try { patch = JSON.parse(content) }
      catch { return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' }) }
    } else {
      const jsonStr = extractJson(content)
      if (!jsonStr) return res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' })
      try { patch = JSON.parse(jsonStr) }
      catch { return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' }) }
    }

    res.json(patch)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/agent-plan — plan a project file structure ──────────────────
// Returns a structured JSON the client can execute to create files in the FS.
router.post('/agent-plan', async (req, res) => {
  try {
    const { request } = req.body || {}
    if (!request) return res.status(400).json({ error: 'request required' })

    const q = await getAiQuota(req.user.id)
    if (q.free < AI_PRICING.agent.planFlat)
      return insufficientCredits(res, AI_PRICING.agent.planFlat, q.free)
    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    const systemPrompt = [
      `You are a project scaffolding assistant.`,
      ``,
      `INSTRUCTIONS:`,
      `- Output ONLY raw JSON. No prose, no markdown, no code fences, no explanations before or after.`,
      `- The JSON must match this exact shape:`,
      `{"projectName":"short-folder-safe-name","description":"one sentence","todos":["step 1","step 2"],"files":[{"name":"filename.ext","folder":"optional/sub/path or empty string","content":"full file content"}]}`,
      `- Include ALL files needed to run the project.`,
      `- Write complete, working code in every file.`,
    ].join('\n')

    let content, ptok, ctok

    if (isGemini()) {
      // Native Gemini: responseMimeType forces valid JSON, supports up to 65k output tokens
      const upstream = await geminiGenerateJson(systemPrompt, [{ role: 'user', content: request }])
      if (!upstream.ok) return upstreamError(res, upstream, `Planning failed (${upstream.status})`)
      const data = await upstream.json()
      content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      ptok    = data.usageMetadata?.promptTokenCount     || Math.ceil(request.length / 4)
      ctok    = data.usageMetadata?.candidatesTokenCount || Math.ceil(content.length  / 4)
    } else {
      const upstream = await fetch(`${chatBase()}/chat/completions`, {
        method: 'POST', headers: aiHeaders(),
        body: JSON.stringify({ model: AI_MODELS.text,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: request }],
          max_tokens: 16384, temperature: 0.3 }),
      })
      if (!upstream.ok) return upstreamError(res, upstream, `Planning failed (${upstream.status})`)
      const data = await upstream.json()
      content = data.choices?.[0]?.message?.content || ''
      ptok    = data.usage?.prompt_tokens     || Math.ceil(request.length / 4)
      ctok    = data.usage?.completion_tokens || Math.ceil(content.length  / 4)
    }

    // agent-plan is priced as a flat fee from AI_PRICING
    await spendTokens(req.user.id, AI_PRICING.agent.planFlat).catch(() => {})

    let plan
    if (isGemini()) {
      if (!content) return res.status(500).json({ error: 'AI returned an empty response. Please try again.' })
      try { plan = JSON.parse(content) }
      catch { return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' }) }
    } else {
      const jsonStr2 = extractJson(content)
      if (!jsonStr2) return res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' })
      try { plan = JSON.parse(jsonStr2) }
      catch { return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' }) }
    }

    res.json(plan)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/video — text-to-video generation ─────────────────────────────
// Vercel: uses the AI SDK's experimental_generateVideo.
// Gemini: Veo via native REST long-running operation (POST → poll → result).
// Veo 3.x returns a file URI reference; Veo 2 returned inline base64.
router.post('/video', async (req, res) => {
  try {
    const { prompt } = req.body || {}
    if (!prompt) return res.status(400).json({ error: 'prompt required' })

    const DURATION = 8   // fixed 8-second clips

    const q    = await getAiQuota(req.user.id)
    const cost = calcVideoCost(DURATION)
    if (q.free < cost)
      return insufficientCredits(res, cost, q.free)
    if (!activeKey())
      return res.status(503).json({ error: 'AI service not configured on this server.' })

    let videoB64

    if (isGemini()) {
      // ── Veo native REST — POST predictLongRunning, poll until done ───────────
      const startRes = await geminiRestFetch(
        `/models/${AI_MODELS.video}:predictLongRunning`,
        {
          instances:  [{ prompt }],
          parameters: { sampleCount: 1, durationSeconds: DURATION },
        }
      )
      if (!startRes.ok) return upstreamError(res, startRes, `Video job failed (${startRes.status})`)
      const startData = await startRes.json()
      const opName    = startData.name
      if (!opName) return res.status(500).json({ error: 'Gemini did not return an operation name' })

      const op = await pollGeminiOperation(opName, 300_000)   // 5-minute timeout

      // Veo 2: op.response.predictions[0].bytesBase64Encoded  (inline base64)
      // Veo 3: op.response.generated_videos[0].video.uri       (URI reference)
      // Also handle generateVideoResponse.generatedSamples (some SDK versions)
      const candidates =
        op.response?.predictions                              ||
        op.response?.generateVideoResponse?.generatedSamples ||
        op.response?.generated_videos                        ||
        []
      const first = candidates[0]

      videoB64 = first?.bytesBase64Encoded || first?.video?.bytesBase64Encoded

      if (!videoB64) {
        // Veo 3.x: video is a stored file — download raw bytes
        const videoUri = first?.video?.uri || first?.uri
        if (!videoUri) return res.status(500).json({ error: 'No video data returned from Gemini' })

        const dlUrl = videoUri.includes('?') ? `${videoUri}&alt=media` : `${videoUri}?alt=media`
        const dlRes = await fetch(dlUrl, { headers: { 'x-goog-api-key': AI_API_KEY } })
        if (!dlRes.ok) {
          const t = await dlRes.text().catch(() => '')
          return res.status(502).json({ error: `Video download failed (${dlRes.status})${t ? ': ' + t.slice(0, 200) : ''}` })
        }
        const buf = await dlRes.arrayBuffer()
        videoB64  = Buffer.from(buf).toString('base64')
      }
    } else {
      // ── Vercel AI SDK — experimental_generateVideo ──────────────────────────
      const result = await experimental_generateVideo({
        model: AI_MODELS.video,
        prompt,
        duration: DURATION,
      })
      videoB64 = result.videos?.[0]?.base64
      if (!videoB64) return res.status(500).json({ error: 'No video data returned from AI service.' })
    }

    await spendTokens(req.user.id, calcVideoCost(DURATION)).catch(() => {})
    res.json({ url: `data:video/mp4;base64,${videoB64}` })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/ai/music — music generation via Lyria 3 (Gemini only) ───────────
// Uses the standard generateContent endpoint with responseModalities: ['AUDIO', 'TEXT'].
// Returns { dataUrl: "data:audio/mpeg;base64,..." }
router.post('/music', async (req, res) => {
  if (!isGemini()) {
    return res.status(501).json({ error: 'Music generation requires AI_PROVIDER=gemini.' })
  }

  try {
    const { prompt } = req.body || {}
    if (!prompt) return res.status(400).json({ error: 'prompt required' })

    const q = await getAiQuota(req.user.id)
    if (q.free < AI_PRICING.music.perTrack)
      return insufficientCredits(res, AI_PRICING.music.perTrack, q.free)

    if (!AI_API_KEY)
      return res.status(503).json({ error: 'AI API key not configured.' })

    const upstream = await geminiRestFetch(
      `/models/${AI_MODELS.music}:generateContent`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
      }
    )

    if (!upstream.ok) return upstreamError(res, upstream, `Music generation failed (${upstream.status})`)

    const data  = await upstream.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    let b64 = null, mime = 'audio/mpeg'
    for (const part of parts) {
      if (part.inlineData?.data) { b64 = part.inlineData.data; mime = part.inlineData.mimeType || mime; break }
    }
    if (!b64) return res.status(500).json({ error: 'No audio returned from Lyria' })

    await spendTokens(req.user.id, AI_PRICING.music.perTrack).catch(() => {})
    res.json({ dataUrl: `data:${mime};base64,${b64}` })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
