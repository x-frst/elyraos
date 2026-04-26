#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  Elyra — Interactive Setup & Launch Script  (Linux / macOS)
#  Usage: bash start.sh
# ──────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="server/.env"
CONFIG_FILE="src/config.js"
VITE_CONFIG="vite.config.js"
HOST_FLAG=".elyra-host"
SETUP_FLAG=".elyra-ready"

# ── Colours (disabled when not writing to a terminal) ─────────────────────────
if [ -t 1 ]; then
  R=$'\033[0;31m' G=$'\033[0;32m' Y=$'\033[1;33m'
  B=$'\033[0;34m' C=$'\033[0;36m' W=$'\033[1m'    N=$'\033[0m'
else
  R='' G='' Y='' B='' C='' W='' N=''
fi

# ── UI helpers ────────────────────────────────────────────────────────────────
banner() {
  clear
  printf '%b' "$C"
  echo '  ███████╗██╗     ██╗   ██╗██████╗  █████╗ '
  echo '  ██╔════╝██║     ╚██╗ ██╔╝██╔══██╗██╔══██╗'
  echo '  █████╗  ██║      ╚████╔╝ ██████╔╝███████║'
  echo '  ██╔══╝  ██║       ╚██╔╝  ██╔══██╗██╔══██║'
  echo '  ███████╗███████╗   ██║   ██║  ██║██║  ██║'
  echo '  ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝'
  printf '%b\n' "$N"
}
ok()        { printf '%b  ✔  %s%b\n'    "$G" "$1" "$N"; }
fail()      { printf '%b  ✖  %s%b\n'    "$R" "$1" "$N"; }
warn()      { printf '%b  ⚠  %s%b\n'    "$Y" "$1" "$N"; }
info()      { printf '%b  →  %s%b\n'    "$B" "$1" "$N"; }
step()      { printf '\n%b  ══  %s  ══%b\n\n' "$W" "$1" "$N"; }
sep()       { printf '%b' "$C"; printf '─%.0s' $(seq 1 64); printf '%b\n' "$N"; }
press_any() { printf '%b  →  %s%b' "$Y" "${1:-Press Enter to continue...}" "$N"; read -r; }

ask() {
  # ask "message" "default" → prints entered value
  local msg="$1" def="$2" val
  printf '%b  ?  %s%b [%s]: ' "$W" "$msg" "$N" "$def" >&2
  read -r val
  printf '%s' "${val:-$def}"
}

ask_secret() {
  # ask_secret "message" → prints entered value (no echo)
  local msg="$1" val
  printf '%b  ?  %s%b: ' "$W" "$msg" "$N" >&2
  read -rs val; echo >&2
  printf '%s' "$val"
}

yesno() {
  # yesno "message" "y|n" → returns 0 (yes) or 1 (no)
  local msg="$1" def="${2:-y}" val
  printf '%b  ?  %s%b [%s]: ' "$W" "$msg" "$N" "$def" >&2
  read -r val
  val="${val:-$def}"
  [[ "$val" =~ ^[Yy] ]]
}

# ── Requirement checks ────────────────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then
    fail "Node.js is not installed."
    info "Download Node.js 18+ from: https://nodejs.org/en/download/"
    exit 1
  fi
  local ver major
  ver=$(node -v | tr -d 'v')
  major=$(echo "$ver" | cut -d. -f1)
  if [ "$major" -lt 18 ]; then
    fail "Node.js v${ver} found — ElyraOS requires v18 or newer."
    info "Download from: https://nodejs.org/en/download/"
    exit 1
  fi
  ok "Node.js v${ver}"
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    fail "npm not found (reinstall Node.js from nodejs.org)."
    exit 1
  fi
  local ver major
  ver=$(npm -v)
  major=$(echo "$ver" | cut -d. -f1)
  if [ "$major" -lt 9 ]; then
    warn "npm v${ver} — v9+ recommended. Upgrade: npm install -g npm@latest"
  else
    ok "npm v${ver}"
  fi
}

check_postgres() {
  if command -v pg_isready &>/dev/null && pg_isready -q 2>/dev/null; then
    ok "PostgreSQL is running"
    return 0
  fi
  warn "Cannot verify PostgreSQL status."
  echo ""
  info "Make sure PostgreSQL 14+ is installed and running:"
  printf '    macOS:   brew services start postgresql@16\n'
  printf '    Ubuntu:  sudo systemctl start postgresql\n'
  printf '    Fedora:  sudo systemctl start postgresql\n'
  echo ""
  press_any
}

