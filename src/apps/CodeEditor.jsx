import { useState, useRef, useEffect, useCallback } from "react"
import { Save, ChevronDown, Copy, Download, FolderOpen, Play, Square, X, Terminal } from "lucide-react"
import { useStore, findNode } from "../store/useStore"
import Prism from "prismjs"
import "prismjs/components/prism-javascript"
import "prismjs/components/prism-jsx"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-tsx"
import "prismjs/components/prism-python"
import "prismjs/components/prism-markup"
import "prismjs/components/prism-css"
import "prismjs/components/prism-json"
import "prismjs/components/prism-markdown"
import PyodideWorker from "../workers/pyodide.worker.js?worker"

// ── Prism token colour theme (inlined — avoids global CSS conflicts) ──────────
const PRISM_THEME = `
.ce-hl .token.comment,.ce-hl .token.prolog,.ce-hl .token.doctype,.ce-hl .token.cdata{color:#6a737d;font-style:italic}
.ce-hl .token.punctuation{color:#e1e4e8}
.ce-hl .token.namespace{opacity:.7}
.ce-hl .token.tag,.ce-hl .token.deleted{color:#f97583}
.ce-hl .token.attr-name{color:#b392f0}
.ce-hl .token.boolean,.ce-hl .token.number{color:#f8c555}
.ce-hl .token.function,.ce-hl .token.function-name{color:#79b8ff}
.ce-hl .token.property,.ce-hl .token.class-name,.ce-hl .token.constant,.ce-hl .token.symbol{color:#e3b341}
.ce-hl .token.selector,.ce-hl .token.atrule,.ce-hl .token.keyword,.ce-hl .token.builtin{color:#f97583}
.ce-hl .token.string,.ce-hl .token.char,.ce-hl .token.attr-value,.ce-hl .token.regex{color:#9ecbff}
.ce-hl .token.variable,.ce-hl .token.template-string,.ce-hl .token.template-punctuation{color:#9ecbff}
.ce-hl .token.operator,.ce-hl .token.entity,.ce-hl .token.url{color:#79b8ff}
.ce-hl .token.inserted{color:#85e89d}
.ce-hl .token.important,.ce-hl .token.bold{font-weight:bold}
.ce-hl .token.italic{font-style:italic}
.ce-hl pre,.ce-hl code{background:none!important}
`

// ── Language definitions ──────────────────────────────────────────────────────
const LANGUAGES = [
  { id: "js",   label: "JavaScript", ext: "js",   prism: "javascript", runnable: true  },
  { id: "jsx",  label: "JSX",        ext: "jsx",  prism: "jsx",        runnable: false },
  { id: "ts",   label: "TypeScript", ext: "ts",   prism: "typescript", runnable: true  },
  { id: "tsx",  label: "TSX",        ext: "tsx",  prism: "tsx",        runnable: false },
  { id: "py",   label: "Python",     ext: "py",   prism: "python",     runnable: true  },
  { id: "html", label: "HTML",       ext: "html", prism: "markup",     runnable: false },
  { id: "css",  label: "CSS",        ext: "css",  prism: "css",        runnable: false },
  { id: "json", label: "JSON",       ext: "json", prism: "json",       runnable: false },
  { id: "md",   label: "Markdown",   ext: "md",   prism: "markdown",   runnable: false },
  { id: "txt",  label: "Plain Text", ext: "txt",  prism: null,         runnable: false },
]

