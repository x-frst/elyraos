/**
 * Elyra — Client Configuration
 * ─────────────────────────────
 * All branding, appearance, and client-side defaults live here.
 * Edit this file to rebrand or tune the experience without touching
 * individual components.
 */

// ── Branding ──────────────────────────────────────────────────────────────────
export const BRANDING = {
  /** Short name shown in the title bar, dock tooltips, and login screen */
  name: "Elyra",
  /** Full product name (used in About screens) */
  fullName: "Elyra Operating System",
  /** Shown in the browser tab <title> */
  pageTitle: "Elyra",
  /** Version string shown in Settings → About */
  version: "1.0",
  /** Website or repo URL (used in Settings → About) */
  website: "https://elyraos.com",
  /**
   * Path to your favicon inside public/.
   * Set to a file like "/favicon.ico" or "/logo.png" and Vite will serve it.
   * Currently no favicon file exists — add one to public/ and set this path.
   */
  faviconUrl: "/favicon.ico",
  /**
   * Path to a logo image shown on the login screen and About panel.
   * Leave empty to use the text-based logo fallback.
   */
  logoUrl: "/elyra_icon.png",
  /** Fallback emoji / text logo when no logoUrl is set */
  logoEmoji: "🌌",
  /** Transparent logo */
  transparentLogoUrl: "/elyra_icon_transparent.png",
  /** Support URL */
  supportUrl: "support@elyraos.com",
}

// ── Accent colours ────────────────────────────────────────────────────────────
// These populate the colour picker in Settings → Appearance.
// Each entry: { id, hex, label }
export const ACCENTS = [
  { id: "violet",  hex: "#7c3aed", label: "Violet" },
  { id: "blue",    hex: "#2563eb", label: "Blue" },
  { id: "cyan",    hex: "#0891b2", label: "Cyan" },
  { id: "emerald", hex: "#059669", label: "Emerald" },
  { id: "rose",    hex: "#e11d48", label: "Rose" },
  { id: "amber",   hex: "#d97706", label: "Amber" },
]

/** The accent id to use when no preference has been saved */
export const DEFAULT_ACCENT = "violet"

// ── Wallpapers ────────────────────────────────────────────────────────────────
// null  →  use the CSS .wallpaper class gradient (see index.css).
// string → CSS background shorthand (gradient or url(...)).
export const WALLPAPERS = [
  null,
  "linear-gradient(135deg,#f093fb 0%,#f5576c 50%,#fda085 100%)",
  "linear-gradient(135deg,#0575E6 0%,#021B79 100%)",
  "linear-gradient(135deg,#134E5E 0%,#71B280 100%)",
  "linear-gradient(135deg,#1a1a1a 0%,#fdcf58 60%,#ff416c 100%)",
  "linear-gradient(135deg,#0d0d1a 0%,#1a0533 50%,#0d0d1a 100%)",
  // ── Mesh gradient wallpapers (fluid organic blobs — macOS/Puter style) ──
  // Nova Wave — purple base, cream centre, orange top-right, teal bottom
  "radial-gradient(at 0% 25%, rgba(148,59,255,1) 0px, transparent 55%), radial-gradient(at 45% 55%, rgba(255,200,230,0.95) 0px, transparent 45%), radial-gradient(at 92% 5%, rgba(255,155,40,1) 0px, transparent 50%), radial-gradient(at 80% 90%, rgba(0,195,215,0.95) 0px, transparent 50%), radial-gradient(at 15% 85%, rgba(80,20,180,0.9) 0px, transparent 50%), #1e0060",
  // Silk Flame — warm red/orange left, cool blue/purple right, cream centre
  "radial-gradient(at 10% 45%, rgba(210,55,35,1) 0px, transparent 55%), radial-gradient(at 5% 75%, rgba(255,110,20,0.9) 0px, transparent 50%), radial-gradient(at 40% 25%, rgba(255,235,250,0.95) 0px, transparent 45%), radial-gradient(at 75% 45%, rgba(90,130,255,1) 0px, transparent 55%), radial-gradient(at 95% 65%, rgba(40,70,200,0.9) 0px, transparent 50%), radial-gradient(at 50% 85%, rgba(160,70,210,0.85) 0px, transparent 45%), #0d0840",
  // Violet Bloom — magenta, rose and deep indigo
  "radial-gradient(at 25% 20%, rgba(210,80,255,1) 0px, transparent 55%), radial-gradient(at 75% 35%, rgba(255,100,180,0.9) 0px, transparent 50%), radial-gradient(at 50% 75%, rgba(100,40,200,0.95) 0px, transparent 55%), radial-gradient(at 85% 80%, rgba(60,0,140,0.85) 0px, transparent 50%), radial-gradient(at 10% 80%, rgba(180,40,220,0.9) 0px, transparent 50%), #12003a",
  // Golden Hour — amber, tangerine, hot-pink, purple
  "radial-gradient(at 15% 25%, rgba(255,200,60,1) 0px, transparent 55%), radial-gradient(at 60% 15%, rgba(255,120,40,0.95) 0px, transparent 50%), radial-gradient(at 90% 50%, rgba(220,60,120,0.9) 0px, transparent 55%), radial-gradient(at 30% 80%, rgba(160,40,240,0.85) 0px, transparent 50%), radial-gradient(at 75% 85%, rgba(255,80,60,0.9) 0px, transparent 50%), #1a0010",
  // Ice & Fire — ember-orange left, arctic-cyan right
  "radial-gradient(at 10% 30%, rgba(255,80,20,1) 0px, transparent 55%), radial-gradient(at 40% 15%, rgba(255,180,60,0.9) 0px, transparent 50%), radial-gradient(at 70% 60%, rgba(0,180,255,0.95) 0px, transparent 55%), radial-gradient(at 90% 85%, rgba(0,220,240,0.9) 0px, transparent 50%), radial-gradient(at 20% 80%, rgba(140,40,200,0.85) 0px, transparent 50%), #060818",
  // Neon Tropics — electric teal, lime and hot-pink
  "radial-gradient(at 20% 30%, rgba(0,230,200,1) 0px, transparent 55%), radial-gradient(at 70% 20%, rgba(100,255,100,0.9) 0px, transparent 50%), radial-gradient(at 50% 70%, rgba(0,180,255,0.95) 0px, transparent 55%), radial-gradient(at 85% 80%, rgba(255,80,200,0.85) 0px, transparent 50%), radial-gradient(at 5% 75%, rgba(40,200,180,0.9) 0px, transparent 50%), #001420",
  // Cosmic Garden — lavender, soft violet, seafoam
  "radial-gradient(at 25% 40%, rgba(140,80,255,1) 0px, transparent 55%), radial-gradient(at 70% 20%, rgba(180,120,255,0.9) 0px, transparent 50%), radial-gradient(at 55% 75%, rgba(60,200,180,0.95) 0px, transparent 55%), radial-gradient(at 85% 70%, rgba(0,150,220,0.9) 0px, transparent 50%), radial-gradient(at 5% 80%, rgba(120,40,180,0.85) 0px, transparent 50%), #060020",
]
/** Labels shown in Settings → Appearance for each wallpaper slot */
export const WALLPAPER_LABELS = [
  `${BRANDING.name} Default`,
  "Sunset", "Ocean", "Forest", "Volcano", "Cosmos",
  "Nova Wave", "Silk Flame", "Violet Bloom", "Golden Hour", "Ice & Fire", "Neon Tropics", "Cosmic Garden",
]

