import { useState } from 'react'
import {
  FolderOpen, FileText, Terminal as TerminalIcon, LayoutGrid,
  Sparkles, Trash2, Globe, Gamepad2, Image, Code2,
  MessageCircle, BookOpen, Camera, Mic, Star, Zap,
  Music, Video, Settings, Calendar, Mail, Map,
  ShoppingBag, Layers, PenTool, Database, Cloud,
  Monitor, Cpu, Lock, Search, BarChart2, Compass,
  Briefcase, GitBranch, Users, Radio, Palette, Wrench,
  FileCode, Tv, Trophy, LayoutTemplate, Braces,
  Headphones, Film, Package, Calculator, BookMarked, Store,
} from 'lucide-react'

export const APP_ICONS = {
  launcher:        LayoutGrid,
  files:           FolderOpen,
  notes:           FileText,
  terminal:        TerminalIcon,
  ai:              Sparkles,
  'app-center':    Store,
  appcenter:       Store,
  trash:           Trash2,
  settings:        Settings,
  codeeditor:      Code2,
  'code-editor':   Code2,
  camera:          Camera,
  recorder:        Mic,
  music:           Headphones,
  videoplayer:     Film,
  'video-player':  Film,
  photoviewer:     Image,
  'photo-viewer':  Image,
  archivemanager:  Layers,
  'archive-manager': Layers,
  browser:         Globe,
  calculator:      Calculator,
  paint:           Palette,
  docviewer:       BookMarked,
  'doc-viewer':    BookMarked,
  calendar:        Calendar,
}

// PRIMARY category → icon. The FIRST tag of each catalog app is used as its
// canonical category, so every app gets one consistent icon per category.
const CATEGORY_ICONS = {
  // Games
  game:         Gamepad2,
  // Productivity / office
  productivity: Briefcase,
  whiteboard:   PenTool,
  // Design / media
  design:       Palette,
  image:        Image,
  // Developer
  developer:    Code2,
  // Communication
  communication: MessageCircle,
  // Entertainment / media playback
  music:        Music,
  video:        Video,
  // Knowledge
  education:    BookOpen,
  // AI
  ai:           Sparkles,
  // Generic web
  browser:      Globe,
  web:          Globe,
  os:           Monitor,
  // Utilities
  utility:      Wrench,
  api:          Database,
}

// Returns a single deterministic icon for a catalog app based on its FIRST tag.
// Falls back to Globe if no match.
export function getCatalogIcon(app) {
  if (!app?.tags?.length) return Globe
  // Walk tags in order — return the icon for the first tag with a known mapping
  for (const tag of app.tags) {
    const icon = CATEGORY_ICONS[tag]
    if (icon) return icon
  }
  return Globe
}

// Icon tile with gradient bg + lucide icon
export function AppTile({ app, size = 48, className = '' }) {
  const Icon = APP_ICONS[app.type] || APP_ICONS[app.id] || Globe
  const gradient = app.gradient || 'from-indigo-500 to-violet-600'

  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.6} />
    </div>
  )
}

// Catalog app tile  — shows app.icon image if provided, otherwise Lucide icon + gradient
export function CatalogTile({ app, size = 48, className = '' }) {
  const [imgError, setImgError] = useState(false)
  const hue  = app.hue ?? 200
  const grad = `linear-gradient(135deg, hsl(${hue},70%,52%), hsl(${(hue + 30) % 360},75%,42%))`

  if (app.icon && !imgError) {
    return (
      <div
        className={`rounded-2xl flex-shrink-0 shadow-lg ${className}`}
        style={{
          width: size, height: size,
          background: grad,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          src={app.icon}
          alt={app.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  const Icon = getCatalogIcon(app)
  return (
    <div
      className={`flex items-center justify-center rounded-2xl text-white shadow-lg flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: grad }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.6} />
    </div>
  )
}
