<p align="center">
  <img src="public/elyra_cover.png" alt="Elyra — Browser Desktop OS" width="100%"/>
</p>

<p align="center">
  <img src="public/elyra_icon.png" alt="Elyra" width="80"/>
</p>

<h1 align="center">ElyraOS</h1>

<p align="center">
  A browser-based desktop operating system built with React, Vite, Express, and PostgreSQL.<br/>
  Users get a full desktop environment — file manager, code editor, terminal, notepad, AI assistant,<br/>
  camera, video player, and more — all running in the browser, backed by a real database and per-user file storage.
</p>

<table width="100%">
  <tr>
    <td width="50%"><img src="public/screenshots/1.png" alt="Screenshot 1" width="100%" style="border-radius:8px"/></td>
    <td width="50%"><img src="public/screenshots/2.png" alt="Screenshot 2" width="100%" style="border-radius:8px"/></td>
  </tr>
  <tr>
    <td width="50%"><img src="public/screenshots/3.png" alt="Screenshot 3" width="100%" style="border-radius:8px"/></td>
    <td width="50%"><img src="public/screenshots/4.png" alt="Screenshot 4" width="100%" style="border-radius:8px"/></td>
  </tr>
</table>

---

## Quick Start

The fastest way to get Elyra running is the interactive setup script. It checks all requirements, walks you through configuration, and launches the server — all in one step.

**macOS / Linux:**
```bash
git clone https://github.com/x-frst/elyraos
cd elyraos
bash start.sh
```

**Windows:**
```powershell
git clone https://github.com/x-frst/elyraos
cd elyraos
start.bat
```

The script will:
- Verify Node.js ≥18 and npm ≥9 are installed (with download links if not)
- Guide you through branding, database, JWT secret, port, and AI provider setup
- Ask whether to enable LAN access for other devices on your network
- Automatically create the PostgreSQL database (tries `createdb`, then `psql`, then `sudo -u postgres` on Linux)
- Launch the dev server

**On subsequent runs**, just execute `start.sh` / `start.bat` again — it skips setup and shows a live **Admin Dashboard** (registered users, roles, storage, AI token usage) before launching.