// ── Default user-space layout ─────────────────────────────────────────────────
/** App IDs pinned to the dock on a fresh account */
export const DEFAULT_DOCK = [
  "launcher", "appcenter", "files", "notes", "ai", "terminal", "settings",
]
/** App IDs shown as desktop shortcuts on a fresh account */
export const DEFAULT_DESKTOP = ["files", "terminal", "trash"]

// ── User settings defaults ────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  wallpaperPreset: 0,
  accentColor: DEFAULT_ACCENT,
  customWallpaper: null,
}

// ── AI Assistant defaults ─────────────────────────────────────────────────────
// The AI API key is now server-side only — no client-side key needed.
// These defaults control UI hints only.

/** Default voice for text-to-speech */
// Future implementation TTS voices (not yet supported by the server)
// export const AI_TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
// export const AI_DEFAULT_VOICE = 'nova'
/** Max characters allowed for TTS input */
// export const AI_TTS_MAX_CHARS = 4096

/** Default image sizes offered in the image generation UI */
// DISABLED: Defaulted to single size
// export const AI_IMAGE_SIZES = ['1024x1024', '1792x1024', '1024x1792']

/** Max tokens sent per AI request */
export const AI_MAX_TOKENS = 4096

// ── Window defaults ───────────────────────────────────────────────────────────
/** Fallback size (px) when an app doesn't specify its own defaultSize */
export const DEFAULT_WINDOW_SIZE = { width: 900, height: 560 }

// ── LocalStorage / server data keys ──────────────────────────────────────────
// Prefixed with STORAGE_PREFIX so a rebrand only needs one change here.
export const STORAGE_PREFIX = "elyra"
export const STORAGE_KEYS = {
  fs:         `${STORAGE_PREFIX}-fs`,
  settings:   `${STORAGE_PREFIX}-settings`,
  wallpaper:  `${STORAGE_PREFIX}-wallpaper`,
  trash:      `${STORAGE_PREFIX}-trash`,
  dock:       `${STORAGE_PREFIX}-dock`,
  desktop:    `${STORAGE_PREFIX}-desktop`,
  widgets:    `${STORAGE_PREFIX}-widgets`,
  aiConfig:   `${STORAGE_PREFIX}-ai-config`,
  recentApps: `${STORAGE_PREFIX}-recentapps`,
  jwt:        `${STORAGE_PREFIX}-jwt`,
  session:    `${STORAGE_PREFIX}-session`,
}

// ── Drag-and-drop MIME type ───────────────────────────────────────────────────
/** dataTransfer type used for internal FS drag operations (desktop FS items) */
export const DND_FS_MIME    = `${STORAGE_PREFIX}/fsids`
/** dataTransfer type used for app-shortcut drags on the desktop */
export const DND_APP_MIME   = `${STORAGE_PREFIX}/appid`
/** dataTransfer type used for file/folder drags inside the Files app */
export const DND_FILES_MIME = `${STORAGE_PREFIX}/ids`

// ── Server / API ──────────────────────────────────────────────────────────────
/** Base path for all API calls (relative, proxied by Vite in dev) */
export const API_BASE = "/api"

// ── Storage quota fallback ────────────────────────────────────────────────────
/** Bytes used as the client-side quota fallback when the server is unreachable */
export const DEFAULT_QUOTA_BYTES = 1_073_741_824  // 1 GB

/** In-session storage cap for unauthenticated (guest) users */
export const GUEST_QUOTA_BYTES = 100 * 1024 * 1024  // 100 MB
