import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore, SYSTEM_FOLDER_NAMES } from '../store/useStore'
import { BRANDING } from '../config.js'

const PROMPT_BASE = `${BRANDING.name.toLowerCase()}@os`

// Parse a shell-style command line, respecting single/double quoted strings
function parseCommandLine(input) {
  const args = []
  let cur = ''
  let inQuote = false
  let quote = ''
  for (const ch of input) {
    if (inQuote) {
      if (ch === quote) inQuote = false
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quote = ch
    } else if (ch === ' ') {
      if (cur) { args.push(cur); cur = '' }
    } else {
      cur += ch
    }
  }
  if (cur) args.push(cur)
  return args
}

// ── Built-in commands ─────────────────────────────────────────────────────────
function buildCommands(getState, cwd, setCwd) {
  const resolve = (path) => {
    if (!path || path === '~') return 'root'
    const state = getState()
    const fsRoot = state.fsRoot
    const findByPath = (node, parts) => {
      if (!parts.length) return node
      const [head, ...rest] = parts
      if (head === '..') {
        const findParent = (root, targetId, parent = null) => {
          if (root.id === targetId) return parent
          for (const c of root.children || []) {
            const p = findParent(c, targetId, root)
            if (p) return p
          }
          return null
        }
        const parent = findParent(fsRoot, node.id) || fsRoot
        return findByPath(parent, rest)
      }
      const child = (node.children || []).find(c => c.name === head)
      if (!child) return null
      return findByPath(child, rest)
    }
    const parts = path.replace(/^\//, '').split('/').filter(Boolean)
    // Absolute paths start from root; relative paths start from current cwd node
    const isAbsolute = path.startsWith('/')
    const startNode = isAbsolute ? fsRoot : (() => {
      const find = (n) => { if (n.id === cwd) return n; for (const c of n.children||[]) { const f=find(c); if(f) return f } return null }
      return find(fsRoot) || fsRoot
    })()
    return findByPath(startNode, parts)?.id || null
  }

  const getNodeName = (id) => {
    const find = (node) => {
      if (node.id === id) return node.name
      for (const c of node.children || []) { const n = find(c); if (n) return n }
      return null
    }
    return find(getState().fsRoot) || id
  }

  const getCwdPath = (id) => {
    if (id === 'root') return '~'
    const build = (node, targetId, soFar) => {
      if (node.id === targetId) return soFar + '/' + node.name
      for (const c of node.children || []) {
        const p = build(c, targetId, soFar + '/' + node.name)
        if (p) return p
      }
      return null
    }
    return build(getState().fsRoot, id, '') || '~'
  }

  return {
    _getCwdPath: getCwdPath,

    help: () => `Available commands:
  ls        - list directory contents
  cd <dir>  - change directory (cd .. goes up)
  pwd       - print working directory
  mkdir <n> - create folder
  touch <n> - create file
  cat <n>   - read file contents
  rm <n>    - delete file/folder
  echo <t>  - print text
  open <n>  - open in app
  date      - current date/time
  clear     - clear terminal
  help      - show this help`,

    ls: () => {
      const items = getState().listDir(cwd)
      if (!items.length) return '(empty directory)'
      return { __ls: true, items: items.map(i => ({ name: i.name, isFolder: i.type === 'folder' })) }
    },

    pwd: () => {
      if (cwd === 'root') return '/Home'
      const path = getCwdPath(cwd)
      return path.startsWith('/') ? path : '/' + path
    },

    cd: (args) => {
      const dir = args.join(' ')  // join so paths with spaces work: cd New Folder
      if (!dir || dir === '~') { setCwd('root'); return '' }
      const targetId = resolve(dir)
      if (!targetId) return `cd: ${dir}: No such directory`
      const find = (n) => { if (n.id === targetId) return n; for (const c of n.children||[]) { const f=find(c); if(f) return f } return null }
      const node = find(getState().fsRoot)
      if (node?.type !== 'folder') return `cd: ${dir}: Not a directory`
      setCwd(targetId)
      return ''
    },

    mkdir: (args) => {
      const name = args.join(' ')
      if (!name) return 'Usage: mkdir <name>'
      getState().createNode(cwd, 'folder', name)
      return `Created folder: ${name}`
    },

    touch: (args) => {
      const name = args.join(' ')
      if (!name) return 'Usage: touch <name>'
      getState().createNode(cwd, 'file', name, '')
      return `Created file: ${name}`
    },

    cat: (args) => {
      const name = args.join(' ')
      const items = getState().listDir(cwd)
      const file = items.find(i => i.name === name && i.type === 'file')
      if (!file) return `cat: ${name}: No such file`
      return getState().readFile(file.id) || '(empty file)'
    },

    rm: (args) => {
      const name = args.join(' ')
      const items = getState().listDir(cwd)
      const node = items.find(i => i.name === name)
      if (!node) return `rm: ${name}: No such file or directory`
      if (node.type === 'folder' && cwd === 'root' && SYSTEM_FOLDER_NAMES.includes(node.name))
        return { __error: true, text: `rm: Cannot remove built-in system folders!` }
      getState().deleteNode(node.id)
      return `Removed: ${name}`
    },

    echo: (args) => args.join(' '),

    date: () => {
      const { settings } = getState()
      const tz = settings?.timezone
      return new Date().toLocaleString('en-US', tz ? { timeZone: tz, dateStyle: 'full', timeStyle: 'long' } : { dateStyle: 'full', timeStyle: 'long' })
    },

    open: (args) => {
      const name = args.join(' ')
      const items = getState().listDir(cwd)
      const node = items.find(i => i.name === name)
      if (!node) return `open: ${name}: No such file or directory`
      if (node.type === 'folder') {
        getState().openWindow('files', 'files', 'My Files', { folderId: node.id })
      } else {
        getState().openWindow('notes-' + node.id, 'notes', node.name, { fileId: node.id })
      }
      return `Opening ${name}…`
    },
  }
}

// ── Terminal ──────────────────────────────────────────────────────────────────
export default function Terminal({ windowId }) {
  const getState = useStore.getState
  const [lines, setLines]   = useState([{ type: 'output', text: `${BRANDING.name} Terminal v${BRANDING.version} — type "help" for commands` }])
  const [input, setInput]   = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const [cwd, setCwd]       = useState('root')
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const commands = buildCommands(getState, cwd, setCwd)

  // Dynamic prompt based on cwd
  const cwdLabel = cwd === 'root' ? '~' : (commands._getCwdPath(cwd) || '~')
  const PROMPT = `${PROMPT_BASE}:${cwdLabel}$ `

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const appendLines = (newLines) => setLines(l => [...l, ...newLines])

  const execute = useCallback((raw) => {
    const trimmed = raw.trim()
    const prompt = `${PROMPT_BASE}:${commands._getCwdPath(cwd) || '~'}$ `
    appendLines([{ type: 'prompt', text: prompt + trimmed }])
    if (!trimmed) return

    setHistory(h => [trimmed, ...h].slice(0, 50))
    setHistIdx(-1)

    if (trimmed === 'clear') { setLines([]); return }

    const [cmd, ...args] = parseCommandLine(trimmed)
    const fn = commands[cmd]
    if (!fn) {
      appendLines([{ type: 'error', text: `command not found: ${cmd}` }])
      return
    }
    const out = fn(args)
    if (out && typeof out === 'object' && out.__ls) {
      appendLines([{ type: 'ls', items: out.items }])
    } else if (out && typeof out === 'object' && out.__error) {
      appendLines([{ type: 'error', text: out.text }])
    } else if (out) {
      String(out).split('\n').forEach(line =>
        appendLines([{ type: 'output', text: line }])
      )
    }
  }, [cwd, commands])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      execute(input)
      setInput('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Find command and partial argument
      const raw = input.trimStart()
      const spaceIdx = raw.indexOf(' ')
      if (spaceIdx === -1) return  // nothing after command yet — no completion
      const cmd = raw.slice(0, spaceIdx)
      const PATH_CMDS = ['cd', 'cat', 'rm', 'open', 'touch']
      if (!PATH_CMDS.includes(cmd)) return
      // Treat everything after the command as the partial path (strip leading open-quote)
      const partial = raw.slice(spaceIdx + 1).replace(/^["']/, '')
      const items = getState().listDir(cwd)
      // cd only completes folders; others complete all items
      const candidates = cmd === 'cd' ? items.filter(i => i.type === 'folder') : items
      const matches = candidates.filter(i => i.name.toLowerCase().startsWith(partial.toLowerCase()))
      if (!matches.length) return
      if (matches.length === 1) {
        const n = matches[0].name
        setInput(cmd + ' ' + (n.includes(' ') ? `"${n}"` : n))
      } else {
        setLines(l => [...l, { type: 'ls', items: matches.map(m => ({ name: m.name, isFolder: m.type === 'folder' })) }])
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(newIdx)
      setInput(history[newIdx] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(histIdx - 1, -1)
      setHistIdx(newIdx)
      setInput(newIdx === -1 ? '' : history[newIdx])
    }
  }

  return (
    <div
      className="flex flex-col h-full font-mono text-[13px] leading-relaxed"
      style={{ background: 'rgba(12,12,20,0.95)', color: '#d4d4d4' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output */}
      <div className="flex-1 overflow-y-auto p-3 pb-0">
        {lines.map((line, i) => (
          line.type === 'ls' ? (
            <div key={i} className="flex flex-wrap gap-x-4" style={{ whiteSpace: 'pre-wrap' }}>
              {line.items.map((item, j) => (
                <span key={j} style={{ color: item.isFolder ? '#fbbf24' : '#d4d4d4' }}>
                  {item.name}{item.isFolder ? '/' : ''}
                </span>
              ))}
            </div>
          ) : (
            <div key={i} style={{
              color: line.type === 'prompt' ? '#a78bfa'
                : line.type === 'error' ? '#f87171'
                : '#d4d4d4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {line.text}
            </div>
          )
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex items-center px-3 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#a78bfa' }}>{PROMPT}</span>
        {' '}
        <input
          ref={inputRef}
          autoFocus
          className="flex-1 bg-transparent outline-none text-[13px]"
          style={{ color: '#e2e8f0', caretColor: '#a78bfa' }}
          value={input}
          onChange={e => { setInput(e.target.value); setHistIdx(-1) }}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize={"none"}
        />
      </div>
    </div>
  )
}
