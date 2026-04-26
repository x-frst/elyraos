/**
 * Elyra — Server Configuration
 * ──────────────────────────────
 * All server-side defaults, database settings, and runtime config live here.
 * Branding (name, version, etc.) is sourced from src/config.js — import
 * BRANDING from '../src/config.js' in server files that need it.
 * Values can be overridden via environment variables in server/.env.
 *
 * This file loads dotenv itself so that any file that imports config.js
 * is guaranteed to have env vars populated, regardless of import order.
 */

import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import dotenv             from 'dotenv'

// Load server/.env relative to this file — works regardless of cwd
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

// ── HTTP server ───────────────────────────────────────────────────────────────
export const PORT = parseInt(process.env.PORT || "3001", 10)

/** Origins always allowed in development (Vite dev + preview) */
export const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
]

/** Primary allowed frontend origin. Override in production via FRONTEND_ORIGIN env var. */
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173"

/** Extra comma-separated origins (e.g. staging / CDN preview URLs) */
export const EXTRA_ORIGINS = (process.env.EXTRA_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean)

/** Maximum JSON request body size for general routes */
export const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "20mb"

// ── PostgreSQL / pg-pool ──────────────────────────────────────────────────────
export const DB = {
  connectionString:     process.env.DATABASE_URL || "postgresql://localhost/elyra_db",
  /** Maximum connections in pool */
  max:                  parseInt(process.env.DB_POOL_MAX   || "20", 10),
  /** Ms before idle connections are closed */
  idleTimeoutMillis:    parseInt(process.env.DB_IDLE_MS    || "30000", 10),
  /** Ms before a connection attempt times out */
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_MS || "5000", 10),
}

// ── Authentication ────────────────────────────────────────────────────────────
export const JWT_SECRET  = process.env.JWT_SECRET   || "elyra-dev-secret-CHANGE-IN-PRODUCTION"
/** Short-lived access token — 15 min. Stolen tokens are useless quickly. */
export const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || "15m"
/** Refresh token lives in an httpOnly cookie. Used to silently re-issue access tokens. */
export const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d"

/** Minimum password length enforced at registration */
export const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH || "4", 10)

// ── Per-user storage quota ────────────────────────────────────────────────────
/** Default storage quota in bytes assigned to new users (1 GB) */
export const DEFAULT_QUOTA_BYTES = parseInt(
  process.env.DEFAULT_QUOTA_BYTES || String(1_073_741_824), 10
)
/** Absolute minimum quota that can be set via admin API (1 MB) */
export const MIN_QUOTA_BYTES = 1_048_576  // 1 MB

// ── AI ────────────────────────────────────────────────────────────────────────

/**
 * AI provider selection.
 *
 * Supported values:
 *   "vercel"  — Vercel AI Gateway (OpenAI-compatible, default)
 *               Requires: AI_API_KEY (your Vercel AI Gateway key)
 *
 *   "gemini"  — Google Gemini APIs (native REST)
 *               Requires: AI_API_KEY (your Google Gemini API key)
 *               Text/code:  OpenAI-compat layer (same code, different base URL)
 *               Image:      Imagen 3 native REST (different request format)
 *               Video:      Veo 2 long-polling REST
 *               Music:      Lyria 3 (standard Gemini API, no extra credentials needed)
 *
 * Set AI_PROVIDER=gemini in server/.env to switch.
 */
export const AI_PROVIDER = (process.env.AI_PROVIDER || "vercel").toLowerCase()

/** AI API key — used for whichever provider is selected via AI_PROVIDER.
 * Set AI_API_KEY in server/.env.
 * For Vercel: your Vercel AI Gateway key.
 * For Gemini: your Google Gemini API key.
 */
export const AI_API_KEY   = process.env.AI_API_KEY || ""
/** AI base URL — OpenAI-compatible. Override via AI_BASE_URL env var. */
export const VERCEL_AI_BASE = process.env.AI_BASE_URL || "https://ai-gateway.vercel.sh/v1"
/** Gemini OpenAI-compat base (used for chat/code) */
export const GEMINI_AI_BASE  = "https://generativelanguage.googleapis.com/v1beta/openai"
/** Gemini native REST base (used for image, video, music) */
export const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta"