> The manual setup instructions below (sections 1–12) are for advanced configuration, CI/CD pipelines, or if you prefer not to use the script.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Install](#2-clone-and-install)
3. [PostgreSQL Setup](#3-postgresql-setup)
4. [Environment Variables](#4-environment-variables)
5. [Client Configuration](#5-client-configuration)
6. [Run in Development](#6-run-in-development)
7. [Run in Production](#7-run-in-production)
8. [First-Time Login](#8-first-time-login)
9. [Project Structure](#9-project-structure)
10. [Adding Apps to the App Center](#10-adding-apps-to-the-app-center)
11. [Available Scripts](#11-available-scripts)
12. [Troubleshooting](#12-troubleshooting)

> **Jump to your OS:** [Windows](#windows-setup) · [macOS](#macos-setup) · [Linux](#linux-setup)

---

## 1. Prerequisites

Before you start, make sure the following are installed:

| Tool | Minimum Version | How to Check |
|------|----------------|--------------|
| [Node.js](https://nodejs.org/) | 18+ | `node -v` |
| [npm](https://www.npmjs.com/) | 9+ | `npm -v` |
| [PostgreSQL](https://www.postgresql.org/) | 14+ | see OS sections below |

---

## 2. Clone and Install

```bash
git clone https://github.com/x-frst/elyraos
cd elyraos
npm install
```

---

## 3. PostgreSQL Setup

Elyra needs a PostgreSQL database named `elyra_db`. The schema (tables, indexes) is created **automatically** when the server first starts — you only need to create the empty database.

---

### Windows Setup

#### Install PostgreSQL

1. Download the Windows installer from https://www.postgresql.org/download/windows/
2. Run the installer. When prompted, set a password for the `postgres` superuser — **remember this password**.
3. Leave the default port as **5432**.
4. After installation, add PostgreSQL to your PATH so you can use `psql` in any terminal.

**Add PostgreSQL to PATH (one-time, run PowerShell as Administrator):**

```powershell
[System.Environment]::SetEnvironmentVariable(
  "Path",
  $env:Path + ";C:\Program Files\PostgreSQL\18\bin",
  "Machine"
)
```

> Replace `18` with your installed version number. Restart your terminal after running this.

#### Create the Database (Windows)

Open PowerShell or Command Prompt:

```powershell
psql -U postgres -c "CREATE DATABASE elyra_db;"
```

If `psql` is still not recognized, use the full path:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE elyra_db;"
```

You will be prompted for the `postgres` password you set during installation.

#### Configure `server/.env` (Windows)

Create or edit `server/.env` (note: the file lives inside the `server/` folder, **not** the project root):

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/elyra_db
JWT_SECRET=replace_this_with_a_long_random_secret_string
PORT=3001
NODE_ENV=development
```

> **Important — special characters in passwords:** If your password contains `@`, `#`, `%`, `/`, `:`, `?`, `=`, `&`, or `+`, you must percent-encode them in the URL:
>
> | Character | Encoded form |
> |-----------|-------------|
> | `@` | `%40` |
> | `#` | `%23` |
> | `%` | `%25` |
> | `:` | `%3A` |
> | `/` | `%2F` |
> | `+` | `%2B` |
>
> Example — password `my@pass#1` becomes:
> ```
> DATABASE_URL=postgresql://postgres:my%40pass%231@localhost:5432/elyra_db
> ```

---

### macOS Setup

#### Install PostgreSQL

**Option A — Homebrew (recommended):**

```bash
brew install postgresql@16
brew services start postgresql@16
```

Add it to your PATH if needed (add to `~/.zshrc` or `~/.bash_profile`):

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

Then reload: `source ~/.zshrc`

**Option B — Installer:** Download from https://www.postgresql.org/download/macos/

#### Create the Database (macOS)

On macOS with Homebrew, PostgreSQL sets up a superuser matching your macOS username with no password:

```bash
createdb elyra_db
```

Or explicitly with the postgres user:

```bash
psql -U postgres -c "CREATE DATABASE elyra_db;"
```

#### Configure `server/.env` (macOS)

If you used Homebrew (peer auth, no password):

```env
DATABASE_URL=postgresql://localhost/elyra_db
JWT_SECRET=replace_this_with_a_long_random_secret_string
PORT=3001
NODE_ENV=development
```

If you installed with a password:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/elyra_db
JWT_SECRET=replace_this_with_a_long_random_secret_string
PORT=3001
NODE_ENV=development
```

> **Special characters in passwords:** Same encoding rules as Windows — see the table in the Windows section above.

---

### Linux Setup

#### Install PostgreSQL

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

**Fedora / RHEL / CentOS:**

```bash
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### Create the Database (Linux)

Switch to the `postgres` system user and create the database:

```bash
sudo -u postgres createdb elyra_db
```

If you need to set or know the postgres password:

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your_new_password';"
```

#### Configure `server/.env` (Linux)

Using peer authentication (no password, common on Linux):

```env
DATABASE_URL=postgresql://localhost/elyra_db
JWT_SECRET=replace_this_with_a_long_random_secret_string
PORT=3001
NODE_ENV=development
```

Using password authentication:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/elyra_db
JWT_SECRET=replace_this_with_a_long_random_secret_string
PORT=3001
NODE_ENV=development
```

> **Special characters in passwords:** Same encoding rules as Windows — see the table in the Windows section above.

---

## 4. Environment Variables

All environment variables belong in **`server/.env`** (inside the `server/` folder). Do **not** place `.env` in the project root — the server loads it from `server/` explicitly.

```env
# ── Required ───────────────────────────────────────────────────────────────────
# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/elyra_db

# Secret key for signing JWT tokens (use a long random string in production)
JWT_SECRET=replace_this_with_a_long_random_secret_string

# ── HTTP Server ────────────────────────────────────────────────────────────────
# Port the Express backend listens on (default: 3001)
PORT=3001

# Node environment
NODE_ENV=development

# ── Branding (server-side) ─────────────────────────────────────────────────────
# App name used in the server startup banner and logs (default: "Elyra")
# APP_NAME=Elyra

# App version string in the startup banner (default: "1.0")
# APP_VERSION=1.0

# ── CORS ───────────────────────────────────────────────────────────────────────
# Primary frontend origin allowed by CORS (default: http://localhost:5173)
# In production set this to your real domain:
# FRONTEND_ORIGIN=https://elyraos.com

# Extra comma-separated origins (e.g. staging, CDN preview):
# EXTRA_ORIGINS=https://staging.elyraos.com,https://preview.elyraos.com

# ── JSON Body Limit ────────────────────────────────────────────────────────────
# Maximum JSON body size for general API routes (default: "20mb").
# /api/fs/content is exempt — quota is enforced per user on disk instead.
# JSON_BODY_LIMIT=20mb

# ── PostgreSQL Connection Pool ─────────────────────────────────────────────────
# Maximum connections in the pool (default: 20)
# DB_POOL_MAX=20

# Milliseconds before idle connections are closed (default: 30000)
# DB_IDLE_MS=30000

# Milliseconds before a connection attempt times out (default: 5000)
# DB_CONN_MS=5000

# ── Authentication ─────────────────────────────────────────────────────────────
# Access token expiry — any value accepted by jsonwebtoken (default: "15m")
# TOKEN_EXPIRY=15m

# Refresh token (httpOnly cookie) expiry (default: "7d")
# REFRESH_TOKEN_EXPIRY=7d

# Minimum password length enforced at registration (default: 4)
# MIN_PASSWORD_LENGTH=4

# ── Storage Quota ──────────────────────────────────────────────────────────────
# Default per-user storage quota in bytes for new accounts (default: 1073741824 = 1 GB)
# Admins can override this per user via Settings → Admin.
# DEFAULT_QUOTA_BYTES=1073741824

# ── SMTP / Email (optional) ────────────────────────────────────────────────────
# When SMTP_USER and SMTP_PASS are set, Elyra sends email OTPs for:
#   • Sign-up email verification (user is not created in DB until OTP passes)
#   • Two-factor authentication (enable, disable, login)
# Leave all SMTP_ keys empty to disable email features entirely.
# In that case, registration creates accounts directly and 2FA cannot be enabled.
# OTPs are printed to the server console in development when SMTP is not set.
#
# SMTP_HOST=smtp.service.com
# SMTP_PORT=465
# SMTP_SECURE=true      # true for port 465 (SSL); false for port 587 (STARTTLS)
# SMTP_USER=support@example.com
# SMTP_PASS="your_password"   # quote if the password contains # or other shell chars
# SMTP_FROM=Elyra <support@example.com>
# OTP_EXPIRY_MINUTES=10
```

> **Security:** Never commit `server/.env` to version control. It is already listed in `.gitignore`.

**Generate a secure JWT secret (any OS):**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Changing Ports

The backend port and the Vite proxy target must always match each other.

**To change the backend port (default: 3001):**

1. Set `PORT` in `server/.env`:
   ```env
   PORT=3002
   ```
2. Update the proxy `target` in `vite.config.js` to match:
   ```js
   proxy: {
     '/api': {
       target: 'http://localhost:3002',  // ← must match PORT
       changeOrigin: true,
     },
   }
   ```

**To change the frontend dev server port (default: 5173):**

1. Add `server.port` in `vite.config.js`:
   ```js
   server: {
     port: 3000,  // ← your new frontend port
     proxy: {
       '/api': {
         target: 'http://localhost:3001',
         changeOrigin: true,
       },
     },
   }
   ```
2. Update `FRONTEND_ORIGIN` in `server/.env` so CORS still accepts the new origin:
   ```env
   FRONTEND_ORIGIN=http://localhost:3000
   ```

### Exposing to the Local Network (Host)

By default the Vite dev server only listens on `localhost` (127.0.0.1). To access the app from other devices on your LAN:

1. Set `server.host: true` in `vite.config.js`:
   ```js
   server: {
     host: true,   // binds to 0.0.0.0 — reachable on your local network
     port: 5173,
     proxy: {
       '/api': {
         target: 'http://localhost:3001',
         changeOrigin: true,
       },
     },
   }
   ```
2. Update `FRONTEND_ORIGIN` in `server/.env` to your machine's LAN IP:
   ```env
   FRONTEND_ORIGIN=http://192.168.1.10:5173
   ```

> The Express backend already binds on all interfaces by default, so it is reachable on your LAN IP at port 3001 without any extra changes.

---

## 5. Client Configuration

All client-side branding, appearance, and defaults are controlled from a single file: **`src/config.js`**. Edit it to rebrand or tune the experience without touching individual components.

### Branding

```js
// src/config.js
export const BRANDING = {
  name:       "Elyra",                        // shown in title bar, dock tooltips, login screen
  fullName:   "Elyra Operating System",        // shown in Settings → About
  pageTitle:  "Elyra",                         // browser tab <title>
  version:    "1.0",
  website:    "",                       // URL shown in Settings → About
  faviconUrl: "/favicon.ico",           // place the file in public/ first
  logoUrl:    "",                       // login-screen logo; empty = use logoEmoji fallback
  logoEmoji:  "🌌",                     // fallback text logo when logoUrl is not set
}
```

> **Server-side branding** (startup banner and logs) is set separately via `APP_NAME` and `APP_VERSION` in `server/.env` — see [Environment Variables](#4-environment-variables).

### Accent Colours

`ACCENTS` populates the colour picker in **Settings → Appearance**. `DEFAULT_ACCENT` is applied to new accounts.

```js
export const ACCENTS = [
  { id: "violet",  hex: "#7c3aed", label: "Violet" },
  { id: "blue",    hex: "#2563eb", label: "Blue" },
  { id: "cyan",    hex: "#0891b2", label: "Cyan" },
  { id: "emerald", hex: "#059669", label: "Emerald" },
  { id: "rose",    hex: "#e11d48", label: "Rose" },
  { id: "amber",   hex: "#d97706", label: "Amber" },
]

export const DEFAULT_ACCENT = "violet"
```

### Wallpapers

Each wallpaper slot is either `null` (uses the CSS `.wallpaper` gradient in `index.css`) or any valid CSS `background` shorthand — gradients or `url(...)` image references.

```js
export const WALLPAPERS = [
  null,                                                              // slot 0 — CSS default
  "linear-gradient(135deg,#f093fb 0%,#f5576c 50%,#fda085 100%)",   // Sunset
  "linear-gradient(135deg,#0575E6 0%,#021B79 100%)",                // Ocean
  // … add more slots; each needs a matching entry in WALLPAPER_LABELS
]

export const WALLPAPER_LABELS = ["Elyra Default", "Sunset", "Ocean", "Forest", "Volcano", "Cosmos"]
```

### Default Layout

Set which apps are pinned to the dock and shown as desktop shortcuts for **new accounts**. Use the app IDs defined in `public/apps/catalog.json` and built-in app IDs (`files`, `terminal`, `notes`, `ai`, `settings`, `trash`, etc.).

```js
export const DEFAULT_DOCK    = ["launcher", "appcenter", "files", "notes", "ai", "terminal", "settings"]
export const DEFAULT_DESKTOP = ["files", "terminal", "trash"]
```

### AI Assistant Defaults

These are the **pre-filled defaults** when a user first opens the AI Assistant. Users can override them at runtime from within the app itself.

```js
export const DEFAULT_AI_CONFIG = {
  endpoint: "https://api.openai.com/v1",  // any OpenAI-compatible API base URL
  model:    "gpt-4o-mini",
  key:      "",                           // leave blank — users enter their own key
}

export const AI_MAX_TOKENS = 1024         // max tokens included in every AI request
```

### Storage Key Prefix

Every `localStorage` key and every `user_data` key in the database is prefixed with `STORAGE_PREFIX`. Change this when rebranding to avoid collisions with existing data:

```js
export const STORAGE_PREFIX = "elyra"  // keys become: "elyra-fs", "elyra-settings", "elyra-jwt", …
```

> **Note:** Changing `STORAGE_PREFIX` on a live deployment causes existing users to start with a blank state — old keys are no longer read. Plan a data migration or coordinate a clean rollout.

---

## 6. Run in Development

```bash
npm run dev:full
```

This starts **both** the Express backend and the Vite frontend simultaneously:

| Service | URL |
|---------|-----|
| Frontend (Vite HMR) | http://localhost:5173 |
| Backend API (Express) | http://localhost:3001 |

Vite proxies all `/api/*` requests to the backend automatically, so you only open one URL in your browser.

To run each process separately:

```bash
# Terminal 1 — Backend (auto-restarts on file changes)
npm run server:dev

# Terminal 2 — Frontend (Vite HMR)
npm run dev
```

---

## 7. Run in Production

```bash
# 1. Build the React frontend
npm run build

# 2. Start the production server (serves built frontend + API on one port)
NODE_ENV=production npm run server
```

The Express server will serve the compiled `dist/` folder as static files and handle client-side routing. Open http://localhost:3001.

**Windows (PowerShell):**

```powershell
$env:NODE_ENV="production"; npm run server
```

---

## 8. First-Time Login

1. Open http://localhost:5173 (dev) or http://localhost:3001 (prod).
2. You will see the **Elyra login screen**.
3. Click **Sign Up** and create your first account.
   - If SMTP is configured and you provided an email, a 6-digit OTP will be sent to that address. Enter it to complete registration. The account is **not created in the database until the OTP is verified**.
   - Without SMTP (or without an email), the account is created immediately.
4. The **first account registered becomes an admin** automatically — you can manage users, quotas, and system config from Settings → Admin.
5. Use the **Guest** button to try the OS without creating an account (guest data is not persisted to the server).
6. Once logged in, you can enable **two-factor authentication** from **Settings → Account** (requires SMTP to be configured and an email address on your account).

---

## 9. Project Structure

```
elyraos/
├── server/                 # Express backend
│   ├── .env                # Your local environment variables (not committed)
│   ├── .env.example        # Template — copy this to .env and fill in values
│   ├── config.js           # Server-side config (ports, JWT, SMTP, quotas)
│   ├── dashboard.cjs       # Admin dashboard shown on repeat start.sh runs
│   ├── db.js               # PostgreSQL pool + schema creation on startup
│   ├── index.js            # Entry point — app wiring, CORS, route mounting
│   ├── mailer.js           # nodemailer wrapper — sendOtpEmail(), isSmtpConfigured()
│   ├── sseClients.js       # SSE client registry for server-push events
│   ├── storage/            # Per-user file content (created at runtime)
│   │   └── {userId}/       # One folder per user
│   │       └── {nodeId}    # One file per file node (raw text or base64)
│   └── routes/
│       ├── auth.js         # /api/auth — register (OTP flow), login, 2FA, refresh, logout, me
│       ├── twofa.js        # /api/twofa — 2FA status, send OTP, enable, disable
│       ├── data.js         # /api/data — per-user JSON key-value store
│       ├── fs.js           # /api/fs — file content, quota, streaming upload, raw serve
│       ├── admin.js        # /api/admin — user management, quotas, AI quotas, config
│       ├── ai.js           # /api/ai — chat, image, video, music, agent, quota
│       ├── chats.js        # /api/chats — AI chat history (account-scoped)
│       ├── session.js      # /api/session — SSE stream for server-push events
│       └── proxy.js        # /api/proxy — URL proxy for iframe apps
│
├── src/                    # React frontend (Vite)
│   ├── config.js           # Branding, accents, wallpapers, storage keys, AI defaults
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Root component, wallpaper, notification toast
│   ├── index.css           # Global styles + Tailwind base
│   ├── apps/               # Individual app components
│   │   ├── AIAssistant.jsx # Chat UI — text, image, video, music, agent modes
│   │   ├── AppCenter.jsx   # App catalog browser
│   │   ├── ArchiveManager.jsx # ZIP viewer/extractor
│   │   ├── Browser.jsx     # In-app browser (iframe + URL bar)
│   │   ├── Calculator.jsx  # Basic calculator
│   │   ├── Calendar.jsx    # Event calendar
│   │   ├── Camera.jsx      # Webcam photo/video capture
│   │   ├── CodeEditor.jsx  # Syntax-highlighted editor (Python via Pyodide)
│   │   ├── DocumentViewer.jsx # PDF / document viewer
│   │   ├── Files.jsx       # File manager
│   │   ├── IframeApp.jsx   # Wrapper for catalog iframe apps
│   │   ├── Music.jsx       # Music player
│   │   ├── Notepad.jsx     # Plain text editor
│   │   ├── Paint.jsx       # Canvas drawing app
│   │   ├── PhotoViewer.jsx # Image viewer with zoom, rotate, flip
│   │   ├── Recorder.jsx    # Audio recorder
│   │   ├── Settings.jsx    # System settings + admin panel
│   │   ├── Terminal.jsx    # In-browser terminal (simulated)
│   │   ├── Trash.jsx       # Trash bin
│   │   ├── VideoPlayer.jsx # Video playback (mp4, webm, ogg, mov)
│   │   ├── WelcomeApp.jsx  # First-run welcome screen
│   │   └── renderApp.jsx   # Maps appType → component
│   ├── components/         # Shell UI components
│   │   ├── Clock.jsx       # Clock component
│   │   ├── ContextMenu.jsx # Right-click context menu
│   │   ├── Desktop.jsx     # Desktop background + desktop icons
│   │   ├── Dock.jsx        # Bottom app dock
│   │   ├── LoginScreen.jsx # Auth UI (login, register, OTP verify, 2FA)
│   │   ├── QuickBar.jsx    # Top status bar
│   │   ├── StartMenu.jsx   # App launcher menu
│   │   ├── Widgets.jsx     # Desktop widgets (clock, weather, etc.)
│   │   ├── Window.jsx      # Draggable/resizable window frame
│   │   └── WindowManager.jsx  # Renders all open windows
│   ├── store/
│   │   ├── useAuthStore.js # Auth store (session, login, register, 2FA, admin)
│   │   ├── useMusicStore.js # Music player global state
│   │   └── useStore.js     # Main Zustand store (FS, windows, settings)
│   ├── hooks/
│   │   └── useFileUpload.js # Drag-and-drop / file picker upload hook
│   ├── workers/
│   │   └── pyodide.worker.js # Web Worker for in-browser Python execution
│   └── utils/
│       ├── db.js           # API client (dbGet/dbSet, fsRead/fsWrite, aiChat, 2FA, etc.)
│       ├── icons.jsx       # App icon components
│       ├── welcomeContent.js # HTML content for WelcomeApp
│       └── termsAndConditions.js # Terms sections for LoginScreen
│
├── public/
│   ├── apps/catalog.json   # App Center catalog (public, no auth)
│   ├── elyra_cover.png     # Hero image (used in README)
│   ├── elyra_icon.png      # App icon
│   ├── elyra_icon_transparent.png # Transparent logo (used in emails)
│   ├── favicon.ico
│   └── screenshots/        # README screenshots
│       ├── 1.png
│       ├── 2.png
│       ├── 3.png
│       └── 4.png
├── index.html              # Vite HTML entry point
├── package.json            # Single package.json for both frontend + backend
├── vite.config.js          # Vite config + /api proxy to :3001
├── tailwind.config.js
├── postcss.config.js
├── start.sh                # Interactive setup & launch script (macOS / Linux)
└── start.bat               # Interactive setup & launch script (Windows)
```

---

## 10. Adding Apps to the App Center

Edit `public/apps/catalog.json` and add an entry:

```json
{
  "name": "My App",
  "description": "Short description shown in App Center",
  "url": "https://example.com",
  "allowIframe": true,
  "tags": ["productivity", "web"]
}
```

- `allowIframe: true` — opens inside an Elyra window via `<iframe>`.
- `allowIframe: false` — opens the URL in a new browser tab (for sites that block embedding).

---

## 11. Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:full` | **Start everything** — backend + frontend with hot reload |
| `npm run dev` | Frontend only (Vite HMR) |
| `npm run server` | Backend only (no file watching) |
| `npm run server:dev` | Backend with `--watch` (auto-restarts on changes) |
| `npm run build` | Build React frontend to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## 12. Troubleshooting

### "SASL: client password must be a string" (Windows)

The PostgreSQL connection string is not being loaded, or the password is missing/malformed.

1. Make sure your credentials are in `server/.env`, **not** the project root `.env`.
2. If your password contains special characters (e.g. `@`, `#`), percent-encode them — see the Windows Setup section above.
3. Always include host and port: `postgresql://postgres:PASSWORD@localhost:5432/elyra_db`

---

### "Cannot reach server. Is it running?"

The frontend cannot connect to the backend. Make sure both processes are running:

```bash
npm run dev:full
```

Check that nothing else is using port 3001.

---

### "PostgreSQL FAILED: connection refused"

PostgreSQL is installed but not running. Start it:

**Windows:**
```powershell
# Open Services (Win + R → services.msc) and start "postgresql-x64-18"
# Or via PowerShell (run as Administrator):
Start-Service postgresql-x64-18
```

**macOS (Homebrew):**
```bash
brew services start postgresql@16
```

**Linux:**
```bash
sudo systemctl start postgresql
```

---

### "database elyra_db does not exist"

Create it:

**Windows:**
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE elyra_db;"
```

**macOS / Linux:**
```bash
createdb elyra_db
# or:
psql -U postgres -c "CREATE DATABASE elyra_db;"
```

---

### `psql` is not recognized (Windows)

Add PostgreSQL's `bin` folder to your PATH (run PowerShell as Administrator):

```powershell
[System.Environment]::SetEnvironmentVariable(
  "Path",
  $env:Path + ";C:\Program Files\PostgreSQL\18\bin",
  "Machine"
)
```

Restart your terminal. Replace `18` with your installed version.

---

### "JWT_SECRET is not set"

Add `JWT_SECRET=...` to `server/.env` (see [Environment Variables](#4-environment-variables)).

---

### Files not saving after server restart

Make sure the `server/storage/` directory is writable. It is created automatically, but check permissions if running as a restricted user.

---

### Port already in use

Change the port in `server/.env` (`PORT=3002`) or free the port:

**Windows:**
```powershell
# Find the process using port 3001
netstat -ano | findstr :3001
# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F
```

**macOS / Linux:**
```bash
lsof -ti:3001 | xargs kill
```
