import pg from 'pg'
import { DB } from './config.js'

const { Pool } = pg

export const pool = new Pool(DB)

// Create schema on first run (idempotent — safe to re-run)
const client = await pool.connect()
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      quota_bytes   BIGINT NOT NULL DEFAULT 1073741824
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 1073741824;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_invalidated_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_quota_tokens BIGINT NOT NULL DEFAULT 1000000;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_used_tokens  BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_quota_renewed_at TIMESTAMPTZ;
    UPDATE users SET ai_quota_tokens = 1000000 WHERE ai_quota_tokens = 0;
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_data_uid ON user_data(user_id);
    CREATE TABLE IF NOT EXISTS app_config (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
    -- Refresh token family table.
    -- Each row is one active refresh token (stored as SHA-256 hash — never the raw value).
    -- family_id groups all tokens that descend from the same original login.
    -- If a token is presented after already being replaced (reuse detected),
    -- the entire family is deleted — logging out all devices for that user.
    CREATE TABLE IF NOT EXISTS refresh_sessions (
      id           TEXT PRIMARY KEY,       -- random session ID
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,   -- SHA-256(raw_token) — never store raw
      family_id    TEXT NOT NULL,          -- shared by all rotations of the same login
      expires_at   TIMESTAMPTZ NOT NULL,
      replaced     BOOLEAN NOT NULL DEFAULT FALSE,  -- true once this token has been rotated
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rs_user ON refresh_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_rs_family ON refresh_sessions(family_id);
    -- Single-use request pass per AI call. Each AI request atomically consumes
    -- the presented pass and the server returns a fresh one in the response header.
    -- A stolen JWT without the matching current pass is rejected outright.
    CREATE TABLE IF NOT EXISTS qp_pool (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      qp_val     TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_qp_user ON qp_pool(user_id);
    -- Dedicated table for AI chat histories (account-scoped, cross-platform).
    -- Stores full message content including base64 media so chats are
    -- fully portable across devices/browsers for the same account.
    CREATE TABLE IF NOT EXISTS ai_chats (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_id    TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT 'New Chat',
      mode       TEXT NOT NULL DEFAULT 'text',
      messages   JSONB NOT NULL DEFAULT '[]',
      agent_plan JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, chat_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_chats_user ON ai_chats(user_id, updated_at DESC);
    -- Email verification + 2FA columns
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    -- One-time codes for email verification, 2FA enable/disable, and 2FA login
    CREATE TABLE IF NOT EXISTS email_otps (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose    TEXT NOT NULL,        -- 'verify_email' | 'enable_2fa' | 'disable_2fa' | 'login_2fa'
      otp_hash   TEXT NOT NULL,        -- SHA-256(code) — never store the raw code
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_otps_user ON email_otps(user_id, purpose);
    -- Pending registrations: stores sign-up data until email OTP is verified.
    -- The user row is only inserted into "users" after successful verification.
    -- Rows expire automatically and are cleaned up by the verify/resend routes.
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id            TEXT PRIMARY KEY,          -- used as the pending session ID
      username      TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      first_name    TEXT,
      last_name     TEXT,
      email         TEXT,
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      otp_hash      TEXT NOT NULL,
      expires_at    TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pending_reg_username ON pending_registrations(username);
    CREATE INDEX IF NOT EXISTS idx_pending_reg_email    ON pending_registrations(email);
  `)
  console.log('  PostgreSQL   ->  connected, schema ready')
} catch (e) {
  console.error('  PostgreSQL   ->  FAILED:', e.message)
  console.error('  Ensure PostgreSQL is running and DATABASE_URL is set correctly.')
  process.exit(1)
} finally {
  client.release()
}

export default pool