// ── Default code snippets ─────────────────────────────────────────────────────
const DEFAULT_SNIPPETS = {
  js: `// JavaScript
function greet(name) {
  const msg = \`Hello, \${name}!\`
  console.log(msg)
  return msg
}

greet("World")
console.log("Sum:", [1, 2, 3].reduce((a, b) => a + b, 0))
`,
  jsx: `// JSX — React component example
function Greeting({ name = "World" }) {
  return (
    <div style={{ color: "rebeccapurple" }}>
      <h1>Hello, {name}!</h1>
      <p>This is a JSX component.</p>
    </div>
  )
}

// Paste this into your React app
export default Greeting
`,
  ts: `// TypeScript
interface Person {
  name: string
  age: number
}

function greet(person: Person): string {
  const msg = \`Hello, \${person.name}! You are \${person.age} years old.\`
  console.log(msg)
  return msg
}

greet({ name: "World", age: 25 })
`,
  tsx: `// TSX — React + TypeScript component
interface Props {
  name: string
  color?: string
}

function Greeting({ name, color = "rebeccapurple" }: Props) {
  return (
    <div style={{ color }}>
      <h1>Hello, {name}!</h1>
    </div>
  )
}

export default Greeting
`,
  py: `# Python
from typing import List

def greet(name: str) -> str:
    msg = f"Hello, {name}!"
    print(msg)
    return msg

def sum_list(nums: List[int]) -> int:
    return sum(nums)

greet("World")
print("Sum:", sum_list([1, 2, 3, 4, 5]))
`,
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Page</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    h1   { color: rebeccapurple; }
  </style>
</head>
<body>
  <h1>Hello, World!</h1>
  <p>Edit this file to build your page.</p>
</body>
</html>
`,
  css: `/* CSS Styles */
:root {
  --primary: rebeccapurple;
  --bg: #0d1117;
  --text: #e6edf3;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, sans-serif;
}

h1 { color: var(--primary); }
`,
  json: `{
  "name": "my-project",
  "version": "1.0.0",
  "description": "An awesome project",
  "scripts": {
    "start": "node index.js",
    "dev": "vite"
  }
}
`,
  md: `# Markdown Document

## Introduction

This is a **Markdown** document. You can use *italics*, **bold**, and \`inline code\`.

\`\`\`js
console.log("Hello, World!")
\`\`\`

- Item 1
- Item 2
- Item 3
`,
  txt: `Plain text document.
`,
}

// ── OS File Picker (mirrors Notepad's FilePicker) ─────────────────────────────
function FilePicker({ onSelect, onCancel }) {
  const listDir = useStore(s => s.listDir)
  const [cwdStack, setCwdStack] = useState(["root"])
  const cwd = cwdStack[cwdStack.length - 1]
  const navigateTo = (id) => setCwdStack(s => [...s, id])
  const goBack = () => setCwdStack(s => s.length > 1 ? s.slice(0, -1) : s)
  const [selected, setSelected] = useState(null)
  const items = listDir(cwd)

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
      <div className="w-[420px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(18,18,30,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          maxHeight: "70vh",
        }}>
        <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-white font-semibold text-sm">Open File</span>
          <button onClick={onCancel} className="text-white/40 hover:text-white/70 text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {cwdStack.length > 1 && (
            <div className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/8 text-white/50 text-sm"
              onClick={goBack}>← Back</div>
          )}
          {items.map(node => (
            <div key={node.id}
              className="flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[13px] transition-colors"
              style={{ background: selected === node.id ? "rgba(130,80,255,0.25)" : "transparent" }}
              onClick={() => { if (node.type === "file") setSelected(node.id) }}
              onDoubleClick={() => {
                if (node.type === "folder") { navigateTo(node.id); setSelected(null) }
                else onSelect(node)
              }}>
              {node.type === "folder"
                ? <span className="text-amber-400">📁</span>
                : <span className="text-blue-300">📄</span>}
              <span className="text-white/80">{node.name}</span>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-8 text-white/25 text-[12px]">Empty folder</div>
          )}
        </div>
        <div className="px-4 py-3 flex justify-end gap-2 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button disabled={!selected}
            onClick={() => { const node = items.find(n => n.id === selected); if (node) onSelect(node) }}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-medium disabled:opacity-40 transition-colors"
            style={{ background: "rgba(130,80,255,0.7)" }}>
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Line numbers ──────────────────────────────────────────────────────────────
function LineNumbers({ lines, lineHeight }) {
  return (
    <div className="select-none text-right pr-3 pl-3 text-white/20 flex-shrink-0"
      style={{ minWidth: 48, fontFamily: "monospace", fontSize: 13, lineHeight: `${lineHeight}px`, paddingTop: 12, userSelect: "none" }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{ height: lineHeight }}>{i + 1}</div>
      ))}
    </div>
  )
}

