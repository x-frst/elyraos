@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ──────────────────────────────────────────────────────────────────────────────
::  Elyra — Interactive Setup & Launch Script  (Windows)
::  Usage: Double-click start.bat  OR  run from Command Prompt / PowerShell
:: ──────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"

set "ENV_FILE=server\.env"
set "CONFIG_FILE=src\config.js"
set "VITE_CONFIG=vite.config.js"
set "HOST_FLAG=.elyra-host"
set "SETUP_FLAG=.elyra-ready"

:: Enable ANSI colour codes (Windows 10 1511+)
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "R=%ESC%[31m" & set "G=%ESC%[32m" & set "Y=%ESC%[33m"
set "B=%ESC%[34m" & set "C=%ESC%[36m" & set "W=%ESC%[1m"  & set "NC=%ESC%[0m"

call :banner
call :sep
call :step "Checking Requirements"
call :check_node || goto :exit_err
call :check_npm

:: ── First run or returning? ────────────────────────────────────────────────
if not exist "%SETUP_FLAG%" goto :first_run
if not exist "%ENV_FILE%"   goto :first_run
goto :returning_run

:: ────────────────────────────────────────────────────────────────────────────
:first_run
echo.
call :info "First-time setup — let's configure Elyra."
echo.
call :check_postgres
call :setup_branding
call :setup_env
call :sep
call :step "Installing Dependencies"
call :install_deps
call :create_database
echo 1 > "%SETUP_FLAG%"
call :sep
call :ok "Setup complete!"
echo.
pause
goto :launch

:: ────────────────────────────────────────────────────────────────────────────
:returning_run
call :install_deps
call :sep
call :step "Admin Dashboard"
call :show_dashboard
goto :launch

:: ────────────────────────────────────────────────────────────────────────────
:launch
call :sep
set "PORT="
for /f "tokens=2 delims==" %%v in ('findstr /b "PORT=" "%ENV_FILE%" 2^>nul') do set "PORT=%%v"
if "%PORT%"=="" set "PORT=3001"

set "HOST_MODE="
if exist "%HOST_FLAG%" (
  set /p HOST_MODE=<"%HOST_FLAG%"
)

if /i "%HOST_MODE%"=="true" (
  for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback'} | Select-Object -First 1).IPAddress" 2^>nul') do set "LAN_IP=%%i"
  if "!LAN_IP!"=="" set "LAN_IP=127.0.0.1"
  call :ok "Dev server  ->  http://!LAN_IP!:5173   (open in your browser)"
  call :ok "API server  ->  http://!LAN_IP!:%PORT%"
) else (
  call :ok "Dev server  ->  http://localhost:5173   (open in your browser)"
  call :ok "API server  ->  http://localhost:%PORT%"
)

echo.
call :info "Press Ctrl+C to stop."
echo.
call :sep
echo.
npm run dev:full
goto :eof

:: ============================================================================
::  FUNCTIONS
:: ============================================================================

:banner
cls
echo.
echo %C%  ^█^█^█^█^█^█^█^╗^█^█^╗     ^█^█^╗   ^█^█^╗^█^█^█^█^█^█^╗  ^█^█^█^█^█^╗ %NC%
echo %C%  ^^██╔════╝^^██║     ╚^^██╗ ^^██╔╝^^██╔══^^██╗^^██╔══^^██╗%NC%
echo %C%  ^█^█^█^█^█^╗  ^█^█^║      ╚^█^█^█^█^╔╝ ^█^█^█^█^█^█^╔╝^█^█^█^█^█^█^█^║%NC%
echo %C%  ^^██╔══╝  ^^██║       ╚^^██╔╝  ^^██╔══^^██╗^^██╔══^^██║%NC%
echo %C%  ^█^█^█^█^█^█^█^╗^█^█^█^█^█^█^█^╗   ^█^█^║   ^█^█^║  ^█^█^║^█^█^║  ^█^█^║%NC%
echo %C%  ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝%NC%
echo.
goto :eof

:ok   & echo   %G%^[OK^] %~1%NC% & goto :eof
:fail & echo   %R%^[ERR^] %~1%NC% & goto :eof
:warn & echo   %Y%^[WARN^] %~1%NC% & goto :eof
:info & echo   %B%^[  ^] %~1%NC% & goto :eof
:step & echo. & echo   %W%==  %~1  ==%NC% & echo. & goto :eof
:sep  & echo %C%----------------------------------------------------------------%NC% & goto :eof

