import { useState, useEffect, useRef, useCallback } from 'react'
import { Save, FolderOpen, FilePlus, FileText } from 'lucide-react'
import { useStore } from '../store/useStore'

// ── File picker overlay ───────────────────────────────────────────────────────
function FilePicker({ mode, onSelect, onCancel }) {
  const fsRoot  = useStore(s => s.fsRoot)
  const listDir = useStore(s => s.listDir)
  const [cwdStack, setCwdStack] = useState(['root'])
  const cwd = cwdStack[cwdStack.length - 1]
  const navigateTo = (id) => setCwdStack(s => [...s, id])
  const goBack = () => setCwdStack(s => s.length > 1 ? s.slice(0, -1) : s)
  const [selected, setSelected] = useState(null)
  const [newName, setNewName]   = useState('Untitled.txt')
  const items = listDir(cwd)

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
      <div className="w-[420px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'rgba(18,18,30,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          maxHeight: '70vh',
        }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-white font-semibold text-sm">
            {mode === 'save' ? 'Save File' : 'Open File'}
          </span>
          <button onClick={onCancel} className="text-white/40 hover:text-white/70 text-lg leading-none">×</button>
        </div>

        {/* File list */}
        <div className="overflow-y-auto flex-1 p-2">
          {cwdStack.length > 1 && (
            <div className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/8 text-white/50 text-sm"
              onClick={goBack}>
              ← Back
            </div>
          )}
          {items.map(node => (
            <div key={node.id}
              className="flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[13px] transition-colors"
              style={{ background: selected === node.id ? 'rgba(130,80,255,0.25)' : 'transparent' }}
              onClick={() => {
                setSelected(node.id)
                if (mode === 'save' && node.type === 'file') setNewName(node.name)
              }}
              onDoubleClick={() => {
                if (node.type === 'folder') { navigateTo(node.id); setSelected(null) }
                else if (mode === 'open') onSelect(node)
              }}
            >
              {node.type === 'folder'
                ? <span className="text-amber-400">📁</span>
                : <span className="text-blue-300">📄</span>}
              <span className="text-white/80">{node.name}</span>
            </div>
          ))}
        </div>

        {/* Save name input */}
        {mode === 'save' && (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              className="os-input w-full"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="File name..."
              onKeyDown={e => e.key === 'Enter' && newName.trim() && onSelect({ cwd, name: newName.trim() })}
            />
          </div>
        )}

        {/* Footer buttons */}
        <div className="px-4 py-3 flex justify-end gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button
            disabled={mode === 'open' ? !selected : !newName.trim()}
            onClick={() => {
              if (mode === 'open' && selected) {
                const node = items.find(n => n.id === selected)
                if (node) onSelect(node)
              } else if (mode === 'save' && newName.trim()) {
                onSelect({ cwd, name: newName.trim(), existingId: selected })
              }
            }}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-medium disabled:opacity-40 transition-colors"
            style={{ background: 'rgba(130,80,255,0.7)' }}
          >
            {mode === 'save' ? 'Save' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Notepad ───────────────────────────────────────────────────────────────────
export default function Notepad({ windowId, context }) {
  const readFile         = useStore(s => s.readFile)
  const loadFile         = useStore(s => s.loadFile)
  const writeFile        = useStore(s => s.writeFile)
  const createNode       = useStore(s => s.createNode)
  const updateWindowTitle = useStore(s => s.updateWindowTitle)

  const [content, setContent]     = useState('')
  const [fileId, setFileId]       = useState(context?.fileId || null)
  const [fileName, setFileName]   = useState(context?.fileId ? null : 'Untitled')
  const [dirty, setDirty]         = useState(false)
  const [picker, setPicker]       = useState(null) // 'open' | 'save' | 'saveas'
  const textRef                   = useRef(null)

  // Load file on mount if context.fileId
  useEffect(() => {
    if (!context?.fileId) return
    const cached = readFile(context.fileId)
    if (cached) { setContent(cached); setDirty(false); return }
    loadFile(context.fileId).then(text => { setContent(text); setDirty(false) })
  }, [context?.fileId])

  // Update window title when dirty or fileName changes
  useEffect(() => {
    const name = fileName || 'Untitled'
    updateWindowTitle(windowId, `Notepad${fileId || fileName !== 'Untitled' ? ` — ${name}` : ''}${dirty ? ' ●' : ''}`)
  }, [fileName, fileId, dirty, windowId, updateWindowTitle])

  const handleChange = (e) => {
    setContent(e.target.value)
    setDirty(true)
  }

  // ── New ─────────────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    setContent('')
    setFileId(null)
    setFileName('Untitled')
    setDirty(false)
  }, [])

  // ── Save ────────────────────────────────────────────────────────────────
  const doSave = useCallback(() => {
    if (fileId) {
      writeFile(fileId, content)
      setDirty(false)
    } else {
      setPicker('save')
    }
  }, [fileId, content, writeFile])

  const handleSaveAs = () => setPicker('saveas')

  const completeSave = ({ cwd, name, existingId }) => {
    let id = existingId
    if (!id) id = createNode(cwd, 'file', name, content)
    else writeFile(id, content)
    setFileId(id)
    setFileName(name)
    setDirty(false)
    setPicker(null)
  }

  // ── Open ────────────────────────────────────────────────────────────────
  const completeOpen = async (node) => {
    if (node.type !== 'file') return
    const text = await loadFile(node.id)
    setContent(text)
    setFileId(node.id)
    setFileName(node.name)
    setDirty(false)
    setPicker(null)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') { e.preventDefault(); doSave(); return }
      if (e.key === 'n') { e.preventDefault(); handleNew(); return }
      if (e.key === 'o') { e.preventDefault(); setPicker('open'); return }
    }
  }

  return (
    <div className="flex flex-col h-full text-white" style={{ background: 'rgba(18,18,30,0.8)' }}>
      {/* Menu bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(22,22,36,0.9)' }}>
        <MenuBtn label="New"     icon={<FilePlus size={13} />}  onClick={handleNew} hotkey="Ctrl+N" />
        <MenuBtn label="Open"    icon={<FolderOpen size={13} />} onClick={() => setPicker('open')} hotkey="Ctrl+O" />
        <MenuBtn label="Save"    icon={<Save size={13} />}       onClick={doSave} hotkey="Ctrl+S" />
        <MenuBtn label="Save As" icon={<FileText size={13} />}   onClick={handleSaveAs} />

        <div className="flex-1" />
        <span className="text-white/25 text-[11px] pr-2">
          {content.length} chars · {content.split('\n').length} lines
        </span>
      </div>

      {/* Text area */}
      <textarea
        ref={textRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Start typing..."
        className="flex-1 resize-none text-white/85 text-[13.5px] leading-relaxed font-mono p-4 outline-none bg-transparent"
        style={{ caretColor: 'rgba(180,130,255,0.9)' }}
        spellCheck={false}
      />

      {/* File picker overlay */}
      {picker && (
        <FilePicker
          mode={picker === 'open' ? 'open' : 'save'}
          onSelect={picker === 'open' ? completeOpen : completeSave}
          onCancel={() => setPicker(null)}
        />
      )}
    </div>
  )
}

function MenuBtn({ label, icon, onClick, hotkey }) {
  return (
    <button
      onClick={onClick}
      title={hotkey}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-white/65 hover:text-white hover:bg-white/10 text-[12px] transition-colors"
    >
      {icon}
      {label}
    </button>
  )
}
