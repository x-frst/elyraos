import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Pencil, Eraser, Square, Circle, Minus, Type, Pipette,
  Undo2, Redo2, Trash2, Download, Save, FolderOpen,
  Minus as MinusIcon, Plus,
} from 'lucide-react'
import { useStore, findNode } from '../store/useStore'
import { fsUploadStream, fsRawUrl } from '../utils/db'

const PALETTE = [
  '#000000','#ffffff','#ef4444','#f97316','#eab308','#22c55e',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#6366f1',
  '#64748b','#a3a3a3','#7c3aed','#0ea5e9',
]

const TOOLS = [
  { id: 'pencil',    icon: Pencil,  label: 'Pencil'  },
  { id: 'eraser',    icon: Eraser,  label: 'Eraser'  },
  { id: 'line',      icon: Minus,   label: 'Line'    },
  { id: 'rect',      icon: Square,  label: 'Rectangle' },
  { id: 'ellipse',   icon: Circle,  label: 'Ellipse' },
  { id: 'fill',      icon: Pipette, label: 'Fill'    },
  { id: 'text',      icon: Type,    label: 'Text'    },
]

const MAX_HISTORY = 30
const CANVAS_W = 1200
const CANVAS_H = 800

export default function Paint({ context }) {
  const canvasRef     = useRef(null)
  const overlayRef    = useRef(null) // live preview for shapes
  const containerRef  = useRef(null)

  const [tool, setTool]         = useState('pencil')
  const [color, setColor]       = useState('#000000')
  const [bg, setBg]             = useState('#ffffff')
  const [lineWidth, setLineWidth] = useState(4)
  const [history, setHistory]   = useState([])
  const [future, setFuture]     = useState([])
  const [textInput, setTextInput] = useState({ active: false, x: 0, y: 0, value: '' })
  const [activeColor, setActiveColor] = useState('fg') // 'fg' | 'bg'
  const [savedMsg, setSavedMsg] = useState('')

  const drawing  = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })

  const createNodeEntry = useStore(s => s.createNodeEntry)
  const updateNodeSize  = useStore(s => s.updateNodeSize)
  const fsRoot          = useStore(s => s.fsRoot)
  const listDir         = useStore(s => s.listDir)

  const getPicturesId = () => {
    const roots = listDir('root')
    return roots.find(n => n.name === 'Pictures' && n.type === 'folder')?.id || 'root'
  }

  const getCtx = () => canvasRef.current?.getContext('2d')

  // Push current canvas state to history
  const pushHistory = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const dataUrl = canvas.toDataURL()
    setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), dataUrl])
    setFuture([])
  }

  // Init canvas — load via raw-bytes URL so binary PNG files are never corrupted
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')

    if (context?.fileId) {
      const node = findNode(fsRoot, context.fileId)
      if (node) {
        const img = new Image()
        img.onload = () => { ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); ctx.drawImage(img, 0, 0) }
        img.src = fsRawUrl(context.fileId, node.name)
        return
      }
    }
    // blank white canvas
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }, [context?.fileId]) // eslint-disable-line

  // ── Canvas coordinate helper (accounts for CSS scaling) ─────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    }
  }

  // ── Fill tool (flood fill) ───────────────────────────────────────────────
  const floodFill = (x, y, fillColor) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
    const data = imageData.data
    const ix = Math.round(x), iy = Math.round(y)
    const idx = (iy * CANVAS_W + ix) * 4
    const target = [data[idx], data[idx+1], data[idx+2], data[idx+3]]

    const hexToRgb = hex => {
      const r = parseInt(hex.slice(1,3),16)
      const g = parseInt(hex.slice(3,5),16)
      const b = parseInt(hex.slice(5,7),16)
      return [r,g,b,255]
    }
    const fill = hexToRgb(fillColor)
    if (target.every((v,i) => v === fill[i])) return

    const match = (i) => data[i]===target[0] && data[i+1]===target[1] && data[i+2]===target[2] && data[i+3]===target[3]
    const setPixel = (i) => { data[i]=fill[0]; data[i+1]=fill[1]; data[i+2]=fill[2]; data[i+3]=fill[3] }

    const stack = [[ix, iy]]
    while (stack.length) {
      const [cx, cy] = stack.pop()
      if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= CANVAS_H) continue
      const ci = (cy * CANVAS_W + cx) * 4
      if (!match(ci)) continue
      setPixel(ci)
      stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1])
    }
    ctx.putImageData(imageData, 0, 0)
  }

  // ── Draw: overlay preview for shapes ────────────────────────────────────
  const drawPreview = (x, y) => {
    const overlay = overlayRef.current; if (!overlay) return
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    const sx = startPos.current.x, sy = startPos.current.y
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.setLineDash([])
    if (tool === 'line') {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke()
    } else if (tool === 'rect') {
      ctx.strokeRect(sx, sy, x - sx, y - sy)
    } else if (tool === 'ellipse') {
      ctx.beginPath()
      ctx.ellipse(sx + (x-sx)/2, sy + (y-sy)/2, Math.abs(x-sx)/2, Math.abs(y-sy)/2, 0, 0, Math.PI*2)
      ctx.stroke()
    }
  }

  const commitShape = (x, y) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const overlay = overlayRef.current
    if (overlay) overlay.getContext('2d').clearRect(0, 0, CANVAS_W, CANVAS_H)
    const sx = startPos.current.x, sy = startPos.current.y
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    if (tool === 'line') {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke()
    } else if (tool === 'rect') {
      ctx.strokeRect(sx, sy, x - sx, y - sy)
    } else if (tool === 'ellipse') {
      ctx.beginPath()
      ctx.ellipse(sx + (x-sx)/2, sy + (y-sy)/2, Math.abs(x-sx)/2, Math.abs(y-sy)/2, 0, 0, Math.PI*2)
      ctx.stroke()
    }
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const pos = getPos(e)
    startPos.current = pos
    drawing.current = true
    pushHistory()

    if (tool === 'fill') {
      floodFill(pos.x, pos.y, color)
      drawing.current = false; return
    }
    if (tool === 'text') {
      setTextInput({ active: true, x: pos.x, y: pos.y, value: '' })
      drawing.current = false; return
    }
    if (tool === 'pencil' || tool === 'eraser') {
      const ctx = getCtx(); if (!ctx) return
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = color
      }
      ctx.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
  }

  const onPointerMove = (e) => {
    if (!drawing.current) return
    const pos = getPos(e)
    if (tool === 'pencil' || tool === 'eraser') {
      const ctx = getCtx(); if (!ctx) return
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else if (['line','rect','ellipse'].includes(tool)) {
      drawPreview(pos.x, pos.y)
    }
  }

  const onPointerUp = (e) => {
    if (!drawing.current) return
    drawing.current = false
    const pos = getPos(e)
    if (['line','rect','ellipse'].includes(tool)) commitShape(pos.x, pos.y)
    if (tool === 'pencil' || tool === 'eraser') {
      const ctx = getCtx()
      if (ctx) ctx.globalCompositeOperation = 'source-over'
      ctx?.closePath()
    }
  }

  const undo = () => {
    if (!history.length) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const prev = history[history.length - 1]
    const current = canvas.toDataURL()
    setFuture(f => [current, ...f])
    setHistory(h => h.slice(0, -1))
    const img = new Image()
    img.onload = () => { ctx.clearRect(0,0,CANVAS_W,CANVAS_H); ctx.drawImage(img,0,0) }
    img.src = prev
  }

  const redo = () => {
    if (!future.length) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const next = future[0]
    const current = canvas.toDataURL()
    setHistory(h => [...h, current])
    setFuture(f => f.slice(1))
    const img = new Image()
    img.onload = () => { ctx.clearRect(0,0,CANVAS_W,CANVAS_H); ctx.drawImage(img,0,0) }
    img.src = next
  }

  const clearCanvas = () => {
    pushHistory()
    const ctx = getCtx(); if (!ctx) return
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  const commitText = () => {
    if (!textInput.value.trim()) { setTextInput({ active: false, x: 0, y: 0, value: '' }); return }
    pushHistory()
    const ctx = getCtx(); if (!ctx) return
    ctx.fillStyle = color
    ctx.font = `${lineWidth * 4 + 8}px system-ui`
    ctx.fillText(textInput.value, textInput.x, textInput.y)
    setTextInput({ active: false, x: 0, y: 0, value: '' })
  }

  const saveFile = () => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      if (context?.fileId) {
        // Overwrite existing file with raw PNG bytes (no base64 encoding)
        fsUploadStream(context.fileId, blob, null, null)
          .then(() => updateNodeSize(context.fileId, blob.size))
          .catch(() => {})
        setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
      } else {
        const nodeId = createNodeEntry(getPicturesId(), 'drawing.png')
        fsUploadStream(nodeId, blob, null, null)
          .then(() => updateNodeSize(nodeId, blob.size))
          .catch(() => {})
        setSavedMsg('Saved to Pictures'); setTimeout(() => setSavedMsg(''), 2000)
      }
    }, 'image/png')
  }

  const downloadFile = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'drawing.png'
    a.click()
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(12,12,22,0.97)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,10,20,0.85)' }}>

        {/* Tools */}
        <div className="flex items-center gap-0.5 mr-2">
          {TOOLS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} title={t.label} onClick={() => setTool(t.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{ background: tool === t.id ? 'rgba(130,80,255,0.4)' : 'rgba(255,255,255,0.06)', color: tool === t.id ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
                <Icon size={15} />
              </button>
            )
          })}
        </div>

        <div className="w-px h-6 mr-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Stroke width */}
        <div className="flex items-center gap-1 mr-2">
          <button onClick={() => setLineWidth(w => Math.max(1, w - 1))}
            className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white/80">
            <MinusIcon size={12} />
          </button>
          <span className="text-white/60 text-xs w-5 text-center">{lineWidth}</span>
          <button onClick={() => setLineWidth(w => Math.min(40, w + 1))}
            className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white/80">
            <Plus size={12} />
          </button>
        </div>

        <div className="w-px h-6 mr-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Color swatches */}
        <div className="flex items-center gap-1 mr-2 flex-wrap">
          {PALETTE.map(c => (
            <button key={c} title={c} onClick={() => {
              if (activeColor === 'bg') setBg(c); else setColor(c)
            }}
              className="w-5 h-5 rounded-md border transition-all"
              style={{ background: c, borderColor: (activeColor === 'fg' ? color : bg) === c ? 'white' : 'rgba(255,255,255,0.15)' }} />
          ))}
        </div>

        {/* FG/BG selector */}
        <div className="relative w-8 h-8 mr-2 flex-shrink-0">
          {/* BG */}
          <div className="absolute bottom-0 right-0 w-5 h-5 rounded cursor-pointer border border-white/20"
            style={{ background: bg }}
            onClick={() => setActiveColor(a => a === 'bg' ? 'fg' : 'bg')} />
          {/* FG */}
          <div className="absolute top-0 left-0 w-5 h-5 rounded cursor-pointer border border-white/20"
            style={{ background: color }}
            onClick={() => setActiveColor(a => a === 'fg' ? 'bg' : 'fg')} />
        </div>

        {/* Custom color picker */}
        <label className="relative flex items-center cursor-pointer mr-2" title="Custom color">
          <input type="color" value={activeColor === 'bg' ? bg : color}
            onChange={e => { if (activeColor === 'bg') setBg(e.target.value); else setColor(e.target.value) }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          <div className="w-7 h-7 rounded-lg border border-white/20"
            style={{ background: `linear-gradient(135deg, ${color}, ${bg})` }} />
        </label>

        <div className="w-px h-6 mr-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button onClick={undo} title="Undo" disabled={!history.length}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 disabled:opacity-30">
            <Undo2 size={15} />
          </button>
          <button onClick={redo} title="Redo" disabled={!future.length}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 disabled:opacity-30">
            <Redo2 size={15} />
          </button>
          <button onClick={clearCanvas} title="Clear"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-red-400 transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={saveFile} title="Save to Files"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80">
            <Save size={15} />
          </button>
          <button onClick={downloadFile} title="Download PNG"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white/80">
            <Download size={15} />
          </button>
          {savedMsg && <span className="text-emerald-400 text-xs ml-1">{savedMsg}</span>}
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef}
        className="flex-1 overflow-auto p-4"
        style={{ background: 'rgba(40,40,55,0.7)', cursor: tool === 'text' ? 'text' : 'crosshair' }}>
        <div className="relative mx-auto" style={{ width: CANVAS_W, height: CANVAS_H, boxShadow: '0 4px 32px rgba(0,0,0,0.5)', background: '#ffffff' }}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            className="absolute inset-0"
            style={{ touchAction: 'none', background: '#ffffff' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {/* Shape preview overlay */}
          <canvas ref={overlayRef} width={CANVAS_W} height={CANVAS_H}
            className="absolute inset-0 pointer-events-none"
            style={{ imageRendering: 'pixelated' }}
          />
          {/* Text input overlay */}
          {textInput.active && (
            <input
              autoFocus
              value={textInput.value}
              onChange={e => setTextInput(t => ({ ...t, value: e.target.value }))}
              onBlur={commitText}
              onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextInput({ active: false, x: 0, y: 0, value: '' }) }}
              className="absolute bg-transparent outline-none border-dashed border border-white/40"
              style={{
                left: textInput.x,
                top: textInput.y - (lineWidth * 4 + 8),
                color,
                fontSize: lineWidth * 4 + 8,
                fontFamily: 'system-ui',
                minWidth: 100,
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