:: ── check_node ───────────────────────────────────────────────────────────────
:check_node
where node >nul 2>&1
if errorlevel 1 (
  call :fail "Node.js is not installed."
  call :info "Download Node.js 18+ from: https://nodejs.org/en/download/"
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
set "NODE_VER=%NODE_VER:v=%"
for /f "tokens=1 delims=." %%m in ("%NODE_VER%") do set "NODE_MAJOR=%%m"
if %NODE_MAJOR% lss 18 (
  call :fail "Node.js v%NODE_VER% found — ElyraOS requires v18 or newer."
  call :info "Download from: https://nodejs.org/en/download/"
  exit /b 1
)
call :ok "Node.js v%NODE_VER%"
goto :eof

:: ── check_npm ────────────────────────────────────────────────────────────────
:check_npm
where npm >nul 2>&1
if errorlevel 1 ( call :warn "npm not found — reinstall Node.js." & goto :eof )
for /f "tokens=*" %%v in ('npm -v') do set "NPM_VER=%%v"
for /f "tokens=1 delims=." %%m in ("%NPM_VER%") do set "NPM_MAJOR=%%m"
if %NPM_MAJOR% lss 9 (
  call :warn "npm v%NPM_VER% — v9+ recommended. Run: npm install -g npm@latest"
) else (
  call :ok "npm v%NPM_VER%"
)
goto :eof

:: ── check_postgres ───────────────────────────────────────────────────────────
:check_postgres
where pg_isready >nul 2>&1
if not errorlevel 1 (
  pg_isready -q >nul 2>&1
  if not errorlevel 1 ( call :ok "PostgreSQL is running" & goto :eof )
)
call :warn "Cannot verify PostgreSQL status."
echo.
call :info "Make sure PostgreSQL 14+ is installed and running:"
echo     Windows: Open Services (Win+R - services.msc) and start postgresql-x64-XX
echo     Or in PowerShell (as Admin): Start-Service postgresql-x64-16
echo.
pause
goto :eof

:: ── install_deps ─────────────────────────────────────────────────────────────
:install_deps
if not exist "node_modules" (
  call :info "Running npm install..."
  npm install --loglevel=error
  call :ok "Dependencies installed"
) else (
  call :ok "node_modules present"
)
goto :eof

:: ── setup_branding ───────────────────────────────────────────────────────────
:setup_branding
if not exist "%CONFIG_FILE%" (
  call :warn "src\config.js not found — skipping branding setup."
  goto :eof
)
call :sep
call :step "Branding  (src\config.js)"
call :info "Press Enter to keep the current default for each field."
echo.

set "APP_NAME=ElyraOS"
set "APP_FULLNAME=Elyra Operating System"
set "APP_VERSION=1.0"
set "APP_EMOJI=^🌌"
set "STORAGE_PFX=elyra"

set /p "APP_NAME=  ? App name [ElyraOS]: "
if "!APP_NAME!"=="" set "APP_NAME=ElyraOS"

set /p "APP_FULLNAME=  ? Full name [Elyra Operating System]: "
if "!APP_FULLNAME!"=="" set "APP_FULLNAME=Elyra Operating System"

set "APP_PAGETITLE=!APP_NAME!"
set /p "APP_PAGETITLE=  ? Browser tab title [!APP_NAME!]: "
if "!APP_PAGETITLE!"=="" set "APP_PAGETITLE=!APP_NAME!"

set /p "APP_VERSION=  ? Version [1.0]: "
if "!APP_VERSION!"=="" set "APP_VERSION=1.0"

set /p "STORAGE_PFX=  ? Storage key prefix [elyra]: "
if "!STORAGE_PFX!"=="" set "STORAGE_PFX=elyra"

if not "!STORAGE_PFX!"=="elyra" (
  echo.
  call :warn "Changing STORAGE_PREFIX on an existing deployment will wipe user data."
)

:: Use PowerShell to do the multi-pattern replacement in config.js
powershell -NoProfile -Command ^
  "$c = Get-Content '%CONFIG_FILE%' -Raw;" ^
  "$c = $c -replace 'name: *""[^""]*""', 'name: ""!APP_NAME!""';" ^
  "$c = $c -replace 'fullName: *""[^""]*""', 'fullName: ""!APP_FULLNAME!""';" ^
  "$c = $c -replace 'pageTitle: *""[^""]*""', 'pageTitle: ""!APP_PAGETITLE!""';" ^
  "$c = $c -replace 'version: *""[^""]*""', 'version: ""!APP_VERSION!""';" ^
  "$c = $c -replace 'STORAGE_PREFIX = *""[^""]*""', 'STORAGE_PREFIX = ""!STORAGE_PFX!""';" ^
  "$c | Set-Content '%CONFIG_FILE%' -NoNewline"

call :ok "src\config.js updated"
goto :eof

:: ── setup_env ────────────────────────────────────────────────────────────────
:setup_env
call :sep
call :step "Server Configuration  (server\.env)"

:: Derive default DB name from app branding: lowercase, spaces→_, append _db
for /f "tokens=*" %%d in ('powershell -NoProfile -Command "('%APP_NAME%'.ToLower() -replace ' ','_') + '_db'"') do set "DB_DEFAULT=%%d"
if "!DB_DEFAULT!"=="" set "DB_DEFAULT=elyra_db"

call :info "Database connection URL format:"
echo     postgresql://USER:PASSWORD@HOST:PORT/DBNAME
echo     Windows:             postgresql://postgres:PASSWORD@localhost:5432/!DB_DEFAULT!
echo     macOS/Linux (no pw): postgresql://localhost/!DB_DEFAULT!
echo     Encode special chars: @ ^> %%40   # ^> %%23   %% ^> %%25
echo.

set "DB_URL=postgresql://localhost/!DB_DEFAULT!"
set /p "DB_URL=  ? DATABASE_URL [postgresql://localhost/!DB_DEFAULT!]: "
if "!DB_URL!"=="" set "DB_URL=postgresql://localhost/!DB_DEFAULT!"

:: Generate JWT secret via PowerShell
echo.
set "JWT_SECRET="
set "JWT_CHOICE=y"
set /p "JWT_CHOICE=  ? Auto-generate a secure JWT secret? [y]: "
if /i "!JWT_CHOICE!"=="y" (
  for /f "tokens=*" %%s in ('powershell -NoProfile -Command "[System.BitConverter]::ToString([Security.Cryptography.RandomNumberGenerator]::GetBytes(64)).Replace(\"-\",\"\").ToLower()"') do set "JWT_SECRET=%%s"
  call :ok "JWT secret generated"
) else (
  set /p "JWT_SECRET=  ? Enter JWT secret (min 32 chars): "
)

echo.
set "PORT=3001"
set /p "PORT=  ? Backend port [3001]: "
if "!PORT!"=="" set "PORT=3001"

set "NODE_ENV=development"
set "ENV_CHOICE=n"
set /p "ENV_CHOICE=  ? Production deployment? [n]: "
if /i "!ENV_CHOICE!"=="y" set "NODE_ENV=production"

:: ── Network / host mode ──────────────────────────────────────────────────────
echo.
call :sep
call :step "Network Access"
call :info "By default the dev server only accepts connections from this machine."
echo.

set "HOST_CHOICE=n"
set /p "HOST_CHOICE=  ? Enable LAN access (other devices on your network)? [n]: "
set "HOST_MODE=false"
set "FRONTEND_ORIGIN=http://localhost:5173"

if /i "!HOST_CHOICE!"=="y" (
  :: Detect LAN IP via PowerShell
  for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback'} | Select-Object -First 1).IPAddress" 2^>nul') do set "DETECTED_IP=%%i"
  if "!DETECTED_IP!"=="" set "DETECTED_IP=192.168.1.X"
  call :info "Detected LAN IP: !DETECTED_IP!"
  set "CONFIRMED_IP=!DETECTED_IP!"
  set /p "CONFIRMED_IP=  ? Confirm your LAN IP [!DETECTED_IP!]: "
  if "!CONFIRMED_IP!"=="" set "CONFIRMED_IP=!DETECTED_IP!"
  set "FRONTEND_ORIGIN=http://!CONFIRMED_IP!:5173"
  set "HOST_MODE=true"
  call :ok "LAN mode — FRONTEND_ORIGIN=!FRONTEND_ORIGIN!"

  :: Patch vite.config.js
  if exist "%VITE_CONFIG%" (
    findstr /c:"host: true" "%VITE_CONFIG%" >nul 2>&1
    if errorlevel 1 (
      powershell -NoProfile -Command ^
        "$c = Get-Content '%VITE_CONFIG%' -Raw;" ^
        "$c = $c -replace 'server: \{', 'server: {`n    host: true,';" ^
        "$c | Set-Content '%VITE_CONFIG%' -NoNewline"
      call :ok "vite.config.js: host: true added"
    ) else (
      call :ok "vite.config.js: host: true already set"
    )
  )
) else (
  call :ok "Local-only mode"
)

