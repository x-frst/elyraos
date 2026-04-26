import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  FolderOpen, Folder, FileText, Image, Music, Video, FileCode, Archive,
  Package, Download, ChevronRight, Home, ArrowUp,
} from "lucide-react"
import { unzip } from "fflate"
import { fsQuota, fsRawUrl, fsUploadStream } from "../utils/db"
import { useStore, findNode } from "../store/useStore"

// ── Extension → icon / mime / binary flag ────────────────────────────────
const EXT_ICONS = {
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image, svg: Image, bmp: Image,
  mp3: Music, wav: Music, ogg: Music, flac: Music, aac: Music,
  mp4: Video, webm: Video, mkv: Video, mov: Video,
  js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
  html: FileCode, css: FileCode, json: FileCode, py: FileCode, sh: FileCode,
  zip: Archive, rar: Archive, tar: Archive, gz: Archive,
}

const MIME_MAP = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', bmp:'image/bmp', svg:'image/svg+xml',
  mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg',
  mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime',
  pdf:'application/pdf', zip:'application/zip',
}

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','svg','ico',
  'mp3','wav','ogg','flac','aac','m4a','mp4','webm','mov','mkv',
  'pdf','zip','tar','gz','7z','rar',
  'doc','docx','xls','xlsx','ppt','pptx','exe','dll','bin','dat',
])

const ARC_EXTS = ['zip','rar','tar','gz','7z']

// ── Helpers ───────────────────────────────────────────────────────────────

function FileIcon({ name, size = 14 }) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const Icon = EXT_ICONS[ext] || FileText
  return <Icon size={size} className="text-blue-300 flex-shrink-0" />
}