// The AI SDK (experimental_generateVideo) reads AI_GATEWAY_API_KEY by default.
// Alias our unified key so we don't need a second env variable.
if (process.env.AI_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
  process.env.AI_GATEWAY_API_KEY = process.env.AI_API_KEY
}

/**
 * Default per-user AI token quota.
 * 1 token ≈ 4 characters. 1,000,000 tokens ≈ ~750,000 words.
 * Override via DEFAULT_AI_QUOTA_TOKENS env var.
 */
export const DEFAULT_AI_QUOTA_TOKENS = parseInt(
  process.env.DEFAULT_AI_QUOTA_TOKENS || "3000", 10
)
/** Absolute minimum AI quota settable via admin (1 000 tokens) */
export const MIN_AI_QUOTA_TOKENS = 1_000

/**
 * Model IDs used for each generation type.
 * "auto" means the provider default is used. All can be overridden via env vars.
 *
 * Vercel defaults:
 *   text:  mistral/ministral-3b
 *   image: bfl/flux-pro-1.1
 *   video: bytedance/seedance-v1.0-pro-fast
 *   music: N/A
 *
 * Gemini defaults:
 *   text:  gemini-2.5-flash
 *   image: imagen-4.0-generate-001
 *   video: veo-3.1-lite-generate-preview
 *   music: lyria-3-clip-preview  (or lyria-3-pro-preview for full-length songs)
 */
export const AI_MODELS = {
  text:  process.env.AI_TEXT_MODEL  || (AI_PROVIDER === 'gemini' ? "gemini-2.5-flash"                   : "mistral/ministral-3b"),
  image: process.env.AI_IMAGE_MODEL || (AI_PROVIDER === 'gemini' ? "imagen-4.0-generate-001"             : "bfl/flux-pro-1.1"),
  video: process.env.AI_VIDEO_MODEL || (AI_PROVIDER === 'gemini' ? "veo-3.1-lite-generate-preview"       : "bytedance/seedance-v1.0-pro-fast"),
  music: process.env.AI_MUSIC_MODEL || (AI_PROVIDER === 'gemini' ? "lyria-3-clip-preview"                : ""),
}

// ── Custom Token Pricing ──────────────────────────────────────────────────────
/**
 * Our internal credit pricing — completely independent of what Vercel (or any
 * other provider) actually charges us.  These values control how many credits
 * are deducted from a user's AI quota balance per real operation.
 *
 * All values can be overridden in server/.env so you can adjust pricing
 * without touching code.
 *
 * Pricing units
 * ─────────────
 *  text.inputPerToken   — credits per *input*  token sent to the model
 *  text.outputPerToken  — credits per *output* token returned by the model
 *                         (output is typically 3-5× more expensive than input)
 *  image.perImage       — flat credits per image generated (any size)
 *  music.perTrack       — flat credits per music clip generated
 *  video.perSecond      — credits per second of video generated
 *  video.minCharge      — minimum credits charged per video job
 *  agent.planFlat       — flat fee charged when an agent-plan call is made
 *  agent.patchPerToken  — credits per output token from agent-patch
 *
 * Default values are intentionally higher than provider cost so the
 * platform retains margin.  Adjust freely for your pricing strategy.
 *
 * ── How to configure (server/.env) ────────────────────────────────────────
 *  AI_PRICE_TEXT_INPUT=0.010      # 0.010 credits per input token
 *  AI_PRICE_TEXT_OUTPUT=0.030     # 0.030 credits per output token
 *  AI_PRICE_IMAGE=500             # 500 credits flat per image
 *  AI_PRICE_MUSIC=1000            # 1000 credits flat per music clip
 *  AI_PRICE_VIDEO_SEC=2000        # 2000 credits per second of video
 *  AI_PRICE_VIDEO_MIN=5000        # 5000 credits minimum charge per video
 *  AI_PRICE_AGENT_PLAN=100        # 100 credits flat per agent plan call
 *  AI_PRICE_AGENT_PATCH=0.050     # 0.050 credits per agent patch output token
 *
 * ── Credit burn examples (with defaults) ──────────────────────────────────
 *
 *  Short chat message (100 input + 80 output tokens)
 *    = (100 × 0.010) + (80 × 0.030) = 1 + 2.4 = ~4 credits
 *
 *  Medium conversation (800 input + 400 output tokens)
 *    = (800 × 0.010) + (400 × 0.030) = 8 + 12 = 20 credits
 *
 *  Long GPT-style response (2000 input + 1500 output tokens)
 *    = (2000 × 0.010) + (1500 × 0.030) = 20 + 45 = 65 credits
 *
 *  Image generation (1 image)
 *    = 500 credits flat
 *
 *  Music generation (1 clip)
 *    = 1000 credits flat
 *
 *  Video generation — 5 seconds
 *    = max(5 × 2000, 5000) = max(10000, 5000) = 10000 credits
 *
 *  Video generation — 1 second (minimum kicks in)
 *    = max(1 × 2000, 5000) = max(2000, 5000) = 5000 credits
 *
 *  Agent plan call (flat fee)
 *    = 100 credits
 *
 *  Agent patch response (300 output tokens)
 *    = 300 × 0.050 = 15 credits
 *
 * ── User quota context ─────────────────────────────────────────────────────
 *  Default quota is DEFAULT_AI_QUOTA_TOKENS = 1,000,000 credits.
 *  Example sessions before quota runs out:
 *    ~250,000 short chat messages        (4 credits each)
 *    ~15,384  medium conversations       (65 credits each)
 *    ~2,000   image generations          (500 credits each)
 *    ~200     5-second video generations (10,000 credits each)
 */