install_deps() {
  if [ ! -d "node_modules" ]; then
    info "Running npm install..."
    npm install --loglevel=error
    ok "Dependencies installed"
  else
    ok "node_modules present"
  fi
}

# ── Utilities ─────────────────────────────────────────────────────────────────
gen_jwt_secret() {
  node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))"
}

get_lan_ip() {
  local ip=""
  # Linux (iproute2)
  if command -v ip &>/dev/null; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i=="src"){print $(i+1);exit}}}')
  fi
  # macOS
  if [ -z "$ip" ] && command -v ipconfig &>/dev/null; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  fi
  # fallback: ifconfig
  if [ -z "$ip" ] && command -v ifconfig &>/dev/null; then
    ip=$(ifconfig 2>/dev/null | awk '/inet /{gsub("addr:","",$2); if($2 !~ /^127\./){print $2; exit}}')
  fi
  printf '%s' "${ip:-127.0.0.1}"
}

read_env_val() {
  # read_env_val KEY → value (everything after first =)
  grep "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

esc_sed() {
  # Escape a string for use as a sed replacement value
  printf '%s' "$1" | sed 's/[&\\/]/\\&/g'
}

# ── Branding setup ────────────────────────────────────────────────────────────
setup_branding() {
  if [ ! -f "$CONFIG_FILE" ]; then
    warn "src/config.js not found — skipping branding setup."
    return
  fi
  sep
  step "Branding  (src/config.js)"
  info "Press Enter to keep the current default for each field."
  echo ""

  local name fullname pagetitle version emoji prefix
  name=$(ask       "App name"            "ElyraOS")
  _BRANDING_NAME="$name"   # expose to setup_env for DB name default
  fullname=$(ask   "Full name"           "Elyra Operating System")
  pagetitle=$(ask  "Browser tab title"   "$name")
  version=$(ask    "Version"             "1.0")
  emoji=$(ask      "Logo emoji"          "🌌")
  prefix=$(ask     "Storage key prefix"  "elyra")

  if [ "$prefix" != "elyra" ]; then
    echo ""
    warn "Changing STORAGE_PREFIX on an existing deployment will wipe user data."
  fi

  sed -i.bak \
    -e "s/name: *\"[^\"]*\"/name: \"$(esc_sed "$name")\"/" \
    -e "s/fullName: *\"[^\"]*\"/fullName: \"$(esc_sed "$fullname")\"/" \
    -e "s/pageTitle: *\"[^\"]*\"/pageTitle: \"$(esc_sed "$pagetitle")\"/" \
    -e "s/version: *\"[^\"]*\"/version: \"$(esc_sed "$version")\"/" \
    -e "s/logoEmoji: *\"[^\"]*\"/logoEmoji: \"$(esc_sed "$emoji")\"/" \
    -e "s/STORAGE_PREFIX = *\"[^\"]*\"/STORAGE_PREFIX = \"$(esc_sed "$prefix")\"/" \
    "$CONFIG_FILE"
  rm -f "${CONFIG_FILE}.bak"
  ok "src/config.js updated"
}

# ── .env setup ────────────────────────────────────────────────────────────────
setup_env() {
  sep
  step "Server Configuration  (server/.env)"

  # ── Database ──────────────────────────────────────────────────────────────
  info "Database connection URL format:"
  printf '    postgresql://USER:PASSWORD@HOST:PORT/DBNAME\n'
  printf '    macOS / Linux (no password):  postgresql://localhost/elyra_db\n'
  printf '    Windows:  postgresql://postgres:PASSWORD@localhost:5432/elyra_db\n'
  printf '    Encode special chars in passwords:  @ → %%40   # → %%23   %% → %%25\n'
  echo ""

  local db_url
  # Derive a sensible default DB name from the app name: lowercase, spaces→_, append _db
  local _db_default
  _db_default=$(printf '%s' "${_BRANDING_NAME:-elyraos}" \
    | tr '[:upper:]' '[:lower:]' \
    | tr ' ' '_' \
    | tr -cd 'a-z0-9_')
  _db_default="${_db_default:-elyra}_db"
  db_url=$(ask "DATABASE_URL" "postgresql://localhost/${_db_default}")

  # ── JWT secret ────────────────────────────────────────────────────────────
  echo ""
  local jwt_secret
  if yesno "Auto-generate a secure JWT secret (recommended)?" "y"; then
    jwt_secret=$(gen_jwt_secret)
    ok "JWT secret generated"
  else
    jwt_secret=$(ask_secret "Enter JWT secret (min 32 characters)")
  fi

  # ── Port ──────────────────────────────────────────────────────────────────
  echo ""
  local port
  port=$(ask "Backend port" "3001")

  # ── Environment ───────────────────────────────────────────────────────────
  local node_env="development"
  if yesno "Is this a production deployment?" "n"; then
    node_env="production"
  fi

  # ── Network / host mode ───────────────────────────────────────────────────
  echo ""
  sep
  step "Network Access"
  info "By default the dev server only accepts connections from this machine."
  echo ""

  local frontend_origin host_mode="false"
  if yesno "Enable LAN access (other devices on your network)?" "n"; then
    local detected_ip
    detected_ip=$(get_lan_ip)
    info "Detected LAN IP: ${detected_ip}"
    local confirmed_ip
    confirmed_ip=$(ask "Confirm your LAN IP" "$detected_ip")
    frontend_origin="http://${confirmed_ip}:5173"
    host_mode="true"
    ok "LAN mode — FRONTEND_ORIGIN=${frontend_origin}"
  else
    frontend_origin="http://localhost:5173"
    ok "Local-only mode"
  fi

  printf '%s' "$host_mode" > "$HOST_FLAG"

  # Patch vite.config.js for host mode
  if [ "$host_mode" = "true" ] && [ -f "$VITE_CONFIG" ]; then
    if ! grep -q "host: true" "$VITE_CONFIG"; then
      awk '/server: \{/{print; print "    host: true,"; next} {print}' \
        "$VITE_CONFIG" > "$VITE_CONFIG.tmp" && mv "$VITE_CONFIG.tmp" "$VITE_CONFIG"
      ok "vite.config.js: host: true added"
    else
      ok "vite.config.js: host: true already set"
    fi
  fi

  # ── AI provider ───────────────────────────────────────────────────────────
  echo ""
  sep
  step "AI Provider  (optional)"
  info "Supported providers: gemini, openai, anthropic, vercel"
  info "You can skip this and edit server/.env manually later."
  echo ""

  local ai_provider="" ai_key="" ai_quota
  if yesno "Configure AI provider now?" "n"; then
    ai_provider=$(ask "AI_PROVIDER" "gemini")
    printf '%b  ?  AI_API_KEY:%b ' "$W" "$N" >&2
    read -r ai_key
  fi
  ai_quota=$(ask "Default AI token quota per new user" "1000000")

  # ── SMTP / Email (optional) ───────────────────────────────────────────────
  echo ""
  sep
  step "Email / SMTP  (optional)"
  info "Used for sign-up email verification and two-factor authentication."
  info "Skip to disable email features (accounts created directly, no 2FA)."
  echo ""

  local smtp_host="" smtp_port="" smtp_secure="" smtp_user="" smtp_pass="" smtp_from="" otp_expiry=""
  if yesno "Configure SMTP now?" "n"; then
    smtp_host=$(ask "SMTP_HOST" "smtp.service.com")
    smtp_port=$(ask "SMTP_PORT" "465")
    smtp_secure=$(ask "SMTP_SECURE (true=SSL/465, false=STARTTLS/587)" "true")
    smtp_user=$(ask "SMTP_USER (your full from-address)" "")
    smtp_pass=$(ask_secret "SMTP_PASS")
    smtp_from=$(ask "SMTP_FROM (friendly name)" "${BRANDING_NAME:-Elyra} <${smtp_user}>")
    otp_expiry=$(ask "OTP_EXPIRY_MINUTES" "10")
    ok "SMTP configured"
  else
    ok "SMTP skipped — email features disabled"
  fi

  # ── Write server/.env ─────────────────────────────────────────────────────
  {
    printf 'DATABASE_URL=%s\n'    "$db_url"
    printf 'JWT_SECRET=%s\n'      "$jwt_secret"
    printf 'PORT=%s\n'            "$port"
    printf 'NODE_ENV=%s\n'        "$node_env"
    printf 'FRONTEND_ORIGIN=%s\n' "$frontend_origin"
    if [ -n "$ai_provider" ]; then
      printf '\n# ── AI ──────────────────────────────────────────────────────────\n'
      printf 'AI_PROVIDER=%s\n'   "$ai_provider"
      printf 'AI_API_KEY=%s\n'    "$ai_key"
    fi
    printf '\n# ── Tunable defaults (uncomment to override) ──────────────────────\n'
    printf 'DEFAULT_AI_QUOTA_TOKENS=%s\n' "$ai_quota"
    printf '# TOKEN_EXPIRY=15m\n'
    printf '# REFRESH_TOKEN_EXPIRY=7d\n'
    printf '# MIN_PASSWORD_LENGTH=4\n'
    printf '# DEFAULT_QUOTA_BYTES=1073741824\n'
    printf '# JSON_BODY_LIMIT=20mb\n'
    printf '# APP_NAME=ElyraOS\n'
    printf '# APP_VERSION=1.0\n'
    printf '# DB_POOL_MAX=20\n'
    if [ -n "$smtp_user" ]; then
      printf '\n# ── SMTP / Email ─────────────────────────────────────────────────────\n'
      printf 'SMTP_HOST=%s\n'    "$smtp_host"
      printf 'SMTP_PORT=%s\n'    "$smtp_port"
      printf 'SMTP_SECURE=%s\n'  "$smtp_secure"
      printf 'SMTP_USER=%s\n'    "$smtp_user"
      printf 'SMTP_PASS="%s"\n'  "$smtp_pass"
      printf 'SMTP_FROM=%s\n'    "$smtp_from"
      printf 'OTP_EXPIRY_MINUTES=%s\n' "$otp_expiry"
    fi
  } > "$ENV_FILE"
  ok "server/.env written"
}

# ── Database creation (automatic) ────────────────────────────────────────────
create_database() {
  local db_url db_name db_host db_port db_user db_pass
  db_url=$(read_env_val DATABASE_URL)

  # ── Parse the URL: postgresql://[user[:pass]@][host[:port]/]dbname ──────────
  # Strip the scheme
  local rest="${db_url#postgresql://}"
  rest="${rest#postgres://}"

  # Extract dbname (last path component, strip query string)
  db_name=$(printf '%s' "$rest" | sed 's|.*[/@]||' | sed 's/?.*$//')
  db_name="${db_name:-elyra_db}"

  # Extract user:pass@host:port prefix (everything before the last /)
  local authority
  if printf '%s' "$rest" | grep -q '/'; then
    authority=$(printf '%s' "$rest" | sed 's|/[^/]*$||')
  else
    authority=""
  fi

  # user:pass
  if printf '%s' "$authority" | grep -q '@'; then
    local userpass
    userpass=$(printf '%s' "$authority" | sed 's/@.*//')
    db_user=$(printf '%s' "$userpass" | cut -d: -f1)
    db_pass=$(printf '%s' "$userpass" | cut -d: -f2-)
    [ "$db_pass" = "$db_user" ] && db_pass=""   # no colon → no password
    authority=$(printf '%s' "$authority" | sed 's/.*@//')
  fi

  # host:port
  db_host=$(printf '%s' "$authority" | cut -d: -f1)
  db_port=$(printf '%s' "$authority" | cut -d: -f2-)
  [ "$db_port" = "$db_host" ] && db_port=""  # no colon → default port
  db_host="${db_host:-localhost}"
  db_port="${db_port:-5432}"

  sep
  step "Database Setup"
  info "Creating database '${db_name}' if it does not exist..."
  echo ""

  # ── Build psql / createdb argument arrays ────────────────────────────────
  local psql_args=()
  local createdb_args=()
  [ -n "$db_user" ]                   && psql_args+=(-U "$db_user")     && createdb_args+=(-U "$db_user")
  [ "$db_host" != "localhost" ] && \
  [ "$db_host" != "127.0.0.1" ]       && psql_args+=(-h "$db_host")     && createdb_args+=(-h "$db_host")
  [ "$db_port" != "5432" ] && [ -n "$db_port" ] \
                                      && psql_args+=(-p "$db_port")     && createdb_args+=(-p "$db_port")

  # Export password so psql/createdb picks it up non-interactively
  local old_pgpassword="$PGPASSWORD"
  [ -n "$db_pass" ] && export PGPASSWORD="$db_pass"

  local created=false

  # ── Attempt 1: createdb (simplest) ───────────────────────────────────────
  if command -v createdb &>/dev/null; then
    if createdb "${createdb_args[@]}" "$db_name" 2>/dev/null; then
      ok "Database '${db_name}' created"
      created=true
    else
      # Already exists → still fine
      if createdb "${createdb_args[@]}" "$db_name" 2>&1 | grep -q 'already exists'; then
        ok "Database '${db_name}' already exists — skipping"
        created=true
      fi
    fi
  fi

  # ── Attempt 2: psql -c "CREATE DATABASE ..." ─────────────────────────────
  if [ "$created" = false ] && command -v psql &>/dev/null; then
    local psql_out
    psql_out=$(psql "${psql_args[@]}" -d postgres \
      -c "CREATE DATABASE \"${db_name}\";" 2>&1 || true)
    if printf '%s' "$psql_out" | grep -q 'CREATE DATABASE'; then
      ok "Database '${db_name}' created"
      created=true
    elif printf '%s' "$psql_out" | grep -q 'already exists'; then
      ok "Database '${db_name}' already exists — skipping"
      created=true
    else
      warn "psql attempt failed: ${psql_out}"
    fi
  fi

  # Restore PGPASSWORD
  if [ -n "$db_pass" ]; then
    if [ -n "$old_pgpassword" ]; then export PGPASSWORD="$old_pgpassword"
    else unset PGPASSWORD; fi
  fi

  # ── Attempt 3: sudo -u postgres (Linux peer-auth fallback) ───────────────
  if [ "$created" = false ] && command -v psql &>/dev/null; then
    info "Trying with sudo -u postgres (Linux peer auth)..."
    local psql_out2
    psql_out2=$(sudo -u postgres psql -c "CREATE DATABASE \"${db_name}\";" 2>&1 || true)
    if printf '%s' "$psql_out2" | grep -q 'CREATE DATABASE'; then
      ok "Database '${db_name}' created via sudo -u postgres"
      created=true
    elif printf '%s' "$psql_out2" | grep -q 'already exists'; then
      ok "Database '${db_name}' already exists — skipping"
      created=true
    else
      warn "sudo attempt failed: ${psql_out2}"
    fi
  fi

  # ── Could not create automatically ───────────────────────────────────────
  if [ "$created" = false ]; then
    warn "Could not create the database automatically."
    echo ""
    info "Please create it manually and then press Enter to continue:"
    printf '    createdb %s\n' "$db_name"
    printf '    # or: psql -U postgres -c "CREATE DATABASE %s;"\n' "$db_name"
    if command -v psql &>/dev/null && [ "$(uname)" = "Linux" ]; then
      printf '    # or: sudo -u postgres createdb %s\n' "$db_name"
    fi
    echo ""
    press_any
  fi
}

# ── Admin dashboard ────────────────────────────────────────────────────────────
show_dashboard() {
  [ ! -f "$ENV_FILE" ] && return
  [ ! -d "node_modules" ] && return
  [ ! -f "server/dashboard.cjs" ] && return

  node server/dashboard.cjs 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  banner

  sep
  step "Checking Requirements"
  check_node
  check_npm

  # ── Decide: first run or returning ────────────────────────────────────────
  if [ ! -f "$SETUP_FLAG" ] || [ ! -f "$ENV_FILE" ]; then
    echo ""
    info "First-time setup — let's configure ElyraOS."
    echo ""

    check_postgres
    setup_branding
    setup_env

    sep
    step "Installing Dependencies"
    install_deps

    create_database

    touch "$SETUP_FLAG"
    sep
    ok "Setup complete!"
    echo ""
    press_any "Press Enter to launch ElyraOS..."
    echo ""

  else
    install_deps
    sep
    step "Admin Dashboard"
    show_dashboard
  fi

  # ── Launch ────────────────────────────────────────────────────────────────
  sep

  local port host_mode lan_ip
  port=$(read_env_val PORT); port="${port:-3001}"
  host_mode=$(cat "$HOST_FLAG" 2>/dev/null || echo "false")

  if [ "$host_mode" = "true" ]; then
    lan_ip=$(get_lan_ip)
    ok "Dev server  →  http://${lan_ip}:5173   (open in your browser)"
    ok "API server  →  http://${lan_ip}:${port}"
  else
    ok "Dev server  →  http://localhost:5173   (open in your browser)"
    ok "API server  →  http://localhost:${port}"
  fi

  echo ""
  info "Press Ctrl+C to stop."
  echo ""
  sep
  echo ""
  npm run dev:full
}

main