function fmtBytes(n) {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

// Parse any supported archive (Uint8Array) → flat entries array, or null if unreadable.
// entry: { path: string, size: number, getBytes: () => Uint8Array }
function parseArchive(u8) {
  if (!u8 || u8.length < 4) return null

  // ── 1. Legacy Elyra archive (JSON text format) ────────────────────────────
  // Old archives were JSON strings stored via the content endpoint.
  // Detect by first byte being '{' and try to parse for backward compatibility.
  if (u8[0] === 0x7b) {  // '{'
    try {
      const text   = new TextDecoder().decode(u8)
      const parsed = JSON.parse(text)
      if (parsed?.novaArchive && Array.isArray(parsed.files)) {
        return parsed.files
          .filter(f => f.path && !f.isDir)
          .map(f => {
            const getBytes = () => {
              const c = f.content || ''
              if (c.startsWith('data:')) {
                const sep = c.indexOf(',')
                if (sep < 0) return new Uint8Array(0)
                try {
                  const bin = atob(c.slice(sep + 1).replace(/[\s\r\n]/g, ''))
                  const out = new Uint8Array(bin.length)
                  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
                  return out
                } catch { return new Uint8Array(0) }
              }
              return new TextEncoder().encode(c)
            }
            return { path: f.path.replace(/^\//, ''), size: new Blob([f.content || '']).size, getBytes }
          })
      }
    } catch {}
  }

  // ── 2. Real ZIP via fflate (async — runs in a worker, never blocks the UI) ────
  if (u8[0] !== 0x50 || u8[1] !== 0x4b) return null  // no PK magic → not a ZIP

  return new Promise((resolve, reject) => {
    unzip(u8, (err, decompressed) => {
      if (err) { reject(err); return }
      resolve(
        Object.entries(decompressed)
          .filter(([p]) => !p.endsWith('/'))
          .map(([p, fileU8]) => ({
            path:     p.replace(/^\//,''),
            size:     fileU8.length,
            getBytes: () => fileU8,
          }))
      )
    })
  })
}

// Collect all archive nodes in the FS tree
function collectArchiveNodes(node, out = []) {
  if (!node) return out
  if (node.type === 'file') {
    const ext = (node.name.split('.').pop() || '').toLowerCase()
    if (ARC_EXTS.includes(ext)) out.push(node)
  }
  for (const c of (node.children || [])) collectArchiveNodes(c, out)
  return out
}

// Build { dirs, files } for the current folder from flat entry list
function buildView(entries, currentPath) {
  const prefix = currentPath ? currentPath + '/' : ''
  const dirs   = new Set()
  const files  = []
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue
    const rest     = entry.path.slice(prefix.length)
    const slashIdx = rest.indexOf('/')
    if (slashIdx === -1) files.push(entry)
    else dirs.add(rest.slice(0, slashIdx))
  }
  return {
    dirs:  [...dirs].sort((a, b) => a.localeCompare(b)),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

// ── ArchiveViewer ─────────────────────────────────────────────────────────
function ArchiveViewer({ fileId, parentId, onClose, autoExtract = false }) {
  const fsRoot     = useStore(s => s.fsRoot)

  const [currentPath, setCurrentPath] = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [busy,        setBusy]        = useState(false)
  const [status,      setStatus]      = useState(null)   // { ok, msg }
  const [progress,    setProgress]    = useState(null)   // { done, total, name } | null
  const cancelRef = useRef(false)
  // entries: undefined=loading, null=error (parseError set), array=ready
  const [entries,     setEntries]     = useState(undefined)
  const [parseError,  setParseError]  = useState(null)

  const archiveNode = findNode(fsRoot, fileId)
  const archiveName = archiveNode?.name || 'Archive'

  // Fetch raw bytes directly from the server (binary-safe) then parse asynchronously.
  // This replaces the old loadFile → readFile → contentToU8 path which corrupted
  // binary ZIP files by reading them through the UTF-8 content endpoint.
  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    setEntries(undefined)
    setParseError(null)

    const load = async () => {
      try {
        const url = fsRawUrl(fileId, archiveName)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const u8 = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        Promise.resolve(parseArchive(u8))
          .then(result => {
            if (cancelled) return
            if (!result) { setParseError('Not a recognised archive (ZIP or Nova format)'); setEntries(null) }
            else setEntries(result)
          })
          .catch(e => { if (!cancelled) { setParseError(e.message); setEntries(null) } })
      } catch (e) {
        if (!cancelled) { setParseError(e.message); setEntries(null) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [fileId, archiveName])  // eslint-disable-line

  const entryList = Array.isArray(entries) ? entries : []

  // Auto-extract: triggered once when entries first resolve (e.g. "Extract Here" context menu)
  const autoExtractFired = useRef(false)
  useEffect(() => {
    if (!autoExtract || autoExtractFired.current) return
    if (!Array.isArray(entries) || entries.length === 0) return
    autoExtractFired.current = true
    const prefix = ''  // always extract everything from root
    const all = entries  // full flat list
    extract(all, parentId)
  }, [entries, autoExtract])  // eslint-disable-line

  const { dirs, files } = useMemo(
    () => entryList.length ? buildView(entryList, currentPath) : { dirs: [], files: [] },
    [entryList, currentPath]
  )

  const breadcrumbs = currentPath ? currentPath.split('/') : []

  // Selection helpers
  const toggleSelect = path =>
    setSelected(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })
  const selectAll = () =>
    setSelected(s => s.size === files.length ? new Set() : new Set(files.map(f => f.path)))

  // All entries under the current folder (recursive, for "Extract All")
  const allInFolder = useMemo(() => {
    if (!entryList.length) return []
    const prefix = currentPath ? currentPath + '/' : ''
    return entryList.filter(e => e.path.startsWith(prefix))
  }, [entryList, currentPath])

  const extract = useCallback(async (entriesToExtract, targetFolderId) => {
    if (!entriesToExtract.length) return
    cancelRef.current = false
    setBusy(true)
    setStatus(null)
    setProgress({ done: 0, total: entriesToExtract.length, name: '' })

    // ── Pre-flight quota check ──────────────────────────────────────────
    try {
      const { used, quota } = await fsQuota()
      const needed = entriesToExtract.reduce((acc, e) => acc + e.size, 0)
      const avail  = quota - used
      if (needed > avail) {
        setStatus({
          ok:  false,
          msg: `Not enough space — need ${fmtBytes(needed)}, only ${fmtBytes(avail)} free of ${fmtBytes(quota)} quota`,
        })
        setBusy(false)
        setProgress(null)
        return
      }
    } catch {
      // quota fetch failed — proceed anyway (server will enforce with 413)
    }

    let count = 0
    try {
      for (const entry of entriesToExtract) {
        if (cancelRef.current) {
          setStatus({ ok: false, msg: `Cancelled — ${count} file${count !== 1 ? 's' : ''} extracted` })
          break
        }
        // Yield to the event loop — keeps browser responsive
        await new Promise(r => setTimeout(r, 0))

        const parts = entry.path.replace(/\/$/, '').split('/')
        let   pid   = targetFolderId
        // Ensure intermediate folders exist
        for (let i = 0; i < parts.length - 1; i++) {
          const existing = (findNode(useStore.getState().fsRoot, pid)?.children || [])
            .find(c => c.name === parts[i] && c.type === 'folder')
          pid = existing?.id ?? useStore.getState().createNode(pid, 'folder', parts[i])
        }
        const filename = parts[parts.length - 1]
        const ext      = (filename.split('.').pop() || '').toLowerCase()
        const mime     = MIME_MAP[ext] || 'application/octet-stream'
        const bytes    = entry.getBytes()

        // Stream raw bytes to the server — works for both text and binary files.
        // Text apps (Notepad/CodeEditor) load via utf-8 content endpoint which correctly
        // decodes raw UTF-8 bytes. Binary apps use the raw endpoint directly.
        const blob   = new Blob([bytes], { type: mime })
        const nodeId = useStore.getState().createNodeEntry(pid, filename)
        await fsUploadStream(nodeId, blob, null, null)
        useStore.getState().updateNodeSize(nodeId, blob.size)

        count++
        setProgress({ done: count, total: entriesToExtract.length, name: filename })
      }
      if (!cancelRef.current) {
        const dest = findNode(useStore.getState().fsRoot, targetFolderId)?.name || 'folder'
        setStatus({ ok: true, msg: `✓ Extracted ${count} file${count !== 1 ? 's' : ''} to "${dest}"` })
      }
    } catch (e) {
      setStatus({ ok: false, msg: `Error: ${e.message}` })
    } finally {
      setBusy(false)
      setProgress(null)
      setTimeout(() => setStatus(null), 5000)
    }
  }, [])

  // ── Loading state ────────────────────────────────────────────────────────
  if (entries === undefined) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#12121e' }}>
        <span className="text-white/40 text-sm animate-pulse">Loading archive…</span>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (!Array.isArray(entries)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center"
        style={{ background: '#12121e' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: 'rgba(239,68,68,0.1)' }}>⚠️</div>
        <div className="text-white/60 font-semibold">Cannot read archive</div>
        {parseError && (
          <div className="text-red-400/70 text-xs font-mono px-3 py-1.5 rounded-lg max-w-sm break-words"
            style={{ background: 'rgba(239,68,68,0.08)' }}>{parseError}</div>
        )}
        <div className="text-white/30 text-sm">
          Supported: standard ZIP files (DEFLATE / STORE, no password).
        </div>
        {onClose && (
          <button onClick={onClose}
            className="mt-2 px-4 py-1.5 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/10 transition-all">
            ← Back
          </button>
        )}
      </div>
    )
  }

  const totalSize = entryList.reduce((acc, e) => acc + e.size, 0)

  return (
    <div className="flex flex-col h-full text-white select-none" style={{ background: '#12121e' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#1a3a5c 0%,#1e4f7a 60%,#1a3a5c 100%)', borderBottom: '2px solid #2a6aaa' }}>
        {onClose && (
          <button onClick={onClose}
            className="text-blue-300/70 hover:text-white transition-colors mr-1 text-lg leading-none">←</button>
        )}
        <Package size={20} className="text-blue-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{archiveName}</div>
          <div className="text-blue-200/60 text-[11px]">{entryList.length} file{entryList.length !== 1 ? 's' : ''} · {fmtBytes(totalSize)} uncompressed</div>
        </div>
        <div className="text-blue-200/30 text-[10px] font-mono uppercase tracking-wider">ZIP Archive</div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0"
        style={{ background: '#1a1a2c', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => extract(allInFolder, parentId)}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium text-green-300 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          <FolderOpen size={13} /> Extract All
        </button>
        <button
          disabled={busy || !selected.size}
          onClick={() => extract(entryList.filter(e => selected.has(e.path)), parentId)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium text-blue-300 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          <Download size={13} /> Extract Selected ({selected.size})
        </button>
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <button onClick={selectAll}
          className="px-3 py-1 rounded-lg text-[12px] text-white/50 hover:text-white hover:bg-white/10 transition-all">
          {selected.size === files.length && files.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Breadcrumb path bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 text-[12px] overflow-x-auto"
        style={{ background: '#161626', borderBottom: '1px solid rgba(255,255,255,0.05)', scrollbarWidth: 'none' }}>
        <button onClick={() => setCurrentPath('')}
          className="text-blue-300/70 hover:text-blue-200 transition-colors flex-shrink-0">
          <Home size={12} />
        </button>
        {breadcrumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
            <ChevronRight size={11} className="text-white/20" />
            <button
              onClick={() => setCurrentPath(breadcrumbs.slice(0, i + 1).join('/'))}
              className={`${i === breadcrumbs.length - 1 ? 'text-white/80' : 'text-blue-300/70 hover:text-blue-200'} transition-colors`}>
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Column headers */}
      <div className="grid gap-2 px-3 py-1 text-[10px] font-semibold text-white/25 uppercase tracking-wider flex-shrink-0"
        style={{ gridTemplateColumns: '1fr 80px 55px', background: '#14142a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span>Name</span><span className="text-right">Size</span><span className="text-right">Type</span>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">

        {/* Up one level */}
        {currentPath && (
          <div
            className="flex items-center gap-2 px-3 py-2 text-[12px] cursor-pointer hover:bg-white/5 transition-colors text-white/45"
            onClick={() => setCurrentPath(
              currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : ''
            )}>
            <ArrowUp size={13} className="flex-shrink-0 text-yellow-400/60" />
            <span>.. (up)</span>
          </div>
        )}

        {/* Subdirectories */}
        {dirs.map(dir => {
          const fullPath   = currentPath ? `${currentPath}/${dir}` : dir
          const childCount = entryList.filter(e => e.path.startsWith(fullPath + '/')).length
          return (
            <div key={dir}
              className="grid gap-2 items-center px-3 py-1.5 text-[12px] cursor-pointer hover:bg-white/5 transition-colors"
              style={{ gridTemplateColumns: '1fr 80px 55px' }}
              onDoubleClick={() => { setCurrentPath(fullPath); setSelected(new Set()) }}>
              <span className="flex items-center gap-2 min-w-0">
                <Folder size={14} className="text-yellow-400 flex-shrink-0" />
                <span className="truncate text-white/90 font-medium">{dir}</span>
                <span className="text-white/25 text-[10px] flex-shrink-0">{childCount} item{childCount !== 1 ? 's' : ''}</span>
              </span>
              <span className="text-right text-white/25 text-[11px]">—</span>
              <span className="text-right text-white/25 uppercase text-[11px]">DIR</span>
            </div>
          )
        })}

        {/* Files */}
        {files.map((entry, i) => {
          const name  = entry.path.split('/').pop()
          const ext   = (name.split('.').pop() || '').toLowerCase()
          const isSel = selected.has(entry.path)
          return (
            <div key={entry.path}
              className="grid gap-2 items-center px-3 py-1.5 text-[12px] cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '1fr 80px 55px',
                background: isSel
                  ? 'rgba(59,130,246,0.22)'
                  : i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
              }}
              onClick={() => toggleSelect(entry.path)}
              onDoubleClick={() => extract([entry], parentId)}>
              <span className="flex items-center gap-2 min-w-0">
                <FileIcon name={name} size={14} />
                <span className="truncate text-white/85" title={entry.path}>{name}</span>
              </span>
              <span className="text-right text-white/40 font-mono text-[11px]">{fmtBytes(entry.size)}</span>
              <span className="text-right text-white/30 uppercase text-[11px]">{ext || '—'}</span>
            </div>
          )
        })}

        {dirs.length === 0 && files.length === 0 && (
          <div className="text-white/25 text-sm text-center py-12">Empty folder</div>
        )}
      </div>

      {/* Status / Progress bar */}
      <div className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{ background: '#161626', borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: 38 }}>
        {busy && progress ? (
          // ── Extraction in progress ──
          <div className="flex-1 flex items-center gap-3 py-1.5">
            <div className="flex-1 flex flex-col gap-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-blue-300/70 text-[11px] truncate max-w-[55%]" title={progress.name}>
                  {progress.name || 'Preparing…'}
                </span>
                <span className="text-white/40 text-[11px] tabular-nums flex-shrink-0">
                  {progress.done} / {progress.total}
                  {progress.total > 0 && (
                    <span className="text-white/25 ml-1">
                      ({Math.round((progress.done / progress.total) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{
                    width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%',
                    background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => { cancelRef.current = true }}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
              style={{ color: 'rgba(248,113,113,0.85)', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.color='#fca5a5' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; e.currentTarget.style.color='rgba(248,113,113,0.85)' }}>
              Cancel
            </button>
          </div>
        ) : status ? (
          <span className={`text-[11px] py-1.5 ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.msg}</span>
        ) : (
          <div className="flex items-center gap-2 text-[11px] py-1.5">
            <span className="text-white/35">{entryList.length} file{entryList.length !== 1 ? 's' : ''}</span>
            <span className="text-white/15">|</span>
            <span className="text-white/35">{selected.size} selected</span>
            <span className="text-white/15">|</span>
            <span className="text-white/35">{fmtBytes(totalSize)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ArchiveBrowser — shown when launched without a specific file ──────────
function ArchiveBrowser({ onOpen }) {
  const fsRoot   = useStore(s => s.fsRoot)
  const archives = useMemo(() => collectArchiveNodes(fsRoot), [fsRoot])

  return (
    <div className="flex flex-col h-full text-white select-none" style={{ background: '#12121e' }}>
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#1a3a5c 0%,#1e4f7a 60%,#1a3a5c 100%)', borderBottom: '2px solid #2a6aaa' }}>
        <Package size={22} className="text-blue-300 flex-shrink-0" />
        <div>
          <div className="text-white font-semibold text-sm">Archive Manager</div>
          <div className="text-blue-200/55 text-[11px]">{archives.length} archive{archives.length !== 1 ? 's' : ''} found</div>
        </div>
      </div>

      {archives.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-center">
          <div className="text-6xl">📦</div>
          <div className="text-white/50 text-sm font-medium">No archives found</div>
          <div className="text-white/30 text-xs">
            Upload a ZIP file or right-click a file/folder<br/>in Files → "Compress as ZIP"
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-2 text-[11px] text-white/30 uppercase tracking-wider font-semibold flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            Archives in filesystem
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {archives.map(node => (
              <button key={node.id}
                onClick={() => onOpen(node.id)}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-all mb-1"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Archive size={18} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[13px] truncate font-medium">{node.name}</div>
                  <div className="text-white/30 text-[11px]">{node.size ? fmtBytes(node.size) : '…'}</div>
                </div>
                <ChevronRight size={14} className="text-white/25 flex-shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
export default function ArchiveManager({ windowId, context }) {
  const [activeFileId, setActiveFileId] = useState(context?.fileId || null)
  const parentId    = context?.parentId    || 'root'
  const autoExtract = context?.autoExtract || false

  if (!activeFileId) return <ArchiveBrowser onOpen={id => setActiveFileId(id)} />

  return (
    <ArchiveViewer
      fileId={activeFileId}
      parentId={parentId}
      autoExtract={autoExtract}
      onClose={context?.fileId ? null : () => setActiveFileId(null)}
    />
  )
}