echo !HOST_MODE!> "%HOST_FLAG%"

:: ── AI provider ──────────────────────────────────────────────────────────────
echo.
call :sep
call :step "AI Provider  (optional)"
call :info "Supported: gemini, openai, anthropic, vercel"
call :info "Skip for now — edit server\.env to add AI support later."
echo.

set "AI_PROVIDER="
set "AI_KEY="
set "AI_QUOTA=1000000"
set "AI_CHOICE=n"
set /p "AI_CHOICE=  ? Configure AI provider now? [n]: "
if /i "!AI_CHOICE!"=="y" (
  set /p "AI_PROVIDER=  ? AI_PROVIDER [gemini]: "
  if "!AI_PROVIDER!"=="" set "AI_PROVIDER=gemini"
  set /p "AI_KEY=  ? AI_API_KEY: "
)
set /p "AI_QUOTA=  ? Default AI token quota per user [1000000]: "
if "!AI_QUOTA!"=="" set "AI_QUOTA=1000000"
:: ── SMTP / Email (optional) ──────────────────────────────────────────────────────────────
echo.
call :sep
call :step "Email / SMTP  (optional)"
call :info "Used for sign-up email verification and two-factor authentication."
call :info "Skip to disable email features (accounts created directly, no 2FA)."
echo.

