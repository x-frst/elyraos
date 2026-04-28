import dotenv from "dotenv";
import path from "path";

// Load env FIRST (before anything uses process.env)
dotenv.config({
  path: process.env.DOTENV_PATH || path.resolve("server/.env")
});

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'

import { BRANDING } from '../src/config.js'
import { PORT, FRONTEND_ORIGIN, DEV_ORIGINS, EXTRA_ORIGINS, JSON_BODY_LIMIT } from './config.js'
import { authRouter }   from './routes/auth.js'
import { dataRouter }   from './routes/data.js'
import { adminRouter }  from './routes/admin.js'
import { fsRouter }     from './routes/fs.js'
import { proxyRouter }  from './routes/proxy.js'
import { sessionRouter } from './routes/session.js'
import { aiRouter }     from './routes/ai.js'
import { chatsRouter }  from './routes/chats.js'
import { twofaRouter }  from './routes/twofa.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allowed origins: DEV_ORIGINS (always) + FRONTEND_ORIGIN + any EXTRA_ORIGINS
const allowedOrigins = [
  ...DEV_ORIGINS,
  FRONTEND_ORIGIN,
  ...EXTRA_ORIGINS,
].filter((v, i, a) => a.indexOf(v) === i) // deduplicate
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps, same-origin in prod)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(cookieParser())

// File content route: no hard size limit — quota is enforced server-side per user.
app.use('/api/fs/content', express.json({ limit: Infinity }))
app.use(express.json({ limit: JSON_BODY_LIMIT }))

// ── API routes ────────────────────────────────────────────────────────────────
// Public (no-auth) catalog endpoint — always reads the live public catalog.
const _catalogPath = path.join(__dirname, '..', 'public', 'apps', 'catalog.json')
app.get('/api/catalog', (_req, res) => {
  try {
    let raw = readFileSync(_catalogPath, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    res.json(JSON.parse(raw))
  }
  catch (e) { console.error('[catalog]', e.message); res.status(500).json({ error: 'Catalog unavailable' }) }
})

app.use('/api/auth',    authRouter)
app.use('/api/data',    dataRouter)
app.use('/api/admin',   adminRouter)
app.use('/api/fs',      fsRouter)
app.use('/api/proxy',   proxyRouter)
app.use('/api/session', sessionRouter)
app.use('/api/ai',      aiRouter)
app.use('/api/chats',   chatsRouter)
app.use('/api/twofa',   twofaRouter)

// ── Serve built frontend in production ───────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist')
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

// ── Global error handler ──────────────────────────────────────────────────────
// Suppress noisy "request aborted" errors (client closed the connection before
// the body was fully received — harmless, typically caused by page navigation or
// a cancelled fetch during heavy operations like ZIP extraction).
app.use((err, req, res, next) => {
  if (err && (err.message === 'request aborted' || err.type === 'request.aborted' || err.status === 400 && err.message?.includes('aborted'))) {
    return res.status(499).end()  // 499 = Client Closed Request
  }
  console.error('[server error]', err.message || err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`===========================================`)
  console.log(`  ${BRANDING.name} v${BRANDING.version}  →  http://localhost:${PORT}`)
  console.log(`  Database       →  PostgreSQL (${process.env.DATABASE_URL || 'postgresql://localhost/elyra_db'})`)
  console.log(`===========================================`)
})
