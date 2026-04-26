import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ArrowLeft, ArrowRight, RotateCw, X, Home,
  Download, AlertTriangle, Globe, Lock, FolderDown, CheckCircle, XCircle,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { getJWT } from '../utils/db'

const HOME_URL      = 'https://www.bing.com/'
const SEARCH_ENGINE = 'https://www.bing.com/search?q='

function normalizeUrl(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return HOME_URL
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w-]+\.[\w.-]+(\/|$)/.test(trimmed)) return 'https://' + trimmed
  return SEARCH_ENGINE + encodeURIComponent(trimmed)
}


export default function Browser() {
  // History management
  const [hist,    setHist]    = useState([HOME_URL])
  const [histIdx, setHistIdx] = useState(0)
  // What's shown in the address bar (real URL, not proxy URL)
  const [displayUrl, setDisplayUrl] = useState(HOME_URL)
  const [inputVal,   setInputVal]   = useState(HOME_URL)
  // Proxy response
  const [srcdoc,  setSrcdoc]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [downloads,     setDownloads]     = useState([])
  const [showDownloads, setShowDownloads] = useState(false)
  const dlHandlerRef = useRef(null)
  const iframeRef    = useRef(null)

  const createNode = useStore(s => s.createNode)
  const listDir    = useStore(s => s.listDir)

  const getDownloadsId = () => {
    const roots = listDir('root')
    return roots.find(n => n.name === 'Downloads' && n.type === 'folder')?.id
      || roots.find(n => n.name === 'Documents' && n.type === 'folder')?.id
      || 'root'
  }

  // Download files intercepted from proxied pages
  dlHandlerRef.current = async (url, filename) => {
    const id = Date.now() + Math.random()
    setDownloads(d => [...d, { id, filename, status: 'downloading' }])
    setShowDownloads(true)
    try {
      const res = await fetch(`/api/proxy/download?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${getJWT()}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error || 'Download failed')
      }
      const data = await res.json()
      const fname = data.filename || filename
      const content = data.encoding === 'base64'
        ? `data:${data.contentType};base64,${data.content}`
        : data.content
      createNode(getDownloadsId(), 'file', fname, content)
      setDownloads(d => d.map(item => item.id === id ? { ...item, status: 'saved', filename: fname } : item))
    } catch (err) {
      setDownloads(d => d.map(item => item.id === id ? { ...item, status: 'error' } : item))
    }
  }

  // Core loader: fetches the URL through the server proxy and updates srcdoc
  const loadUrl = useCallback(async (url, push = true) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${getJWT()}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load' }))
        throw new Error(err.error || 'Failed to load page')
      }
      const data = await res.json()
      // Auto-download binary files instead of showing a dead-end page
      if (data.type === 'binary') {
        const fname = url.split('/').pop().split('?')[0] || 'download'
        dlHandlerRef.current?.(url, fname)
        setLoading(false)
        return
      }
      setSrcdoc(data.html || '')
      const finalUrl = data.finalUrl || url
      setDisplayUrl(finalUrl)
      setInputVal(finalUrl)
      if (push) {
        setHist(h => [...h.slice(0, histIdx + 1), finalUrl])
        setHistIdx(i => i + 1)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  // histIdx is only needed for the push-to-history logic
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histIdx])

  // Load the home page on first mount
  useEffect(() => { loadUrl(HOME_URL, false) }, []) // eslint-disable-line

  // Listen for navigation events postMessage'd by the injected interceptor
  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.data.type === 'nova-nav') navigate(e.data.url)
      if (e.data.type === 'nova-download') dlHandlerRef.current?.(e.data.url, e.data.filename)
      if (e.data.type === 'nova-loc') {
        // Ignore internal browser URLs (srcdoc iframe reports about:srcdoc on load)
        if (e.data.url && !e.data.url.startsWith('about:')) {
          setDisplayUrl(e.data.url)
          setInputVal(e.data.url)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, []) // eslint-disable-line

  const navigate = useCallback((raw) => loadUrl(normalizeUrl(raw)), [loadUrl])

  const handleSubmit = (e) => { e.preventDefault(); navigate(inputVal) }

  const canBack    = histIdx > 0
  const canForward = histIdx < hist.length - 1

  const goBack    = () => { if (!canBack)    return; const i = histIdx - 1; setHistIdx(i); loadUrl(hist[i], false) }
  const goForward = () => { if (!canForward) return; const i = histIdx + 1; setHistIdx(i); loadUrl(hist[i], false) }
  const reload    = () => loadUrl(displayUrl, false)

  // Save the current page's HTML source as a file
  const handleDownload = () => {
    if (!srcdoc) return
    const segments = displayUrl.replace(/\?.*$/, '').split('/')
    const raw      = segments[segments.length - 1] || 'page'
    const name     = raw.includes('.') ? raw : raw + '.html'
    createNode(getDownloadsId(), 'file', name, srcdoc)
    useStore.setState({ notification: { message: `Saved "${name}" to Downloads`, id: Date.now(), type: 'success' } })
  }

  const isSecure = displayUrl.startsWith('https://')

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(12,12,22,0.97)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,10,20,0.8)' }}>

        {/* Back / Forward / Reload / Home */}
        <button onClick={goBack} disabled={!canBack} title="Back"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-30">
          <ArrowLeft size={15} />
        </button>
        <button onClick={goForward} disabled={!canForward} title="Forward"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-30">
          <ArrowRight size={15} />
        </button>
        <button onClick={reload} title="Reload"
          className={`w-8 h-8 hidden sm:flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0 ${loading ? 'animate-spin' : ''}`}>
          <RotateCw size={15} />
        </button>
        <button onClick={() => navigate(HOME_URL)} title="Home"
          className="w-8 h-8 hidden sm:flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Home size={15} />
        </button>

        {/* URL / search bar */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl mx-1"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {isSecure
            ? <Lock  size={12} className="text-emerald-400 flex-shrink-0" />
            : <Globe size={12} className="text-white/30   flex-shrink-0" />}
          <input
            className="flex-1 bg-transparent text-white text-[13px] outline-none placeholder:text-white/30 min-w-0"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="Search or enter URL…"
            onFocus={e => e.target.select()}
          />
          {inputVal && (
            <button type="button" onClick={() => setInputVal('')} className="text-white/30 hover:text-white/60 flex-shrink-0">
              <X size={12} />
            </button>
          )}
        </form>

        {/* Downloads panel toggle */}
        <button onClick={() => setShowDownloads(v => !v)} title="Downloads"
          className="w-8 h-8 relative flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <FolderDown size={15} />
          {downloads.some(d => d.status === 'downloading') && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          )}
          {downloads.length > 0 && !downloads.some(d => d.status === 'downloading') && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>

        {/* Save page */}
        <button onClick={handleDownload} title="Save page to Files"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Download size={15} />
        </button>
      </div>

      {/* Progress bar */}
      {loading && (
        <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full animate-pulse rounded-full"
            style={{ width: '60%', background: 'var(--nova-accent,#7c3aed)' }} />
        </div>
      )}

      {/* Downloads panel */}
      {showDownloads && (
        <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,18,0.98)', maxHeight: 180, overflowY: 'auto' }}>
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-white/40 text-[11px] font-medium uppercase tracking-wide">Downloads</span>
            {downloads.length > 0 && <button onClick={() => setDownloads([])} className="text-white/30 hover:text-white/60 text-[11px]">Clear</button>}
          </div>
          {downloads.length === 0 && (
            <div className="px-3 pb-3 text-white/30 text-[12px]">No downloads yet. Files downloaded from pages will appear here.</div>
          )}
          {downloads.map(dl => (
            <div key={dl.id} className="flex items-center gap-2 px-3 py-1.5">
              {dl.status === 'saved'
                ? <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
                : dl.status === 'error'
                ? <XCircle size={13} className="text-red-400 flex-shrink-0" />
                : <Download size={13} className="text-white/40 animate-pulse flex-shrink-0" />}
              <span className="flex-1 text-white/80 text-[12px] truncate">{dl.filename}</span>
              <span className={`text-[11px] flex-shrink-0 ${dl.status === 'error' ? 'text-red-400' : dl.status === 'saved' ? 'text-emerald-400/70' : 'text-white/30'}`}>
                {dl.status === 'downloading' ? 'Saving…' : dl.status === 'saved' ? 'Saved to Downloads' : 'Failed'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.12)' }}>
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <div className="text-white font-semibold">Could not load page</div>
            <div className="text-white/40 text-sm max-w-xs break-words">{error}</div>
            <div className="flex gap-3 mt-1">
              <button onClick={() => loadUrl(displayUrl, false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)' }}>
                Retry
              </button>
              <a href={displayUrl} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ background: 'rgba(130,80,255,0.5)' }}>
                Open in new tab
              </a>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={srcdoc ? undefined : 'empty'}
            srcdoc={srcdoc}
            title="Browser"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
            className="absolute inset-0 w-full h-full border-0"
            style={{ background: '#fff' }}
          />
        )}
      </div>
    </div>
  )
}