export const AI_PRICING = {
  text: {
    /** Credits deducted per input token (prompt / context) */
    inputPerToken:  parseFloat(process.env.AI_PRICE_TEXT_INPUT   || "0.50"),
    /** Credits deducted per output token (completion) */
    outputPerToken: parseFloat(process.env.AI_PRICE_TEXT_OUTPUT  || "0.70"),
  },
  image: {
    /** Flat credits per image generated */
    perImage:       parseFloat(process.env.AI_PRICE_IMAGE         || "2000"),
  },
  music: {
    /** Flat credits per music clip generated */
    perTrack:       parseFloat(process.env.AI_PRICE_MUSIC         || "4000"),
  },
  video: {
    /** Credits per second of video generated */
    perSecond:      parseFloat(process.env.AI_PRICE_VIDEO_SEC     || "3000"),
    /** Minimum charge even if video is shorter than 1 s */
    minCharge:      parseFloat(process.env.AI_PRICE_VIDEO_MIN     || "3000"),
  },
  agent: {
    /** Flat fee charged when an agent-plan call is initiated */
    planFlat:       parseFloat(process.env.AI_PRICE_AGENT_PLAN    || "2000"),
    /** Credits per output token from the agent-patch response */
    patchPerToken:  parseFloat(process.env.AI_PRICE_AGENT_PATCH   || "0.90"),
  },
}

/**
 * Calculates the credit cost for a text generation call.
 * @param {number} inputTokens  – tokens in the prompt
 * @param {number} outputTokens – tokens in the completion
 * @returns {number} total credits to deduct (rounded up to nearest integer)
 */
export function calcTextCost(inputTokens, outputTokens) {
  const raw = (inputTokens  * AI_PRICING.text.inputPerToken) +
              (outputTokens * AI_PRICING.text.outputPerToken)
  return Math.ceil(raw)
}

/**
 * Calculates the credit cost for a video generation call.
 * @param {number} durationSeconds – length of the generated video
 * @returns {number} total credits to deduct (rounded up to nearest integer)
 */
export function calcVideoCost(durationSeconds) {
  const raw = Math.max(
    durationSeconds * AI_PRICING.video.perSecond,
    AI_PRICING.video.minCharge,
  )
  return Math.ceil(raw)
}

// ── Email / SMTP ──────────────────────────────────────────────────────────────
export const SMTP = {
  host:   process.env.SMTP_HOST   || 'smtp.service.com',
  port:   parseInt(process.env.SMTP_PORT || '465', 10),
  /** true = implicit TLS (port 465); false = STARTTLS (port 587) */
  secure: (process.env.SMTP_SECURE ?? 'true') !== 'false',
  user:   process.env.SMTP_USER   || '',
  pass:   process.env.SMTP_PASS   || '',
  /** "Display Name <address>" or plain address. Falls back to SMTP_USER. */
  from:   process.env.SMTP_FROM   || '',
}

/** How long a one-time code stays valid (minutes). Override via OTP_EXPIRY_MINUTES. */
export const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10)
