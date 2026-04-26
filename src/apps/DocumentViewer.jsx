import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  FileText, Table, FileSpreadsheet, File, AlertTriangle, X,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { fsRawUrl } from '../utils/db'

// Large-file threshold: above this, stream text via fetch instead of loading via fsRead
const LARGE_FILE_BYTES = 5 * 1024 * 1024  // 5 MB

// ── CSV / TSV parser ──────────────────────────────────────────────────────────
function parseCSV(text, delimiter = ',') {
  const rows = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === delimiter && !inQ) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}

// ── Viewers ──────────────────────────────────────────────────────────────────

function PlainTextViewer({ content, zoom }) {
  return (
    <pre
      className="p-4 text-white/80 whitespace-pre-wrap break-words font-mono leading-relaxed overflow-auto h-full"
      style={{ fontSize: `${zoom * 0.875}rem` }}>
      {content}
    </pre>
  )
}

function TableViewer({ rows, zoom }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const totalPages = Math.ceil((rows.length - 1) / PAGE_SIZE)
  const headers = rows[0] || []
  const dataRows = rows.slice(1 + (page - 1) * PAGE_SIZE, 1 + page * PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-white/80" style={{ fontSize: `${zoom * 0.8}rem` }}>
          <thead className="sticky top-0" style={{ background: 'rgba(30,20,60,0.95)', zIndex: 1 }}>
            <tr>
              <th className="px-2 py-1.5 text-center text-white/30 text-[11px] font-normal border-b border-white/10 border-r border-white/10 w-10">#</th>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-1.5 text-left font-semibold text-white/70 border-b border-white/10 border-r border-white/10 max-w-[200px] truncate whitespace-nowrap">
                  {h || `(col ${i + 1})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/5 hover:bg-white/4">
                <td className="px-2 py-1 text-center text-white/25 text-[11px] border-r border-white/10">
                  {(page - 1) * PAGE_SIZE + ri + 2}
                </td>
                {headers.map((_, ci) => (
                  <td key={ci} className="px-3 py-1 border-r border-white/10 max-w-[200px] truncate whitespace-nowrap">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 flex-shrink-0 border-t border-white/10 text-sm text-white/60">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="disabled:opacity-30 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            className="disabled:opacity-30 hover:text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function ImageViewer({ dataUrl }) {
  return (
    <div className="flex items-center justify-center h-full overflow-auto p-4">
      <img src={dataUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
    </div>
  )
}

function HtmlViewer({ content }) {
  const blob = useMemo(() => {
    const b = new Blob([content], { type: 'text/html' })
    return URL.createObjectURL(b)
  }, [content])
  useEffect(() => () => URL.revokeObjectURL(blob), [blob])
  return (
    <iframe src={blob} title="HTML Preview" sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0" style={{ background: '#fff' }} />
  )
}

function XlsxViewer({ rawContent, fileName, zoom }) {
  const [parsedData, setParsedData] = useState(null)
  const [parseError, setParseError] = useState(null)

  useEffect(() => {
    setParsedData(null); setParseError(null)
    if (!rawContent) return

    const parse = (input, inputType) => {
      try {
        const wb = XLSX.read(input, { type: inputType })
        const sheets = {}
        for (const name of wb.SheetNames)
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
        setParsedData({ sheets, sheetNames: wb.SheetNames })
      } catch (e) {
        setParseError(e.message)
      }
    }

    // rawContent may be a /api/... URL (streaming-uploaded file), a base64 data URL,
    // or a raw binary/base64 string (small file stored via legacy path).
    if (typeof rawContent === 'string' && (rawContent.startsWith('/api/') || rawContent.startsWith('http'))) {
      fetch(rawContent)
        .then(r => r.arrayBuffer())
        .then(buf => parse(new Uint8Array(buf), 'array'))
        .catch(e => setParseError(e.message))
    } else if (typeof rawContent === 'string' && rawContent.startsWith('data:')) {
      parse(rawContent.split(',')[1], 'base64')
    } else if (rawContent instanceof Uint8Array || Array.isArray(rawContent)) {
      parse(rawContent, 'array')
    } else {
      try { parse(rawContent, 'base64') }
      catch { try { parse(rawContent, 'binary') } catch (e) { setParseError(e.message) } }
    }
  }, [rawContent])

  const { sheets, sheetNames } = parsedData || { sheets: {}, sheetNames: [] }

  const [activeSheet, setActiveSheet] = useState(0)

  if (!parsedData && !parseError) return (
    <div className="flex items-center justify-center h-full text-white/30 text-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        Parsing spreadsheet…
      </div>
    </div>
  )

  if (parseError) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400/70">
      <AlertTriangle size={32} />
      <div className="text-sm">Failed to parse spreadsheet: {parseError}</div>
    </div>
  )

  const rows = sheets[sheetNames[activeSheet]] || []

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {sheetNames.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 overflow-x-auto scrollbar-none"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
          {sheetNames.map((name, i) => (
            <button key={i} onClick={() => setActiveSheet(i)}
              className="px-3 py-1 rounded text-xs whitespace-nowrap flex-shrink-0 transition-colors"
              style={{
                background: i === activeSheet ? 'rgba(130,80,255,0.35)' : 'rgba(255,255,255,0.07)',
                color: i === activeSheet ? '#e9d5ff' : 'rgba(255,255,255,0.5)',
                border: i === activeSheet ? '1px solid rgba(130,80,255,0.4)' : '1px solid transparent',
              }}>
              {name}
            </button>
          ))}
        </div>
      )}
      <TableViewer rows={rows} zoom={zoom} />
    </div>
  )
}

function PdfViewer({ dataUrl }) {
  const blobUrl = useMemo(() => {
    try {
      // dataUrl is either "data:application/pdf;base64,..." or a raw base64 blob URL
      if (dataUrl.startsWith('data:')) {
        const base64 = dataUrl.split(',')[1]
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return URL.createObjectURL(blob)
      }
    } catch {}
    return dataUrl
  }, [dataUrl])
  useEffect(() => {
    if (blobUrl && blobUrl.startsWith('blob:')) return () => URL.revokeObjectURL(blobUrl)
  }, [blobUrl])
  return (
    <iframe
      src={blobUrl}
      title="PDF Preview"
      className="w-full h-full border-0"
      style={{ background: '#fff' }}
    />
  )
}

function MarkdownViewer({ content, zoom }) {
  // Very lightweight Markdown → HTML renderer (no extra dependency)
  const html = useMemo(() => {
    let s = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    s = s
      .replace(/^#{6} (.+)$/gm, '<h6>$1</h6>')
      .replace(/^#{5} (.+)$/gm, '<h5>$1</h5>')
      .replace(/^#{4} (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`([^`]+)`/g,     '<code>$1</code>')
      .replace(/^> (.+)$/gm,     '<blockquote>$1</blockquote>')
      .replace(/^[-*] (.+)$/gm,  '<li>$1</li>')
      .replace(/^(\d+\.) (.+)$/gm,'<li>$2</li>')
      .replace(/\n{2,}/g, '</p><p>')
    return `<p>${s}</p>`
  }, [content])

  return (
    <div className="overflow-auto h-full">
      <div className="p-6 max-w-3xl mx-auto text-white/85 leading-relaxed"
        style={{ fontSize: `${zoom * 0.9}rem` }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// ── Supported extensions ──────────────────────────────────────────────────────
export const DOC_VIEWER_EXTENSIONS = [
  'txt','log','md','markdown','csv','tsv',
  'json','xml','html','htm','svg',
  'pdf','png','jpg','jpeg','gif','webp','bmp',
  'xlsx','xls','xlsm','ods',
]

// Decode base64/URL-encoded data URLs produced by the Upload button.
// Binary types (images, PDF, spreadsheets) are left as data URLs; text types are decoded.
function decodeDataUrl(s) {
  try {
    const comma = s.indexOf(',')
    if (comma < 0) return s
    const header = s.slice(0, comma)
    const data   = s.slice(comma + 1)
    return header.endsWith(';base64') ? atob(data) : decodeURIComponent(data)
  } catch { return s }
}

const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','webp','bmp','pdf','xlsx','xls','xlsm','ods'])

function detectType(name, content) {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['xlsx','xls','xlsm','ods'].includes(ext)) return 'xlsx'
  if (['html','htm'].includes(ext)) return 'html'
  if (['md','markdown'].includes(ext)) return 'markdown'
  if (['csv','tsv'].includes(ext)) return 'table'
  if (ext === 'json') {
    try { JSON.parse(content); return 'json' } catch {}
    return 'plain'
  }
  return 'plain'
}

// ── Main component ───────────────────────────────────────────────────────────
export default function DocumentViewer({ context }) {
  const _v        = useStore(s => s._fileCacheVersion)
  const readFile  = useStore(s => s.readFile)
  const loadFile  = useStore(s => s.loadFile)
  const fsRoot    = useStore(s => s.fsRoot)
  const [zoom, setZoom]         = useState(1)
  // For large files streamed via raw endpoint
  const [streamedContent, setStreamedContent] = useState(null)
  const [streamError,   setStreamError]   = useState(null)
  const [isStreaming,   setIsStreaming]   = useState(false)
  const [truncated,     setTruncated]     = useState(false)  // file was cut at LARGE_FILE_BYTES

  const fileId   = context?.fileId
  const fileName = useMemo(() => {
    const findName = (node) => {
      if (node.id === fileId) return node.name
      for (const c of (node.children || [])) { const r = findName(c); if (r) return r }
      return null
    }
    return fsRoot ? findName(fsRoot) : ''
  }, [fileId, fsRoot])

  useEffect(() => {
    if (!fileId) return
    setStreamedContent(null); setStreamError(null); setTruncated(false)

    // Find node size from the tree
    const { fsRoot: root } = useStore.getState()
    const findNode = (n, id) => {
      if (n.id === id) return n
      for (const c of n.children || []) { const r = findNode(c, id); if (r) return r }
      return null
    }
    const node = findNode(root, fileId)
    const fileExt_ = (node?.name || '').split('.').pop().toLowerCase()
    const isBinary_ = BINARY_EXTS.has(fileExt_)

    // Binary files: use fsRawUrl directly — avoids the GET /api/fs/content endpoint
    // which reads with UTF-8 encoding and corrupts raw binary data (e.g. images/PDFs
    // larger than 2 MB that were streamed as raw bytes).
    if (isBinary_) {
      const rawUrl = fsRawUrl(fileId, node?.name || '')
      // Store the URL in streamedContent so the render path can use it
      setStreamedContent(rawUrl)
      return
    }

    // Large text files: stream raw bytes directly from server to avoid JSON/heap OOM
    if (node && node.size > LARGE_FILE_BYTES) {
      setIsStreaming(true)
      const url = fsRawUrl(fileId, node.name)
      fetch(url)
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          // Cap at 2 MB — enough for a readable preview without risking browser freeze
          const MAX = 2 * 1024 * 1024
          const reader = res.body.getReader()
          const chunks = []
          let total = 0
          let wasTruncated = false
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (total + value.length > MAX) {
              chunks.push(value.slice(0, MAX - total))
              wasTruncated = true
              reader.cancel()
              break
            }
            chunks.push(value)
            total += value.length
          }
          const byteCount = chunks.reduce((s, c) => s + c.length, 0)
          const allBytes = new Uint8Array(byteCount)
          let offset = 0
          for (const c of chunks) { allBytes.set(c, offset); offset += c.length }
          return { text: new TextDecoder().decode(allBytes), truncated: wasTruncated }
        })
        .then(({ text, truncated: t }) => {
          setStreamedContent(text)
          setTruncated(t)
          setIsStreaming(false)
        })
        .catch(e => { setStreamError(e.message); setIsStreaming(false) })
      return
    }

    // Normal path for small files
    loadFile(fileId)
  }, [fileId]) // eslint-disable-line

  if (!fileId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/30">
        <FileText size={48} className="opacity-30" />
        <div className="text-sm">No file selected</div>
      </div>
    )
  }

  if (isStreaming) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          Loading large file…
        </div>
      </div>
    )
  }

  if (streamError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400/70">
        <AlertTriangle size={32} />
        <div className="text-sm">Failed to load file: {streamError}</div>
      </div>
    )
  }

  // Use streamed content (large files) or cache content (normal files)
  const cachedContent = readFile(fileId)
  if (streamedContent === null && cachedContent === null) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-sm">
        Loading…
      </div>
    )
  }

  const rawContent = streamedContent ?? cachedContent ?? ''

  // Decode base64 data URLs for text-based types (uploaded files are stored as data URLs)
  const fileExt = (fileName || '').split('.').pop().toLowerCase()
  const displayContent = (!BINARY_EXTS.has(fileExt) && rawContent.startsWith('data:'))
    ? decodeDataUrl(rawContent)
    : rawContent

  const type = detectType(fileName, displayContent)

  const downloadFile = () => {
    // For large streamed files, use a direct link to the raw endpoint
    if (streamedContent !== null) {
      const a = document.createElement('a')
      a.href = fsRawUrl(fileId, fileName)
      a.download = fileName || 'document'
      a.click()
      return
    }
    const a = document.createElement('a')
    a.href = displayContent.startsWith('data:') ? displayContent : URL.createObjectURL(new Blob([displayContent]))
    a.download = fileName || 'document'
    a.click()
  }

  const renderContent = () => {
    if (type === 'image') return <ImageViewer dataUrl={displayContent} />
    if (type === 'pdf')   return <PdfViewer dataUrl={displayContent} />
    if (type === 'xlsx')  return <XlsxViewer rawContent={rawContent} fileName={fileName} zoom={zoom} />
    if (type === 'html')  return <HtmlViewer content={displayContent} />
    if (type === 'markdown') return <MarkdownViewer content={displayContent} zoom={zoom} />
    if (type === 'table') {
      const delimiter = (fileName || '').endsWith('.tsv') ? '\t' : ','
      const rows = parseCSV(displayContent, delimiter)
      return <TableViewer rows={rows} zoom={zoom} />
    }
    if (type === 'json') {
      try {
        const pretty = JSON.stringify(JSON.parse(displayContent), null, 2)
        return <PlainTextViewer content={pretty} zoom={zoom} />
      } catch {}
    }
    return <PlainTextViewer content={displayContent} zoom={zoom} />
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(12,12,22,0.97)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,10,20,0.85)' }}>
        <FileText size={14} className="text-white/40 flex-shrink-0" />
        <span className="text-white/70 text-sm truncate flex-1">{fileName || 'Document'}</span>
        <span className="text-white/30 text-xs px-2 py-0.5 rounded-md capitalize flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}>{type}</span>
        {/* Zoom controls - only for text-based types */}
        {['plain','markdown','json','table'].includes(type) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 transition-colors">
              <ZoomOut size={14} />
            </button>
            <span className="text-white/40 text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 transition-colors">
              <ZoomIn size={14} />
            </button>
          </div>
        )}
        <button onClick={downloadFile} title="Download"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 transition-colors flex-shrink-0">
          <Download size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {truncated && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-1 text-[11px] text-amber-300/80"
            style={{ background: 'rgba(120,80,0,0.55)', borderBottom: '1px solid rgba(180,120,0,0.4)' }}>
            <AlertTriangle size={11} />
            Showing first 2 MB of a large file. Download for full content.
            <button onClick={() => setTruncated(false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-300/50 hover:text-amber-300/90 transition-colors"
              title="Dismiss">
              <X size={11} />
            </button>
          </div>
        )}
        {renderContent()}
      </div>
    </div>
  )
}