set "SMTP_HOST="
set "SMTP_PORT="
set "SMTP_USER="
set "SMTP_PASS="
set "SMTP_FROM="
set "OTP_EXPIRY=10"
set "SMTP_CHOICE=n"
set /p "SMTP_CHOICE=  ? Configure SMTP now? [n]: "
if /i "!SMTP_CHOICE!"=="y" (
  set "SMTP_HOST=smtp.service.com"
  set /p "SMTP_HOST=  ? SMTP_HOST [smtp.service.com]: "
  if "!SMTP_HOST!"=="" set "SMTP_HOST=smtp.service.com"

  set "SMTP_PORT=465"
  set /p "SMTP_PORT=  ? SMTP_PORT [465]: "
  if "!SMTP_PORT!"=="" set "SMTP_PORT=465"

  set "SMTP_SECURE=true"
  set /p "SMTP_SECURE=  ? SMTP_SECURE true=SSL/465, false=STARTTLS/587 [true]: "
  if "!SMTP_SECURE!"=="" set "SMTP_SECURE=true"

  set /p "SMTP_USER=  ? SMTP_USER (full from-address): "
  set /p "SMTP_PASS=  ? SMTP_PASS: "
  set "SMTP_FROM=Elyra ^<!SMTP_USER!^>"
  set /p "SMTP_FROM=  ? SMTP_FROM [Elyra ^<!SMTP_USER!^>]: "
  if "!SMTP_FROM!"=="" set "SMTP_FROM=Elyra ^<!SMTP_USER!^>"

  set /p "OTP_EXPIRY=  ? OTP_EXPIRY_MINUTES [10]: "
  if "!OTP_EXPIRY!"=="" set "OTP_EXPIRY=10"
  call :ok "SMTP configured"
) else (
  call :ok "SMTP skipped — email features disabled"
)
:: ── Write server/.env using PowerShell (handles % in passwords correctly) ────
(
  echo DATABASE_URL=!DB_URL!
  echo JWT_SECRET=!JWT_SECRET!
  echo PORT=!PORT!
  echo NODE_ENV=!NODE_ENV!
  echo FRONTEND_ORIGIN=!FRONTEND_ORIGIN!
  if not "!AI_PROVIDER!"=="" (
    echo.
    echo # -- AI ---------------------------------------------------------------
    echo AI_PROVIDER=!AI_PROVIDER!
    echo AI_API_KEY=!AI_KEY!
  )
  echo.
  echo # -- Tunable defaults (uncomment to override) ---------------------------
  echo DEFAULT_AI_QUOTA_TOKENS=!AI_QUOTA!
  echo # TOKEN_EXPIRY=15m
  echo # REFRESH_TOKEN_EXPIRY=7d
  echo # MIN_PASSWORD_LENGTH=4
  echo # DEFAULT_QUOTA_BYTES=1073741824
  echo # JSON_BODY_LIMIT=20mb
  echo # APP_NAME=ElyraOS
  echo # APP_VERSION=1.0
  echo # DB_POOL_MAX=20
  if not "!SMTP_USER!"=="" (
    echo.
    echo # -- SMTP / Email ----------------------------------------------------
    echo SMTP_HOST=!SMTP_HOST!
    echo SMTP_PORT=!SMTP_PORT!
    echo SMTP_SECURE=!SMTP_SECURE!
    echo SMTP_USER=!SMTP_USER!
    echo SMTP_PASS="!SMTP_PASS!"
    echo SMTP_FROM=!SMTP_FROM!
    echo OTP_EXPIRY_MINUTES=!OTP_EXPIRY!
  )
) > "%ENV_FILE%"

