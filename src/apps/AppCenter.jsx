import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Play, Download, Trash2, ArrowLeft,
  Gamepad2, Briefcase, Palette, Code2, Wrench, Tv, BookOpen,
  ExternalLink, X, Sparkles, Check, Globe, Pencil, Plus, ShieldCheck, ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'
import { CatalogTile } from '../utils/icons'

// ── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',          label: 'Discover',    icon: Sparkles  },
  { id: 'game',         label: 'Games',       icon: Gamepad2  },
  { id: 'productivity', label: 'Productivity', icon: Briefcase },
  { id: 'design',       label: 'Design',      icon: Palette   },
  { id: 'developer',    label: 'Developer',   icon: Code2     },
  { id: 'education',    label: 'Education',   icon: BookOpen  },
  { id: 'media',        label: 'Media',       icon: Tv     },
  { id: 'utility',      label: 'Utility',     icon: Wrench    },
  { id: 'installed',    label: 'My Apps',     icon: Download  },
]

// ── Inline markdown helpers (desc comes from our own catalog.json) ────────────
function sanitize(t) {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function inlineMd(raw) {
  return sanitize(raw)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2d9ff;font-weight:600">$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em style="color:rgba(255,255,255,0.8);font-style:italic">$1</em>')
    .replace(/`(.+?)`/g,       '<code style="background:rgba(0,0,0,0.4);padding:1px 5px;border-radius:4px;font-size:11px;font-family:monospace;color:#6ee7b7">$1</code>')
}

function DescMd({ text }) {
  if (!text) return <p className="text-white/40 text-[13px]">No description available.</p>
  const lines = text.split('\n')
  const out = []
  let i = 0, k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      out.push(
        <h4 key={k++} className="text-white/85 text-[12.5px] font-semibold mt-3 mb-1.5 tracking-tight">
          {line.slice(3)}
        </h4>
      )
    } else if (/^[*-] /.test(line)) {
      const bullets = []
      while (i < lines.length && /^[*-] /.test(lines[i])) { bullets.push(lines[i].slice(2)); i++ }
      out.push(
        <ul key={k++} className="flex flex-col gap-1 mb-2 mt-0.5">
          {bullets.map((b, j) => (
            <li key={j} className="flex gap-2 text-[12.5px] text-white/55 leading-snug">
              <span className="text-violet-400/70 flex-shrink-0 mt-[3px] text-[9px]">◆</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMd(b) }} />
            </li>
          ))}
        </ul>
      )
      continue
    } else if (line.trim()) {
      out.push(
        <p key={k++} className="text-white/55 text-[12.5px] leading-relaxed mb-2"
          dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
      )
    } else if (i > 0) {
      out.push(<div key={k++} className="h-1" />)
    }
    i++
  }
  return <div className="select-text">{out}</div>
}

// ── YouTube embed ─────────────────────────────────────────────────────────────
function YouTubeEmbed({ url }) {
  const vid = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([a-zA-Z0-9_-]{11})/)?.[1]
  if (!vid) return null
  return (
    <iframe
      className="w-full rounded-xl flex-shrink-0"
      style={{ height: 195, border: 'none', background: '#000', minWidth: 290 }}
      src={`https://www.youtube.com/embed/${vid}?modestbranding=1&rel=0`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="App preview"
    />
  )
}

// ── Media strip ───────────────────────────────────────────────────────────────
function MediaStrip({ media }) {
  if (!media?.length) return null
  const isYoutube = (s) => typeof s === 'string' && (s.includes('youtube') || s.includes('youtu.be'))
  const getUrl    = (item) => (typeof item === 'string' ? item : item?.url || '')
  const getCap    = (item) => (typeof item === 'object' ? item?.caption || '' : '')
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-thin">
      {media.map((item, i) => {
        const url = getUrl(item)
        const cap = getCap(item)
        return (
          <div key={i} className="flex-shrink-0">
            <div className="relative rounded-xl overflow-hidden" style={{ width: 300, height: 195 }}>
              {isYoutube(url)
                ? <YouTubeEmbed url={url} />
                : <img src={url} alt={cap} className="absolute inset-0 w-full h-full object-contain" style={{ background: 'rgba(0,0,0,0.6)' }} />
              }
            </div>
            {cap && <p className="text-white/25 text-[11px] mt-1 truncate" style={{ width: 300 }}>{cap}</p>}
          </div>
        )
      })}
    </div>
  )
}

const CAT_OPTIONS = [
  { value: 'game',         label: 'Games',        icon: Gamepad2  },
  { value: 'productivity', label: 'Productivity',  icon: Briefcase },
  { value: 'design',       label: 'Design',        icon: Palette   },
  { value: 'developer',    label: 'Developer',     icon: Code2     },
  { value: 'education',    label: 'Education',     icon: BookOpen  },
  { value: 'media',        label: 'Media',         icon: Tv       },
  { value: 'utility',      label: 'Utility',       icon: Wrench    },
]

