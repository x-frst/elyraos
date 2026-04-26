'use strict'
/**
 * ElyraOS Admin Dashboard
 * Run with:  node server/dashboard.cjs
 * Called by start.sh and start.bat after npm install completes.
 */
const fs   = require('fs')
const path = require('path')

// ── Parse server/.env ─────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), 'server', '.env')
if (!fs.existsSync(envPath)) process.exit(0)

const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  // strip carriage return (Windows CRLF)
  const clean = line.replace(/\r$/, '')
  const m = clean.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/)
  if (m) env[m[1]] = m[2].trim()
})

const DB_URL = env.DATABASE_URL
if (!DB_URL) { console.log('  No DATABASE_URL found in server/.env'); process.exit(0) }

// ── Load pg from the project's node_modules ──────────────────────────────────
let Client
try {
  ;({ Client } = require(path.join(process.cwd(), 'node_modules', 'pg')))
} catch {
  console.log('  pg module not available — run npm install first.')
  process.exit(0)
}

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY
const R = isTTY ? '\x1b[0;31m' : ''
const G = isTTY ? '\x1b[0;32m' : ''
const Y = isTTY ? '\x1b[1;33m' : ''
const W = isTTY ? '\x1b[1m'    : ''
const N = isTTY ? '\x1b[0m'    : ''

// pad(str, width)           — right-pad or truncate a plain string to width
// cpad(coloredStr, raw, n)  — same width as pad(raw, n) but use coloredStr for display
function pad(s, n)             { return (String(s) + ' '.repeat(n)).slice(0, n) }
function cpad(colored, raw, n) { return colored + ' '.repeat(Math.max(0, n - String(raw).length)) }

// Column widths: username=22 role=9 status=10 storage=10 ai=22 lastActive=12
// Total content: 2 + 22 + 9 + 10 + 10 + 22 + 12 = 87 → separator = 85 dashes
const SEP_WIDE   = '  ' + '─'.repeat(85)
const SEP_NARROW = '  ' + '─'.repeat(50)

;(async () => {
  const client = new Client({ connectionString: DB_URL })
  try {
    await client.connect()
  } catch (e) {
    console.log(`  ${R}✖${N}  Cannot reach database: ${e.message}`)
    console.log(`  Check DATABASE_URL in server/.env and ensure PostgreSQL is running.`)
    process.exit(0)
  }

  try {
    const { rows: users } = await client.query(`
      SELECT username, is_admin, is_frozen, quota_bytes,
             ai_quota_tokens, ai_used_tokens, last_active_at, created_at
      FROM users ORDER BY created_at
    `)

    const cfgRow = await client.query(`SELECT value FROM app_config WHERE key = 'admin'`)
    const cfg    = cfgRow.rows[0]?.value ?? { allowSignup: true, allowGuest: true }

    console.log(`\n  ${W}Registered Users${N}  (${users.length} total)`)
    console.log(SEP_WIDE)
    console.log(
      `  ${W}` +
      pad('Username', 22) +
      pad('Role', 9) +
      pad('Status', 10) +
      pad('Storage', 10) +
      pad('AI Used / Quota', 22) +
      'Last Active' +
      N
    )
    console.log(SEP_WIDE)

    for (const u of users) {
      const roleRaw   = u.is_admin  ? 'admin'  : 'user'
      const statusRaw = u.is_frozen ? 'frozen' : 'active'
      const roleCol   = u.is_admin  ? `${Y}admin${N}`  : 'user'
      const statusCol = u.is_frozen ? `${R}frozen${N}` : `${G}active${N}`
      const storage   = (u.quota_bytes / 1_073_741_824).toFixed(1) + ' GB'
      const aiUsed    = ((u.ai_used_tokens  || 0) / 1000).toFixed(1) + 'k'
      const aiQuota   = ((u.ai_quota_tokens || 0) / 1000).toFixed(0) + 'k'
      const aiStr     = `${aiUsed} / ${aiQuota}`
      const lastAct   = u.last_active_at
        ? new Date(u.last_active_at).toLocaleDateString()
        : 'never'

      process.stdout.write(
        '  ' +
        `${G}${pad(u.username, 22)}${N}` +
        cpad(roleCol,   roleRaw,   9) +
        cpad(statusCol, statusRaw, 10) +
        pad(storage,  10) +
        pad(aiStr,    22) +
        lastAct + '\n'
      )
    }

    console.log(`\n${SEP_NARROW}`)
    console.log(`  ${W}System Config${N}`)
    console.log(`  Sign-up:      ${cfg.allowSignup ? G + 'enabled'  + N : R + 'disabled' + N}`)
    console.log(`  Guest access: ${cfg.allowGuest  ? G + 'enabled'  + N : R + 'disabled' + N}`)
    console.log('')

  } catch (e) {
    console.log(`  ${Y}Dashboard unavailable:${N} ${e.message}`)
  } finally {
    await client.end()
  }
})()