call :ok "server\.env written"
goto :eof

:: ── create_database ─────────────────────────────────────────────────────
create_database is replaced by :create_database

:: ── show_db_guide (kept as label, immediately falls through) ───────────────
:show_db_guide
goto :eof

:create_database
set "DB_NAME=elyra_db"
:: Parse DATABASE_URL to extract DB name (last path segment after /)
for /f "tokens=1* delims==" %%a in ('findstr /b "DATABASE_URL=" "%ENV_FILE%" 2^>nul') do (
  set "_URL=%%b"
)
if defined _URL (
  :: strip scheme
  set "_URL=!_URL:postgresql://=!"
  set "_URL=!_URL:postgres://=!"
  :: extract everything after last /
  for %%s in (!_URL!) do (
    for /f "tokens=* delims=/" %%p in ("%%s") do set "DB_NAME=%%p"
  )
  :: strip query string
  for /f "tokens=1 delims=?" %%q in ("!DB_NAME!") do set "DB_NAME=%%q"
)

call :sep
call :step "Database Setup"
call :info "Creating database '!DB_NAME!' if it does not exist..."
echo.

set "DB_CREATED=0"

:: ── Attempt 1: createdb on PATH
where createdb >nul 2>&1
if not errorlevel 1 (
  createdb "%DB_NAME%" 2>nul
  if not errorlevel 1 (
    call :ok "Database '!DB_NAME!' created"
    set "DB_CREATED=1"
  ) else (
    createdb "%DB_NAME%" 2>&1 | findstr /i "already exists" >nul
    if not errorlevel 1 (
      call :ok "Database '!DB_NAME!' already exists -- skipping"
      set "DB_CREATED=1"
    )
  )
)

:: ── Attempt 2: psql on PATH
if "!DB_CREATED!"=="0" (
  where psql >nul 2>&1
  if not errorlevel 1 (
    psql -U postgres -d postgres -c "CREATE DATABASE \"%DB_NAME%\";" >nul 2>&1
    if not errorlevel 1 (
      call :ok "Database '!DB_NAME!' created via psql"
      set "DB_CREATED=1"
    ) else (
      psql -U postgres -d postgres -c "SELECT 1" -d "%DB_NAME%" >nul 2>&1
      if not errorlevel 1 (
        call :ok "Database '!DB_NAME!' already exists -- skipping"
        set "DB_CREATED=1"
      )
    )
  )
)

:: ── Attempt 3: psql in default PostgreSQL install paths
if "!DB_CREATED!"=="0" (
  for %%d in (
    "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
  ) do (
    if "!DB_CREATED!"=="0" if exist %%d (
      %%d -U postgres -d postgres -c "CREATE DATABASE \"%DB_NAME%\";" >nul 2>&1
      if not errorlevel 1 (
        call :ok "Database '!DB_NAME!' created"
        set "DB_CREATED=1"
      ) else (
        %%d -U postgres -d postgres -c "SELECT 1" -d "%DB_NAME%" >nul 2>&1
        if not errorlevel 1 (
          call :ok "Database '!DB_NAME!' already exists -- skipping"
          set "DB_CREATED=1"
        )
      )
    )
  )
)

:: ── Could not create automatically
if "!DB_CREATED!"=="0" (
  call :warn "Could not create the database automatically."
  echo.
  call :info "Please create it manually, then press any key to continue:"
  echo.
  echo     psql -U postgres -c "CREATE DATABASE !DB_NAME!;"
  echo     (use full path if psql is not on PATH)
  echo     e.g.: "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE !DB_NAME!;"
  echo.
  pause
)
goto :eof

:: ── show_dashboard ────────────────────────────────────────────────────────────
:show_dashboard
if not exist "%ENV_FILE%"            goto :eof
if not exist "node_modules"          goto :eof
if not exist "server\dashboard.cjs"  goto :eof
node server\dashboard.cjs 2>nul
goto :eof

:: ────────────────────────────────────────────────────────────────────────────
:exit_err
echo.
echo   Setup aborted due to an error.
pause
exit /b 1