// ── Sandboxed JS runner ───────────────────────────────────────────────────────
function runJavaScript(code, onLine, onDone) {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("sandbox", "allow-scripts")
  iframe.style.display = "none"
  document.body.appendChild(iframe)

  let done = false
  const cleanup = () => {
    if (done) return; done = true
    window.removeEventListener("message", msgHandler)
    try { document.body.removeChild(iframe) } catch {}
  }

  const msgHandler = (e) => {
    if (e.source !== iframe.contentWindow) return
    const { type, args, message } = e.data || {}
    if (type === "log")  args?.forEach(a => onLine(a, "log"))
    if (type === "warn") args?.forEach(a => onLine(a, "warn"))
    if (type === "error") onLine(message || String(args?.[0] ?? ""), "error")
    if (type === "done")  { cleanup(); onDone() }
  }
  window.addEventListener("message", msgHandler)
  const killTimer = setTimeout(() => { cleanup(); onDone() }, 30000)

  iframe.srcdoc = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">
<script>
const _p=(t,a,m)=>parent.postMessage({type:t,args:a,message:m},'*');
['log','info','debug'].forEach(m=>{const o=console[m];console[m]=(...a)=>{_p('log',a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)));o?.call(console,...a);};});
console.warn=(...a)=>{_p('warn',a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)));};
console.error=(...a)=>{_p('error',null,a.map(x=>String(x)).join(' '));};
window.onerror=(m)=>{_p('error',null,String(m));_p('done');return true;};
window.onunhandledrejection=(e)=>{_p('error',null,String(e.reason?.message||e.reason));};
</script></head><body><script>
;(async()=>{try{
${code}
_p('done');}catch(e){_p('error',null,e.message||String(e));_p('done');}
})();
</script></body></html>`

  iframe.onload = () => clearTimeout(killTimer)
  return cleanup
}

// ── TypeScript runner (compile via CDN then run) ───────────────────────────────
async function runTypeScript(code, onLine, onDone) {
  onLine("Compiling TypeScript…", "info")
  try {
    if (!window.__ts_loaded) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "https://cdn.jsdelivr.net/npm/typescript@5.7.3/lib/typescript.js"
        script.onload = resolve
        script.onerror = () => reject(new Error("Failed to load TypeScript compiler"))
        document.head.appendChild(script)
      })
      window.__ts_loaded = true
    }
    const ts = window.ts
    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
        strict: false,
      },
    })
    onLine("TypeScript compiled successfully.", "info")
    return runJavaScript(result.outputText, onLine, onDone)
  } catch (e) {
    onLine("TypeScript error: " + e.message, "error")
    onDone()
    return () => {}
  }
}

// ── Python runner via Web Worker (prevents main-thread freeze / "page unresponsive") ─────
let _pyWorker = null

function getPyWorker() {
  if (!_pyWorker) _pyWorker = new PyodideWorker()
  return _pyWorker
}

async function runPython(code, onLine, onDone) {
  const worker = getPyWorker()
  const listener = ({ data }) => {
    const { type, text } = data
    if (type === "loading") onLine("Loading Python 3 runtime… (first run only, ~10 MB)", "info")
    else if (type === "ready")  onLine("Python runtime ready.", "info")
    else if (type === "stdout") onLine(text, "log")
    else if (type === "stderr") onLine(text, "error")
    else if (type === "error")  onLine(text, "error")
    else if (type === "done")   { worker.removeEventListener("message", listener); onDone() }
  }
  worker.addEventListener("message", listener)
  worker.postMessage({ type: "run", code })
  return () => {
    worker.removeEventListener("message", listener)
    _pyWorker?.terminate()
    _pyWorker = null
    onDone()
  }
}

// ── Main component ────────────────────────────────────────────────────────────

/** Resolve initial editor state from context or VFS, same logic as changeLang. */
function resolveInitialState(context) {
  // Opened from a specific file context
  if (context?.fileId) {
    const state = useStore.getState()
    const node  = findNode(state.fsRoot, context.fileId)
    const ext   = node?.name.split(".").pop()?.toLowerCase() ?? "js"
    const lang  = LANGUAGES.find(l => l.ext === ext)?.id ?? "js"
    const topFolders = state.fsRoot.children || []
    const folder = topFolders.find(f => findNode(f, context.fileId))
    return {
      code:        state.readFile(context.fileId) ?? context?.content ?? DEFAULT_SNIPPETS[lang] ?? "",
      lang,
      fileName:    node?.name ?? "untitled.js",
      saved:       true,
      savedFolder: folder?.name ?? null,
      openFileId:  context.fileId,
    }
  }
  // No context — check if untitled.js already exists in VFS
  const state      = useStore.getState()
  const defaultExt = "js"
  const defaultFileName = `untitled.${defaultExt}`
  for (const folderName of ["Projects", "Documents"]) {
    const folder = (state.fsRoot.children || []).find(n => n.name === folderName)
    if (!folder) continue
    const existing = (folder.children || []).find(n => n.name === defaultFileName && n.type === "file")
    if (existing) {
      return {
        code:        state.readFile(existing.id) ?? DEFAULT_SNIPPETS.js,
        lang:        "js",
        fileName:    defaultFileName,
        saved:       true,
        savedFolder: folderName,
        openFileId:  existing.id,
      }
    }
  }
  // Fresh unsaved file
  return {
    code:        context?.content ?? DEFAULT_SNIPPETS.js,
    lang:        "js",
    fileName:    "untitled.js",
    saved:       false,
    savedFolder: null,
    openFileId:  null,
  }
}

export default function CodeEditor({ context }) {
  const readFile = useStore(s => s.readFile)
  const loadFile = useStore(s => s.loadFile)

  // Compute initial state once — checks VFS so the saved/unsaved status is correct on first render
  const _init = useState(() => resolveInitialState(context))[0]
  const [code,        setCode]        = useState(_init.code)
  const [lang,        setLang]        = useState(_init.lang)
  const [fileName,    setFileName]    = useState(_init.fileName)
  const [saved,       setSaved]       = useState(_init.saved)
  const [savedFolder, setSavedFolder] = useState(_init.savedFolder)
  const [openFileId,  setOpenFileId]  = useState(_init.openFileId)

  const [showLang,   setShowLang]   = useState(false)
  const langDropdownRef             = useRef(null)
  const [showPicker, setShowPicker] = useState(false)

  // Run output
  const [runLines,   setRunLines]   = useState([])
  const [running,    setRunning]    = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const runCleanupRef = useRef(null)
  const outputRef     = useRef(null)

  // Resizable console
  const [consoleHeight, setConsoleHeight] = useState(200)

  // Editor refs
  const textRef    = useRef(null)
  const preRef     = useRef(null)
  const lineHeight = 20

  // ── Sync from OS file context ───────────────────────────────────────────
  useEffect(() => {
    if (!context?.fileId) return
    const run = async () => {
      const content = readFile(context.fileId) || await loadFile(context.fileId)
      const node    = findNode(useStore.getState().fsRoot, context.fileId)
      if (node) {
        setFileName(node.name)
        const ext = node.name.split(".").pop()?.toLowerCase()
        const found = LANGUAGES.find(l => l.ext === ext)
        if (found) setLang(found.id)
      }
      if (content != null) { setCode(content); setSaved(true) }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.fileId])

  // ── Close language dropdown on outside click ───────────────────────────
  useEffect(() => {
    if (!showLang) return
    const handler = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setShowLang(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showLang])

  // ── Syntax highlight (async via rAF — keeps typing smooth, prevents scroll stutter) ───
  const [highlighted, setHighlighted] = useState("")
  const hlRafRef = useRef(null)
  useEffect(() => {
    cancelAnimationFrame(hlRafRef.current)
    hlRafRef.current = requestAnimationFrame(() => {
      const langDef = LANGUAGES.find(l => l.id === lang)
      if (!langDef?.prism) {
        setHighlighted(code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
        return
      }
      try {
        setHighlighted(Prism.highlight(code, Prism.languages[langDef.prism], langDef.prism))
      } catch {
        setHighlighted(code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      }
    })
    return () => cancelAnimationFrame(hlRafRef.current)
  }, [code, lang])

  // ── Scroll sync ─────────────────────────────────────────────────────────
  const syncScroll = useCallback(() => {
    if (textRef.current && preRef.current) {
      preRef.current.scrollTop  = textRef.current.scrollTop
      preRef.current.scrollLeft = textRef.current.scrollLeft
    }
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleChange = (e) => { setCode(e.target.value); setSaved(false) }

  const handleFileNameChange = (e) => {
    const newName = e.target.value
    setFileName(newName)
    if (openFileId) {
      // Rename in VFS immediately, then mark unsaved so the user can Ctrl+S to write content
      useStore.getState().renameNode(openFileId, newName)
      setSaved(false)
    }
  }

  const handleSave = useCallback(() => {
    if (openFileId) {
      useStore.getState().writeFile(openFileId, code)
      setSaved(true)
    } else {
      // Save new files into the Projects folder in VFS
      const state    = useStore.getState()
      const projects = (state.fsRoot.children || []).find(n => n.name === "Projects")
      const targetFolder = projects || (state.fsRoot.children || []).find(n => n.name === "Documents") || null
      if (targetFolder) {
        const existing = (targetFolder.children || []).find(n => n.name === fileName && n.type === "file")
        if (existing) {
          state.writeFile(existing.id, code)
          setOpenFileId(existing.id)
        } else {
          const newId = state.createNode(targetFolder.id, "file", fileName, code)
          setOpenFileId(newId)
        }
        setSavedFolder(targetFolder.name)
        setSaved(true)
      }
      // If no folder found, nothing is written — leave saved=false so the indicator stays accurate
    }
  }, [code, fileName, openFileId])

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave() }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [handleSave])

  const handleKeyDown = (e) => {
    const ta = e.target
    const { selectionStart: ss, selectionEnd: se, value } = ta
    const indentSize   = lang === "py" ? 4 : 2
    const indentStr    = " ".repeat(indentSize)
    const lineStart    = value.lastIndexOf("\n", ss - 1) + 1

    if (e.key === "Tab") {
      e.preventDefault()
      if (e.shiftKey) {
        // Dedent: remove up to indentSize leading spaces from current line
        const spaces = value.slice(lineStart).match(/^ */)[0].length
        const remove = Math.min(spaces, indentSize)
        if (remove > 0) {
          setCode(value.slice(0, lineStart) + value.slice(lineStart + remove))
          setTimeout(() => {
            ta.selectionStart = Math.max(lineStart, ss - remove)
            ta.selectionEnd   = Math.max(lineStart, se - remove)
          }, 0)
        }
      } else {
        setCode(value.slice(0, ss) + indentStr + value.slice(se))
        setTimeout(() => {
          ta.selectionStart = ss + indentSize
          ta.selectionEnd   = ss + indentSize
        }, 0)
      }
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      const currentLine   = value.slice(lineStart, ss)
      const currentIndent = currentLine.match(/^(\s*)/)[1]
      const charBefore    = value[ss - 1]
      const charAfter     = value[ss]
      const opens  = ["{", "[", "("]
      const closes = ["}", "]", ")"]
      const shouldDeepen  = opens.includes(charBefore) || (lang === "py" && charBefore === ":")

      if (shouldDeepen && closes.includes(charAfter)) {
        // Cursor between { } — split into three lines
        const newText = (
          value.slice(0, ss) +
          "\n" + currentIndent + indentStr +
          "\n" + currentIndent +
          value.slice(se)
        )
        setCode(newText)
        setTimeout(() => {
          const pos = ss + 1 + currentIndent.length + indentSize
          ta.selectionStart = pos
          ta.selectionEnd   = pos
        }, 0)
      } else {
        const extra   = shouldDeepen ? indentStr : ""
        const newText = value.slice(0, ss) + "\n" + currentIndent + extra + value.slice(se)
        setCode(newText)
        setTimeout(() => {
          const pos = ss + 1 + currentIndent.length + extra.length
          ta.selectionStart = pos
          ta.selectionEnd   = pos
        }, 0)
      }
    }
  }

  const changeLang = (l) => {
    setLang(l.id); setShowLang(false)
    const newFileName = `untitled.${l.ext}`
    setFileName(newFileName)
    setShowOutput(false); setRunLines([])

    // Check if untitled.{ext} already exists in Projects or Documents
    const state      = useStore.getState()
    const candidates = ["Projects", "Documents"]
    for (const folderName of candidates) {
      const folder = (state.fsRoot.children || []).find(n => n.name === folderName)
      if (!folder) continue
      const existing = (folder.children || []).find(n => n.name === newFileName && n.type === "file")
      if (existing) {
        const saved_content = state.readFile(existing.id) || DEFAULT_SNIPPETS[l.id] || `// ${l.label}\n`
        setCode(saved_content)
        setOpenFileId(existing.id)
        setSaved(true)
        setSavedFolder(folderName)
        return
      }
    }
    // No existing file — load default snippet, mark unsaved
    setCode(DEFAULT_SNIPPETS[l.id] || `// ${l.label}\n`)
    setOpenFileId(null); setSaved(false); setSavedFolder(null)
  }

  const handleOpenFile = async (node) => {
    setShowPicker(false)
    const content = useStore.getState().readFile(node.id) || await loadFile(node.id) || ""
    const ext   = node.name.split(".").pop()?.toLowerCase()
    const found = LANGUAGES.find(l => l.ext === ext)
    setFileName(node.name); setLang(found?.id || "txt")
    setCode(content); setOpenFileId(node.id); setSaved(true)
    // Determine which top-level folder the opened file lives in
    const root = useStore.getState().fsRoot
    const topFolders = root.children || []
    const parentFolder = topFolders.find(f => findNode(f, node.id))
    setSavedFolder(parentFolder?.name || null)
    setShowOutput(false); setRunLines([])
  }

  const download = () => {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([code], { type: "text/plain" })),
      download: fileName,
    })
    a.click()
  }

  const handleRun = async () => {
    if (running) { runCleanupRef.current?.(); setRunning(false); return }
    setRunLines([]); setShowOutput(true); setRunning(true)
    const onLine = (text, type = "log") => {
      setRunLines(prev => [...prev, { text, type }])
      setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0)
    }
    const onDone = () => setRunning(false)
    if (lang === "py") {
      runCleanupRef.current = await runPython(code, onLine, onDone)
    } else if (lang === "ts" || lang === "tsx") {
      runCleanupRef.current = await runTypeScript(code, onLine, onDone)
    } else {
      runCleanupRef.current = runJavaScript(code, onLine, onDone)
    }
  }

  // Console drag-to-resize
  const handleConsoleDragStart = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY, startH = consoleHeight
    const onMove = (me) => setConsoleHeight(Math.max(80, Math.min(600, startH + (startY - me.clientY))))
    const onUp   = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [consoleHeight])

  const currentLang = LANGUAGES.find(l => l.id === lang) || LANGUAGES[0]
  const canRun      = currentLang.runnable
  const lineCount   = code.split("\n").length

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ background: "#0d1117", fontFamily: "'JetBrains Mono','Fira Code',monospace", color: "#e6edf3" }}>

      <style>{PRISM_THEME}</style>
      {showPicker && <FilePicker onSelect={handleOpenFile} onCancel={() => setShowPicker(false)} />}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 flex-wrap"
        style={{ background: "#161b22", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>

        <input value={fileName} onChange={handleFileNameChange}
          className="bg-transparent text-white/70 outline-none border border-transparent hover:border-white/20 focus:border-white/40 rounded px-1.5 py-0.5 w-32 text-[11px]" />

        {/* Language picker */}
        <div className="relative" ref={langDropdownRef}>
          <button onClick={() => setShowLang(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-white/15 hover:border-white/30 text-white/60 hover:text-white transition-all text-[11px]">
            {currentLang.label} <ChevronDown size={10} />
          </button>
          {showLang && (
            <div className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-50 py-1"
              style={{ background: "#161b22", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", width: 126 }}>
              {LANGUAGES.map(l => (
                <button key={l.id} onClick={() => changeLang(l)}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/10 transition-colors"
                  style={{ color: l.id === lang ? "#c4b5fd" : "rgba(255,255,255,0.65)", background: l.id === lang ? "rgba(130,80,255,0.15)" : "transparent" }}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Open OS file */}
        <button onClick={() => setShowPicker(true)} title="Open OS file"
          className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-all">
          <FolderOpen size={13} />
        </button>

        <div className="flex-1" />

        <span className={`text-[10px] flex-shrink-0 ${saved ? "text-green-400/60" : "text-yellow-400/70"}`}>
          {saved ? "● Saved" : "● Unsaved (Ctrl+S)"}
        </span>
        <button onClick={() => navigator.clipboard.writeText(code)}
          className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-all" title="Copy">
          <Copy size={13} />
        </button>
        <button onClick={download}
          className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-all" title="Download">
          <Download size={13} />
        </button>
        <button onClick={handleSave}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all flex-shrink-0"
          style={{ background: saved ? "rgba(255,255,255,0.08)" : "rgba(130,80,255,0.7)" }}>
          <Save size={12} /> Save
        </button>
        <button onClick={() => setShowOutput(v => !v)} title="Toggle Console"
          className="p-1.5 rounded hover:bg-white/10 transition-all flex-shrink-0"
          style={{ color: showOutput ? "#79b8ff" : "rgba(255,255,255,0.4)" }}>
          <Terminal size={13} />
        </button>
        {canRun && (
          <button onClick={handleRun}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex-shrink-0"
            style={{ background: running ? "rgba(239,68,68,0.65)" : "rgba(34,197,94,0.65)", color: "#fff" }}
            title={running ? "Stop" : `Run ${currentLang.label}`}>
            {running ? <Square size={11} /> : <Play size={11} />}
            {running ? "Stop" : "Run"}
          </button>
        )}
      </div>

      {/* ── Editor + output ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* Editor with syntax highlighting overlay */}
        <div className="flex-1 overflow-auto ce-hl" style={{ minHeight: 0 }}>
          <div className="flex" style={{ minHeight: "100%" }}>
            <LineNumbers lines={lineCount} lineHeight={lineHeight} />

            <div className="relative flex-1" style={{ minWidth: 0 }}>
              {/* Highlighted pre — behind textarea */}
              <pre
                ref={preRef}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
                className="absolute inset-0 m-0 pointer-events-none overflow-hidden"
                style={{
                  padding: "12px 12px 12px 0",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: `${lineHeight}px`,
                  whiteSpace: "pre",
                  wordBreak: "keep-all",
                  tabSize: 2,
                  color: "#e6edf3",
                  background: "transparent",
                  zIndex: 0,
                }}
              />
              {/* Editable textarea — transparent text so highlight shows through */}
              <textarea
                ref={textRef}
                value={code}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="relative w-full bg-transparent outline-none resize-none"
                style={{
                  padding: "12px 12px 12px 0",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: `${lineHeight}px`,
                  color: "transparent",
                  caretColor: "#79b8ff",
                  tabSize: 2,
                  zIndex: 1,
                  display: "block",
                  minHeight: "100%",
                }}
              />
            </div>
          </div>
        </div>

        {/* Output panel — show/hide toggle + drag-to-resize from top */}
        {showOutput && (
          <div className="flex-shrink-0 border-t flex flex-col"
            style={{ borderColor: "rgba(255,255,255,0.08)", height: consoleHeight, minHeight: 80 }}>
            {/* Drag handle — grab the header to resize */}
            <div
              onMouseDown={handleConsoleDragStart}
              className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0 select-none"
              style={{ background: "#161b22", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "ns-resize" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Console</span>
              {running && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              <div className="flex-1" />
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setRunLines([])} className="text-[10px] text-white/30 hover:text-white/60 px-1">Clear</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setShowOutput(false)} className="p-0.5 rounded text-white/30 hover:text-white/60">
                <X size={11} />
              </button>
            </div>
            <div ref={outputRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-[12px]"
              style={{ background: "#0a0e13", userSelect: "text", cursor: "text" }}>
              {runLines.length === 0 && !running && (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>No output yet.</span>
              )}
              {runLines.map((line, i) => (
                <div key={i} style={{
                  color: line.type === "error" ? "#f97583" : line.type === "warn" ? "#f8c555" : line.type === "info" ? "#79b8ff" : "#9ecbff",
                  lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>{line.text}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-3 py-1 flex-shrink-0 text-[10px]"
        style={{ background: "#161b22", borderTop: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
        <span>{currentLang.label}</span>
        <span>{lineCount} lines</span>
        <span>{code.length} chars</span>
        {canRun && <span style={{ color: "rgba(34,197,94,0.55)" }}>▶ runnable</span>}
        {openFileId && savedFolder && (
          <span style={{ color: "rgba(255,255,255,0.35)" }} title={`${savedFolder}/${fileName}`}>
            {savedFolder}/{fileName}
          </span>
        )}
        {openFileId && !savedFolder && (
          <span style={{ color: "rgba(255,255,255,0.18)" }}>OS file</span>
        )}
      </div>
    </div>
  )
}