// ── App Edit Modal (admin only) ───────────────────────────────────────────────
function AppEditModal({ initial, onSave, onClose, saving }) {
  const isEdit = !!initial
  const [form, setFormState] = useState(() => ({
    name:        initial?.title        || '',
    description: initial?.description  || '',
    url:         initial?.url          || '',
    allowIframe: initial?.allowIframe  ?? true,
    showCursor:  initial?.showCursor   ?? true,
    featured:    initial?.featured     ?? false,
    tags:        initial?.tags?.[0] || 'utility',
    icon_url:    initial?.icon_url     || '',
    cover_image: initial?.cover_image  || '',
    media:       (initial?.media || []).join('\n'),
  }))
  const [error, setError]           = useState('')
  const [showCatMenu, setShowCatMenu] = useState(false)
  const catMenuRef = useRef(null)

  // close category dropdown on outside click
  useEffect(() => {
    const h = e => { if (catMenuRef.current && !catMenuRef.current.contains(e.target)) setShowCatMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function setField(field, val) { setFormState(f => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim())  return setError('Name is required')
    if (!form.url.trim())   return setError('URL is required')
    setError('')
    try {
      const result = await onSave({
        name:        form.name.trim(),
        description: form.description,
        url:         form.url.trim(),
        allowIframe: form.allowIframe,
        showCursor:  form.showCursor,
        featured:    form.featured,
        tags:        [form.tags],
        icon_url:    form.icon_url.trim(),
        cover_image: form.cover_image.trim(),
        media:       form.media.split('\n').map(m => m.trim()).filter(Boolean),
      })
      if (result && !result.ok) setError(result.error || 'Save failed. Please try again.')
    } catch (err) {
      setError('An unexpected error occurred.')
    }
  }

  const inp = 'w-full px-3 py-2 rounded-xl text-white text-[12.5px] outline-none resize-none'
  const inpSt = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }
  const lbl = 'text-white/50 text-[10.5px] font-semibold uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col w-full sm:w-[480px] sm:mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ maxHeight: '92vh', background: 'rgba(18,14,32,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-violet-400" />
            <span className="text-white font-semibold text-[14px]">{isEdit ? 'Edit App' : 'Add New App'}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Form — wraps inputs + footer so type=submit works correctly */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Name *</label>
                  <input className={inp} style={inpSt} value={form.name} onChange={e => setField('name', e.target.value)} placeholder="App name" />
                </div>
                <div>
                  <label className={lbl}>URL *</label>
                  <input className={inp} style={inpSt} value={form.url} onChange={e => setField('url', e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className={lbl}>Description (supports **bold**, *italic*, `code`, ## heading, - bullet)</label>
                <textarea className={inp} style={{ ...inpSt, minHeight: 80 }} value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Describe the app…" />
              </div>
              <div>
                <label className={lbl}>Category</label>
                <div className="relative" ref={catMenuRef}>
                  {/* Trigger button */}
                  <button
                    type="button"
                    onClick={() => setShowCatMenu(v => !v)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors"
                    style={{ ...inpSt, color: 'rgba(255,255,255,0.85)' }}
                  >
                    {(() => { const opt = CAT_OPTIONS.find(o => o.value === form.tags); const Icon = opt?.icon; return Icon ? <Icon size={13} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} /> : null })()}
                    <span className="flex-1 text-[12.5px]">{CAT_OPTIONS.find(o => o.value === form.tags)?.label || 'Select…'}</span>
                    <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0, transform: showCatMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  {/* Dropdown panel */}
                  {showCatMenu && (
                    <div
                      className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-50"
                      style={{ background: 'rgba(18,14,32,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 28px rgba(0,0,0,0.7)' }}
                    >
                      {CAT_OPTIONS.map(opt => {
                        const Icon    = opt.icon
                        const active  = form.tags === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { setField('tags', opt.value); setShowCatMenu(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] text-left transition-colors"
                            style={{
                              color:      active ? '#c4b5fd' : 'rgba(255,255,255,0.65)',
                              background: active ? 'rgba(130,80,255,0.18)' : 'transparent',
                            }}
                          >
                            <Icon size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.5 }} />
                            {opt.label}
                            {active && <Check size={11} className="ml-auto text-violet-400" strokeWidth={2.5} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Icon URL</label>
                  <input className={inp} style={inpSt} value={form.icon_url} onChange={e => setField('icon_url', e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className={lbl}>Cover Image URL</label>
                  <input className={inp} style={inpSt} value={form.cover_image} onChange={e => setField('cover_image', e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className={lbl}>Media (one URL per line — images or YouTube links)</label>
                <textarea className={inp} style={{ ...inpSt, minHeight: 68 }} value={form.media} onChange={e => setField('media', e.target.value)} placeholder={'https://youtube.com/watch?v=...\nhttps://example.com/screenshot.jpg'} />
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <button type="button"
                    className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
                    style={{ width: 22, height: 22, background: form.allowIframe ? 'rgba(130,80,255,0.9)' : 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                    onClick={() => setField('allowIframe', !form.allowIframe)}>
                    {form.allowIframe && <Check size={11} className="text-white" strokeWidth={3} />}
                  </button>
                  <div>
                    <span className="text-white/80 text-[12.5px] font-medium">Allow Embed</span>
                    <span className="text-white/35 text-[11px] ml-2">Displays inside OS window (iframe)</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button"
                    className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
                    style={{ width: 22, height: 22, background: form.showCursor ? 'rgba(130,80,255,0.9)' : 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                    onClick={() => setField('showCursor', !form.showCursor)}>
                    {form.showCursor && <Check size={11} className="text-white" strokeWidth={3} />}
                  </button>
                  <div>
                    <span className="text-white/80 text-[12.5px] font-medium">Show System Cursor</span>
                    <span className="text-white/35 text-[11px] ml-2">Disable for games that capture the mouse</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button"
                    className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
                    style={{ width: 22, height: 22, background: form.featured ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                    onClick={() => setField('featured', !form.featured)}>
                    {form.featured && <Check size={11} className="text-white" strokeWidth={3} />}
                  </button>
                  <div>
                    <span className="text-white/80 text-[12.5px] font-medium">Featured</span>
                    <span className="text-white/35 text-[11px] ml-2">Show in the ✨ Featured row on Discover</span>
                  </div>
                </div>
              </div>
              {error && (
                <div className="text-red-400/90 text-[12px] px-3 py-2 rounded-xl" style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.18)' }}>
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Footer — inside form so Save is a real type=submit */}
          <div className="flex items-center gap-2.5 px-5 py-3.5 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-white/55 text-[12.5px] font-medium hover:text-white/80 transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-white text-[12.5px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.9),rgba(99,50,210,0.9))', boxShadow: '0 4px 20px rgba(130,80,255,0.4)' }}>
              {saving ? '…' : isEdit ? <><Pencil size={11} /> Save Changes</> : <><Plus size={11} /> Add App</>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── App Detail page ───────────────────────────────────────────────────────────
function AppDetail({ app, isInstalled, onInstall, onUninstall, onLaunch, onBack, editMode, onEdit }) {
  const hue      = app.hue ?? 240
  const gradBg   = `linear-gradient(135deg, hsl(${hue},60%,20%) 0%, hsl(${(hue + 55) % 360},55%,12%) 100%)`
  const hasCover = !!app.cover_image
  const hasIcon  = !!app.icon

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="flex flex-col h-full"
    >
      {/* Hero */}
      <div className="relative flex-shrink-0" style={{ height: 164, background: gradBg }}>
        {/* Cover image */}
        {hasCover && (
          <img src={app.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Watermark icon fallback */}
        {!hasCover && hasIcon && (
          <img src={app.icon} alt="" className="absolute opacity-10"
            style={{ width: 130, height: 130, objectFit: 'contain', right: -16, bottom: -10 }} />
        )}
        {/* gradient overlay */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(8,6,20,0.88) 100%)' }} />
        {/* halftone pattern */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />

        {/* Back */}
        <button onClick={onBack}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white/80 hover:text-white text-[12px] transition-all"
          style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <ArrowLeft size={12} /> Back
        </button>

        {/* Icon + title */}
        <div className="absolute bottom-4 left-5 right-5 z-10 flex items-end gap-3.5">
          <div className="flex-shrink-0"
            style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.22), 0 8px 32px rgba(0,0,0,0.6)', borderRadius: 16 }}>
            <CatalogTile app={app} size={62} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-[17px] font-bold leading-tight truncate">{app.title}</div>
            <div className="text-white/45 text-[11.5px] capitalize mt-0.5">
              {(app.tags || []).slice(0, 3).join(' · ')}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,8,22,0.98)' }}>
        <button onClick={() => onLaunch(app)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[13px] font-semibold transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg, rgba(130,80,255,0.9), rgba(99,50,210,0.9))', boxShadow: '0 4px 22px rgba(130,80,255,0.4)' }}>
          <Play size={12} fill="currentColor" /> Launch
        </button>
        {isInstalled ? (
          <button onClick={() => onUninstall(app.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-400 text-[13px] font-medium transition-all hover:bg-red-500/20"
            style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.18)' }}>
            <Trash2 size={12} /> Uninstall
          </button>
        ) : (
          <button onClick={() => onInstall(app.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/75 text-[13px] font-medium transition-all hover:text-white hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)' }}>
            <Download size={12} /> Install
          </button>
        )}
        {!app.allowIframe && (
          <a href={app.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-[11px] transition-colors">
            <ExternalLink size={11} /> Opens externally
          </a>
        )}
        {editMode && (
          <button onClick={() => onEdit(app)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-violet-300 text-[12px] font-medium transition-all hover:bg-violet-500/20"
            style={{ background: 'rgba(130,80,255,0.12)', border: '1px solid rgba(130,80,255,0.28)' }}>
            <Pencil size={11} /> Edit App
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-6">

        {/* Media */}
        {app.media?.length > 0 && (
          <div>
            <div className="text-white/35 text-[10px] font-semibold uppercase tracking-widest mb-3">Preview</div>
            <MediaStrip media={app.media} />
          </div>
        )}

        {/* Description */}
        <div>
          <div className="text-white/35 text-[10px] font-semibold uppercase tracking-widest mb-2.5">About</div>
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <DescMd text={app.description} />
          </div>
        </div>

        {/* Tags */}
        {(app.tags || []).length > 0 && (
          <div>
            <div className="text-white/35 text-[10px] font-semibold uppercase tracking-widest mb-2.5">Tags</div>
            <div className="flex flex-wrap gap-2">
              {app.tags.map(t => (
                <span key={t} className="px-3 py-1 rounded-full text-[11px] capitalize font-medium"
                  style={{ background: 'rgba(130,80,255,0.16)', color: '#c4b5fd', border: '1px solid rgba(130,80,255,0.22)' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Embed note */}
        {!app.allowIframe && (
          <div className="rounded-xl p-3.5 flex items-start gap-3"
            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}>
            <Globe size={13} className="text-amber-400/60 flex-shrink-0 mt-0.5" />
            <p className="text-amber-400/60 text-[12px] leading-relaxed">
              This app restricts embedding and will open in a separate browser window.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── App card ──────────────────────────────────────────────────────────────────
function AppCard({ app, onSelect, isInstalled, onInstall, onUninstall, editMode, onEdit, onDelete }) {
  const hue  = app.hue ?? 240
  const grad = `linear-gradient(145deg, hsl(${hue},65%,22%) 0%, hsl(${(hue + 48) % 360},58%,14%) 100%)`

  return (
    <motion.div
      className="flex flex-col rounded-2xl overflow-hidden cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', willChange: 'transform' }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(app)}
    >
      {/* Cover art */}
      <div className="relative flex-shrink-0 overflow-hidden" style={{ height: 88, background: grad }}>
        {app.cover_image
          ? <img src={app.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : app.icon
            ? <img src={app.icon} alt="" className="absolute right-3 bottom-2 opacity-20"
                style={{ width: 54, height: 54, objectFit: 'contain' }} />
            : null
        }
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.55) 100%)' }} />
        {/* mini icon */}
        <div className="absolute bottom-2 left-2.5"
          style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.2)', borderRadius: 16 }}>
          <CatalogTile app={app} size={34} />
        </div>
        {isInstalled && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(130,80,255,0.95)', boxShadow: '0 2px 8px rgba(130,80,255,0.6)' }}>
            <Check size={9} className="text-white" strokeWidth={3} />
          </div>
        )}
        {/* Edit mode overlay — pointer-events-none on container so card click still opens detail */}
        {editMode && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
            style={{ background: 'rgba(0,0,0,0.62)' }}>
            <button onClick={e => { e.stopPropagation(); onEdit(app) }}
              className="pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[11px] font-medium"
              style={{ background: 'rgba(130,80,255,0.88)' }}>
              <Pencil size={10} /> Edit
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(app) }}
              className="pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-300 text-[11px] font-medium"
              style={{ background: 'rgba(220,38,38,0.55)' }}>
              <Trash2 size={10} /> Delete
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 px-3 pt-2.5 pb-0">
        <div className="text-white text-[12.5px] font-semibold leading-tight truncate group-hover:text-violet-200 transition-colors">
          {app.title}
        </div>
        <div className="text-white/32 text-[10.5px] capitalize truncate mt-0.5">
          {(app.tags || []).slice(0, 2).join(' · ')}
        </div>
        <p className="text-white/42 text-[11px] leading-snug line-clamp-2 mt-1.5 flex-1">
          {(app.description || '').replace(/\*\*|##|\*|`/g, '').split('\n')[0]}
        </p>
      </div>

      {/* Action footer */}
      <div className="px-3 py-2.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {isInstalled ? (
          <button onClick={() => onUninstall(app.id)}
            className="w-full py-1.5 rounded-lg text-[11px] font-medium text-red-400/75 hover:text-red-400 transition-colors"
            style={{ background: 'rgba(255,80,80,0.07)', border: '1px solid rgba(255,80,80,0.14)' }}>
            Uninstall
          </button>
        ) : (
          <button onClick={() => onInstall(app.id)}
            className="w-full py-1.5 rounded-lg text-[11px] font-medium text-violet-300/80 hover:text-violet-200 transition-colors"
            style={{ background: 'rgba(130,80,255,0.14)', border: '1px solid rgba(130,80,255,0.22)' }}>
            + Install
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Featured hero card (for horizontal scroll rows) ───────────────────────────
function HeroCard({ app, onSelect, isInstalled, onInstall, onUninstall, onLaunch, editMode, onEdit, onDelete }) {
  const hue  = app.hue ?? 240
  const grad = `linear-gradient(135deg, hsl(${hue},68%,20%) 0%, hsl(${(hue + 60) % 360},58%,12%) 100%)`
  const hasCover = !!app.cover_image
  const hasIcon  = !!app.icon

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl cursor-pointer flex-shrink-0 flex flex-col justify-end transition-shadow group"
      style={{
        width: 260, height: 190,
        background: grad,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        willChange: 'transform',
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.975 }}
      onClick={() => onSelect(app)}
    >
      {hasCover && (
        <img src={app.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!hasCover && hasIcon && (
        <img src={app.icon} alt="" className="absolute opacity-15"
          style={{ width: 110, height: 110, objectFit: 'contain', right: -14, bottom: -14 }} />
      )}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.5) 0,rgba(255,255,255,.5) 1px,transparent 0,transparent 24px)',
      }} />
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.72) 100%)' }} />
      <div className="absolute top-3 right-3 z-10" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}>
        <CatalogTile app={app} size={44} />
      </div>
      {editMode && (
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
          style={{ background: 'rgba(0,0,0,0.62)' }}>
          <button onClick={e => { e.stopPropagation(); onEdit(app) }}
            className="pointer-events-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-[12px] font-semibold"
            style={{ background: 'rgba(130,80,255,0.88)' }}>
            <Pencil size={11} /> Edit
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(app) }}
            className="pointer-events-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-200 text-[12px] font-semibold"
            style={{ background: 'rgba(220,38,38,0.6)' }}>
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}
      <div className="relative z-10 px-4 pb-3.5">
        <div className="text-white font-bold text-[14.5px] leading-tight mb-0.5">{app.title}</div>
        <div className="text-white/45 text-[10.5px] capitalize mb-3">{(app.tags || []).slice(0, 2).join(' · ')}</div>
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); onLaunch(app) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11.5px] font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(130,80,255,0.88)', boxShadow: '0 2px 14px rgba(130,80,255,0.55)' }}>
            <Play size={9} fill="currentColor" /> Launch
          </button>
          {isInstalled ? (
            <button onClick={e => { e.stopPropagation(); onUninstall(app.id) }}
              className="flex items-center px-2.5 py-1.5 rounded-lg text-red-400/80 text-[11px] transition-all"
              style={{ background: 'rgba(255,80,80,0.16)' }}>
              <Trash2 size={11} />
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onInstall(app.id) }}
              className="flex items-center px-2.5 py-1.5 rounded-lg text-white/65 text-[11px] transition-all"
              style={{ background: 'rgba(255,255,255,0.13)' }}>
              <Download size={11} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Featured grid card (2-col grid, taller, highlighted) ─────────────────────
function FeaturedCard({ app, onSelect, isInstalled, onInstall, onUninstall, onLaunch, editMode, onEdit, onDelete }) {
  const hue      = app.hue ?? 240
  const grad     = `linear-gradient(135deg, hsl(${hue},72%,22%) 0%, hsl(${(hue + 65) % 360},62%,13%) 100%)`
  const hasCover = !!app.cover_image
  const hasIcon  = !!app.icon

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl cursor-pointer flex flex-col justify-end group"
      style={{
        height: 220,
        background: grad,
        border: '1px solid rgba(160,100,255,0.35)',
        boxShadow: '0 0 0 1px rgba(130,80,255,0.12), 0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(100,60,200,0.12)',
        willChange: 'transform',
      }}
      whileHover={{ y: -4, boxShadow: '0 0 0 1px rgba(160,100,255,0.45), 0 12px 40px rgba(0,0,0,0.6), 0 0 60px rgba(120,70,220,0.22)' }}
      whileTap={{ scale: 0.975 }}
      onClick={() => onSelect(app)}
    >
      {/* Cover image */}
      {hasCover && <img src={app.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {!hasCover && hasIcon && (
        <img src={app.icon} alt="" className="absolute opacity-15"
          style={{ width: 120, height: 120, objectFit: 'contain', right: -10, bottom: -10 }} />
      )}

      {/* Subtle shimmer pattern */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.6) 0,rgba(255,255,255,.6) 1px,transparent 0,transparent 20px)',
      }} />
      {/* Bottom gradient */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 25%, rgba(0,0,0,0.78) 100%)' }} />

      {/* FEATURED badge */}
      <div className="absolute top-2.5 left-3 z-10">
        <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(245,158,11,0.88)', color: '#fff', letterSpacing: '0.1em', boxShadow: '0 2px 8px rgba(245,158,11,0.4)' }}>
          ✦ Featured
        </span>
      </div>

      {/* Icon top-right */}
      <div className="absolute top-2 right-2.5 z-10" style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.7))' }}>
        <CatalogTile app={app} size={46} />
      </div>

      {/* Edit mode overlay */}
      {editMode && (
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
          style={{ background: 'rgba(0,0,0,0.62)' }}>
          <button onClick={e => { e.stopPropagation(); onEdit(app) }}
            className="pointer-events-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-[12px] font-semibold"
            style={{ background: 'rgba(130,80,255,0.88)' }}>
            <Pencil size={11} /> Edit
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(app) }}
            className="pointer-events-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-200 text-[12px] font-semibold"
            style={{ background: 'rgba(220,38,38,0.6)' }}>
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}

      {/* Bottom info */}
      <div className="relative z-10 px-3.5 pb-3">
        <div className="text-white font-bold text-[15px] leading-tight mb-0.5 drop-shadow-sm">{app.title}</div>
        <div className="text-white/50 text-[10.5px] capitalize mb-2.5">{(app.tags || []).slice(0, 2).join(' · ')}</div>
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); onLaunch(app) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11.5px] font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(130,80,255,0.9)', boxShadow: '0 2px 16px rgba(130,80,255,0.55)' }}>
            <Play size={9} fill="currentColor" /> Launch
          </button>
          {isInstalled ? (
            <button onClick={e => { e.stopPropagation(); onUninstall(app.id) }}
              className="flex items-center px-2.5 py-1.5 rounded-lg text-red-400/80 text-[11px] transition-all"
              style={{ background: 'rgba(255,80,80,0.18)' }}>
              <Trash2 size={11} />
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onInstall(app.id) }}
              className="flex items-center px-2.5 py-1.5 rounded-lg text-white/65 text-[11px] transition-all"
              style={{ background: 'rgba(255,255,255,0.14)' }}>
              <Download size={11} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Featured section (2-col grid, no scroll) ──────────────────────────────────
function FeaturedGrid({ apps, onSelect, installedSet, onInstall, onUninstall, onLaunch, editMode, onEdit, onDelete }) {
  if (!apps.length) return null
  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-2 mb-3 px-0.5">
        <span className="text-white font-extrabold text-[15px] tracking-tight">✨ Featured</span>
        <span className="text-white/22 text-[11px]">{apps.length} apps</span>
      </div>
      {/* 2 cols on sm+, 1 col on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {apps.map(app => (
          <FeaturedCard key={app.id} app={app}
            isInstalled={installedSet.has(app.id)}
            onSelect={onSelect}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onLaunch={onLaunch}
            editMode={editMode}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
function AppRow({ title, apps, onSelect, installedSet, onInstall, onUninstall, onLaunch, editMode, onEdit, onDelete }) {
  if (!apps.length) return null
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2 mb-3 px-0.5">
        <span className="text-white/80 text-[13.5px] font-bold">{title}</span>
        <span className="text-white/22 text-[11px]">{apps.length} apps</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1.5 -mx-4 px-4 scrollbar-none">
        {apps.map(app => (
          <HeroCard key={app.id} app={app}
            isInstalled={installedSet.has(app.id)}
            onSelect={onSelect}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onLaunch={onLaunch}
            editMode={editMode}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main AppCenter ────────────────────────────────────────────────────────────
export default function AppCenter({ windowId }) {
  const catalogApps       = useStore(s => s.catalogApps)
  const openWindow        = useStore(s => s.openWindow)
  const addRecentApp      = useStore(s => s.addRecentApp)
  const desktopItems      = useStore(s => s.desktopItems)
  const addToDesktop      = useStore(s => s.addToDesktop)
  const uninstallApp      = useStore(s => s.uninstallApp)
  const addCatalogApp     = useStore(s => s.addCatalogApp)
  const updateCatalogApp  = useStore(s => s.updateCatalogApp)
  const deleteCatalogApp  = useStore(s => s.deleteCatalogApp)

  const isAdmin           = useAuthStore(s => s.currentUserIsAdmin)
  const currentUserId     = useAuthStore(s => s.currentUserId)
  const isGuest           = !!currentUserId?.startsWith('guest-')

  const [query,       setQuery]       = useState('')
  const [category,    setCategory]    = useState('all')
  const [guestPrompt, setGuestPrompt] = useState(false)
  const [selectedApp, setSelectedApp] = useState(null)
  const [editMode,    setEditMode]    = useState(false)
  const [editingApp,  setEditingApp]  = useState(null) // null=closed | 'new'=add | app=edit
  const [saving,      setSaving]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // null | app object
  const [showSuggestions, setShowSuggestions] = useState(false)

  async function handleSaveApp(formData) {
    setSaving(true)
    const result = editingApp === 'new'
      ? await addCatalogApp(formData)
      : await updateCatalogApp(editingApp.title, formData)
    setSaving(false)
    if (result?.ok) {
      setEditingApp(null)
      // Resync selectedApp with the freshly-updated catalog so AppDetail
      // immediately reflects the new description / fields.
      if (selectedApp && editingApp !== 'new') {
        const updated = useStore.getState().catalogApps.find(a => a.title === formData.name)
        if (updated) setSelectedApp(updated)
      }
    }
    return result
  }

  async function handleDeleteApp(app) {
    setConfirmDelete(app)
  }

  async function confirmDeleteApp() {
    if (!confirmDelete) return
    const app = confirmDelete
    setConfirmDelete(null)
    await deleteCatalogApp(app.title)
    if (selectedApp?.id === app.id) setSelectedApp(null)
  }

  const installedSet = useMemo(() => new Set(desktopItems), [desktopItems])

  // Per-category counts for sidebar badges
  const catCounts = useMemo(() => {
    const c = {}
    for (const cat of CATEGORIES) {
      if (cat.id === 'all')       { c[cat.id] = catalogApps.length; continue }
      if (cat.id === 'installed') { c[cat.id] = catalogApps.filter(a => installedSet.has(a.id)).length; continue }
      c[cat.id] = catalogApps.filter(a => (a.tags || []).some(t => t.includes(cat.id))).length
    }
    return c
  }, [catalogApps, installedSet])

  const filtered = useMemo(() => catalogApps.filter(app => {
    if (category === 'installed') return installedSet.has(app.id)
    const matchCat = category === 'all' || (app.tags || []).some(t => t.includes(category))
    const q = query.toLowerCase()
    const matchQ = !q ||
      app.title.toLowerCase().includes(q) ||
      (app.description || '').toLowerCase().includes(q) ||
      (app.tags || []).some(t => t.includes(q))
    return matchCat && matchQ
  }), [catalogApps, query, category, installedSet])

  // Autocomplete suggestions (top 6 title matches)
  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return catalogApps.filter(a => a.title.toLowerCase().includes(q)).slice(0, 6)
  }, [catalogApps, query])

  // Show suggestions when query is non-empty and there are matches
  useEffect(() => {
    setShowSuggestions(query.trim().length > 0 && suggestions.length > 0)
  }, [query, suggestions])

  // Discover sections
  const featured = useMemo(() => catalogApps.filter(a => a.featured),                                             [catalogApps])
  const gameApps  = useMemo(() => catalogApps.filter(a => (a.tags||[]).includes('game')).slice(0, 10),             [catalogApps])
  const devApps   = useMemo(() => catalogApps.filter(a => (a.tags||[]).includes('developer')).slice(0, 8),         [catalogApps])
  const designApps = useMemo(() => catalogApps.filter(a => (a.tags||[]).some(t => ['design','whiteboard'].includes(t))).slice(0, 8), [catalogApps])
  const eduApps   = useMemo(() => catalogApps.filter(a => (a.tags||[]).includes('education')).slice(0, 8),         [catalogApps])

  const handleLaunch = useCallback((app) => {
    if (isGuest) { setGuestPrompt(true); return }
    openWindow(app.id, 'iframe', app.title, { app }); addRecentApp(app)
    if (app.showCursor === false) {
      useStore.setState({ notification: { message: 'Cursor is hidden in this app. Press "/" to toggle.', id: Date.now(), type: 'info' } })
    }
  }, [isGuest, openWindow, addRecentApp])

  const handleInstall = useCallback((appId) => {
    if (isGuest) { setGuestPrompt(true); return }
    addToDesktop(appId)
  }, [isGuest, addToDesktop])

  const isHome = category === 'all' && !query

  return (
    <>
    {/* ── Guest sign-up prompt ── */}
    <AnimatePresence>
      {guestPrompt && (
        <motion.div
          key="guest-prompt"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setGuestPrompt(false)}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 16 }}
            animate={{ scale: 1,    opacity: 1, y: 0  }}
            exit={{    scale: 0.92, opacity: 0, y: 8  }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            className="relative flex flex-col items-center text-center rounded-3xl overflow-hidden mx-4"
            style={{
              width: 360,
              background: 'linear-gradient(155deg,#0f0b28 0%,#13103a 60%,#0a0818 100%)',
              border: '1px solid rgba(130,80,255,0.35)',
              boxShadow: '0 0 0 1px rgba(130,80,255,0.12), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(100,60,200,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Glow orb */}
            <div className="absolute" style={{ top: -60, left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(130,80,255,0.22) 0%,transparent 65%)', pointerEvents: 'none' }} />
            {/* Close */}
            <button
              onClick={() => setGuestPrompt(false)}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors z-10"
            ><X size={14} /></button>
            {/* Icon */}
            <div className="relative mt-8 mb-1" style={{ fontSize: 52, lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(130,80,255,0.6))' }}>🏪</div>
            {/* Heading */}
            <h2 className="relative mt-4 text-[20px] font-extrabold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              <span style={{ background: 'linear-gradient(90deg,#c4b5fd,#818cf8,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sign in to use App Center</span>
            </h2>
            <p className="relative mt-2 px-6 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.42)' }}>
              App Center is only available to registered users. Create a free account to install and launch apps, and sync everything to the cloud.
            </p>
            {/* Feature pills */}
            <div className="relative flex flex-wrap justify-center gap-2 mt-5 px-6">
              {['Install any app','Launch apps instantly','Browse all categories','Hundreds of apps'].map(f => (
                <span key={f} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: 'rgba(130,80,255,0.14)', border: '1px solid rgba(130,80,255,0.28)', color: '#c4b5fd' }}>
                  <Check size={9} strokeWidth={3} />{f}
                </span>
              ))}
            </div>
            {/* Actions */}
            <div className="relative flex flex-col gap-2.5 w-full px-6 mt-7 mb-7">
              <button
                onClick={() => { setGuestPrompt(false); useAuthStore.getState().logout() }}
                className="w-full py-3 rounded-2xl text-[13.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.95),rgba(99,50,210,0.95))', boxShadow: '0 6px 28px rgba(130,80,255,0.45)' }}
              >
                Create Free Account
              </button>
              <button
                onClick={() => setGuestPrompt(false)}
                className="w-full py-2.5 rounded-2xl text-[13px] font-medium transition-all hover:text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.42)' }}
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <div className="flex h-full text-white overflow-hidden" style={{ background: 'rgba(10,8,24,0.99)' }}>

      {/* ── Sidebar ── */}
      <div className="hidden sm:flex w-[184px] flex-shrink-0 flex-col pt-5 pb-4 overflow-y-auto scrollbar-thin"
        style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(7,5,16,0.9)' }}>

        {/* Branding */}
        <div className="px-4 mb-5">
          <div className="text-[15.5px] font-extrabold tracking-tight leading-tight"
            style={{ background: 'linear-gradient(115deg,#a78bfa 0%,#818cf8 50%,#c084fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            App Center
          </div>
          <div className="text-white/28 text-[10.5px] mt-0.5">{catalogApps.length} apps available</div>
        </div>

        <div className="flex flex-col gap-0.5 px-2">
          {CATEGORIES.map(cat => {
            const Icon   = cat.icon
            const active = category === cat.id
            const count  = catCounts[cat.id]
            return (
              <button key={cat.id}
                onClick={() => { setCategory(cat.id); setSelectedApp(null); setQuery('') }}
                className="flex items-center gap-2.5 px-3 py-[8px] rounded-xl text-[12.5px] text-left transition-all group"
                style={{
                  background:   active ? 'rgba(130,80,255,0.22)' : 'transparent',
                  color:        active ? '#ddd6fe'                : 'rgba(255,255,255,0.48)',
                  border:       active ? '1px solid rgba(130,80,255,0.28)' : '1px solid transparent',
                }}>
                <Icon size={13} className="flex-shrink-0" />
                <span className="flex-1 truncate">{cat.label}</span>
                {count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                    style={{ background: active ? 'rgba(130,80,255,0.38)' : 'rgba(255,255,255,0.07)', color: active ? '#c4b5fd' : 'rgba(255,255,255,0.28)' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Admin edit mode toggle */}
        {isAdmin && (
          <div className="mt-auto px-3 pb-1 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setEditMode(m => !m)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[12px] font-medium transition-all"
              style={{
                background: editMode ? 'rgba(130,80,255,0.22)' : 'rgba(255,255,255,0.05)',
                color:      editMode ? '#ddd6fe'                 : 'rgba(255,255,255,0.38)',
                border:     editMode ? '1px solid rgba(130,80,255,0.28)' : '1px solid rgba(255,255,255,0.07)',
              }}>
              <ShieldCheck size={12} className="flex-shrink-0" />
              {editMode ? 'Exit Edit Mode' : 'Edit Mode'}
            </button>
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Search / mobile pills */}
        {!selectedApp && (
          <div className="flex-shrink-0 px-4 pt-2.5 pb-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(8,6,18,0.96)' }}>
            {/* Mobile category pills row */}
            <div className="sm:hidden flex gap-1.5 overflow-x-auto scrollbar-none pb-2">
              {CATEGORIES.map(c => {
                const Icon = c.icon; const active = category === c.id
                return (
                  <button key={c.id} onClick={() => { setCategory(c.id); setSelectedApp(null); setQuery('') }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] flex-shrink-0 transition-all"
                    style={{ background: active ? 'rgba(130,80,255,0.28)' : 'rgba(255,255,255,0.07)', color: active ? '#c4b5fd' : 'rgba(255,255,255,0.5)', border: active ? '1px solid rgba(130,80,255,0.38)' : '1px solid transparent' }}>
                    <Icon size={11} /> {c.label}
                  </button>
                )
              })}
            </div>
            {/* Search bar — desktop and mobile */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Search size={13} className="text-white/33 flex-shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-white text-[13px] outline-none placeholder:text-white/28"
                    placeholder={`Search ${catalogApps.length} apps…`}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setCategory('all') }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onFocus={() => { if (query) setShowSuggestions(true) }}
                  />
                  {query && (
                    <button onClick={() => { setQuery(''); setShowSuggestions(false) }} className="text-white/28 hover:text-white/60 flex-shrink-0 transition-colors">
                      <X size={12} />
                    </button>
                  )}
                </div>
                {/* Autocomplete suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-50"
                    style={{ background: 'rgba(18,14,32,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 28px rgba(0,0,0,0.7)' }}>
                    {suggestions.map(app => (
                      <button key={app.id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                        onMouseDown={() => { setSelectedApp(app); setQuery(''); setShowSuggestions(false) }}
                      >
                        <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 24, height: 24 }}>
                          <CatalogTile app={app} size={24} />
                        </div>
                        <span className="flex-1 text-[12.5px] text-white/85 truncate">{app.title}</span>
                        <span className="text-[10px] text-white/28 capitalize flex-shrink-0">{app.tags?.[0]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Mobile admin toggle (icon-only) */}
              {isAdmin && (
                <button
                  className="sm:hidden flex items-center justify-center rounded-xl w-9 h-9 flex-shrink-0 transition-all"
                  style={{
                    background: editMode ? 'rgba(130,80,255,0.28)' : 'rgba(255,255,255,0.07)',
                    border: editMode ? '1px solid rgba(130,80,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                  onClick={() => setEditMode(m => !m)}
                  title={editMode ? 'Exit Edit Mode' : 'Edit Mode'}>
                  <ShieldCheck size={14} className={editMode ? 'text-violet-300' : 'text-white/40'} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <AnimatePresence>
          {selectedApp ? (
            <AppDetail
              key="detail"
              app={selectedApp}
              isInstalled={installedSet.has(selectedApp.id)}
              onInstall={handleInstall}
              onUninstall={uninstallApp}
              onLaunch={handleLaunch}
              onBack={() => setSelectedApp(null)}
              editMode={editMode}
              onEdit={setEditingApp}
            />
          ) : (
            <motion.div
              key={`${category}-${!!query}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex-1 overflow-y-auto px-4 py-5 scrollbar-thin"
            >
              {/* ── Home / Discover ── */}
              {isHome ? (
                <>
                  {editMode && (
                    <button onClick={() => setEditingApp('new')}
                      className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:brightness-110"
                      style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.85),rgba(99,50,210,0.85))', border: '1px solid rgba(130,80,255,0.4)', boxShadow: '0 4px 20px rgba(130,80,255,0.3)' }}>
                      <Plus size={14} /> Add New App
                    </button>
                  )}
                  <FeaturedGrid apps={featured} onSelect={setSelectedApp} installedSet={installedSet} onInstall={handleInstall} onUninstall={uninstallApp} onLaunch={handleLaunch} editMode={editMode} onEdit={setEditingApp} onDelete={handleDeleteApp} />
                  <AppRow title="🎮 Games"             apps={gameApps}  onSelect={setSelectedApp} installedSet={installedSet} onInstall={handleInstall} onUninstall={uninstallApp} onLaunch={handleLaunch} editMode={editMode} onEdit={setEditingApp} onDelete={handleDeleteApp} />
                  <AppRow title="⚡ Developer Tools"   apps={devApps}   onSelect={setSelectedApp} installedSet={installedSet} onInstall={handleInstall} onUninstall={uninstallApp} onLaunch={handleLaunch} editMode={editMode} onEdit={setEditingApp} onDelete={handleDeleteApp} />
                  <AppRow title="🎨 Design & Creative" apps={designApps} onSelect={setSelectedApp} installedSet={installedSet} onInstall={handleInstall} onUninstall={uninstallApp} onLaunch={handleLaunch} editMode={editMode} onEdit={setEditingApp} onDelete={handleDeleteApp} />
                  <AppRow title="📚 Education"         apps={eduApps}   onSelect={setSelectedApp} installedSet={installedSet} onInstall={handleInstall} onUninstall={uninstallApp} onLaunch={handleLaunch} editMode={editMode} onEdit={setEditingApp} onDelete={handleDeleteApp} />
                </>
              ) : (
                /* ── Category / Search grid ── */
                <>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-white/82 text-[14px] font-bold">
                      {query ? `"${query}"` : CATEGORIES.find(c => c.id === category)?.label}
                    </span>
                    <span className="text-white/28 text-[12px]">{filtered.length} apps</span>
                  </div>

                  {filtered.length === 0 && (
                    <div className="py-24 flex flex-col items-center gap-4 text-center">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Search size={22} className="text-white/20" />
                      </div>
                      <div className="text-white/25 text-[13px]">No apps found</div>
                    </div>
                  )}

                  {editMode && (
                    <button onClick={() => setEditingApp('new')}
                      className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:brightness-110"
                      style={{ background: 'linear-gradient(135deg,rgba(130,80,255,0.85),rgba(99,50,210,0.85))', border: '1px solid rgba(130,80,255,0.4)', boxShadow: '0 4px 20px rgba(130,80,255,0.3)' }}>
                      <Plus size={14} /> Add New App
                    </button>
                  )}
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                    {filtered.map(app => (
                      <AppCard key={app.id} app={app}
                        isInstalled={installedSet.has(app.id)}
                        onSelect={setSelectedApp}
                        onInstall={handleInstall}
                        onUninstall={uninstallApp}
                        editMode={editMode}
                        onEdit={setEditingApp}
                        onDelete={handleDeleteApp}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Admin App Edit Modal — rendered via portal to escape Window's overflow:hidden + transform stacking context */}
      {createPortal(
        <AnimatePresence>
          {editingApp && (
            <AppEditModal
              initial={editingApp === 'new' ? null : editingApp}
              onSave={handleSaveApp}
              onClose={() => setEditingApp(null)}
              saving={saving}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setConfirmDelete(null)}>
          <div className="rounded-2xl p-5 w-80 text-sm"
            style={{ background: 'rgba(20,20,36,0.97)', border: '1px solid rgba(255,80,80,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-white text-base mb-2">Delete "{confirmDelete.title}"?</div>
            <p className="text-white/55 text-[13px] mb-5">
              This will permanently remove this app from the catalog. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white/70 transition-all"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={confirmDeleteApp}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{ background: 'rgba(239,68,68,0.7)' }}>Delete App</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </>
  )
}

