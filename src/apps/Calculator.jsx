import { useState, useCallback } from 'react'
import { Delete } from 'lucide-react'

const BUTTONS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
]

const isOp   = k => ['÷', '×', '−', '+'].includes(k)
const toReal = k => ({ '÷': '/', '×': '*', '−': '-' }[k] ?? k)

export default function Calculator() {
  const [display, setDisplay] = useState('0')
  const [expr, setExpr]       = useState('')      // accumulates full expression string
  const [justEvaled, setJustEvaled] = useState(false)

  const press = useCallback((key) => {
    if (key === 'C') {
      setDisplay('0'); setExpr(''); setJustEvaled(false); return
    }
    if (key === '⌫') {
      if (justEvaled) { setDisplay('0'); setExpr(''); setJustEvaled(false); return }
      const next = display.length > 1 ? display.slice(0, -1) : '0'
      setDisplay(next)
      setExpr(e => e.slice(0, -1) || '')
      return
    }
    if (key === '=') {
      try {
        const fullExpr = (expr || display).replace(/[÷×−]/g, toReal)
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + fullExpr + ')')()
        const str = Number.isFinite(result)
          ? parseFloat(result.toPrecision(12)).toString()
          : 'Error'
        setDisplay(str)
        setExpr(str)
        setJustEvaled(true)
      } catch {
        setDisplay('Error'); setExpr(''); setJustEvaled(true)
      }
      return
    }
    if (key === '±') {
      const n = parseFloat(display)
      if (!isNaN(n)) {
        const str = (-n).toString()
        setDisplay(str)
        setExpr(e => {
          // remove last operand and replace with negated
          const match = e.match(/^(.*?[+\-*/]?)(-?\d*\.?\d*)$/)
          if (!match) return str
          return match[1] + str
        })
      }
      return
    }
    if (key === '%') {
      const n = parseFloat(display)
      if (!isNaN(n)) {
        const str = (n / 100).toString()
        setDisplay(str)
        setExpr(e => {
          const match = e.match(/^(.*?[+*/-]?)(-?\d*\.?\d*)$/)
          if (!match) return str
          return match[1] + str
        })
      }
      return
    }

    setJustEvaled(false)

    if (isOp(key)) {
      setExpr(e => {
        // Replace trailing operator if present
        const base = isOp(e.slice(-1)) ? e.slice(0, -1) : e || display
        return base + toReal(key)
      })
      setDisplay(toReal(key))
      return
    }

    // digit or '.'
    if (justEvaled) {
      setDisplay(key === '.' ? '0.' : key)
      setExpr(key === '.' ? '0.' : key)
    } else {
      setDisplay(d => {
        if (key === '.' && d.includes('.')) return d
        if (d === '0' && key !== '.') return key
        return d + key
      })
      setExpr(e => {
        if (key === '.' && /\.\d*$/.test(e)) return e // already has decimal
        return e + key
      })
    }
  }, [display, expr, justEvaled])

  // Keyboard support
  const handleKey = useCallback((e) => {
    const map = {
      'Enter': '=', 'Backspace': '⌫', 'Escape': 'C',
      '/': '÷', '*': '×', '-': '−', '+': '+', '%': '%',
    }
    const k = map[e.key] ?? (e.key.match(/^[\d.]$/) ? e.key : null)
    if (k) { e.preventDefault(); press(k) }
  }, [press])

  const buttonStyle = (key) => {
    if (key === '=') return { background: 'var(--nova-accent,#7c3aed)', color: '#fff' }
    if (isOp(key) || key === '÷')
      return { background: 'rgba(130,80,255,0.25)', color: 'rgba(180,140,255,1)' }
    if (['C', '±', '%'].includes(key))
      return { background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }
    return { background: 'rgba(255,255,255,0.07)', color: '#fff' }
  }

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ background: 'rgba(14,14,24,0.97)', fontFamily: 'system-ui,sans-serif' }}
      tabIndex={0}
      onKeyDown={handleKey}
    >
      {/* Display */}
      <div className="flex-1 flex flex-col items-end justify-end px-5 py-4 min-h-0" style={{ minHeight: 100 }}>
        <div className="text-white/30 text-sm mb-1 h-5 truncate max-w-full text-right">
          {expr && !justEvaled ? expr : ''}
        </div>
        <div
          className="text-white font-light leading-none text-right w-full"
          style={{ fontSize: display.length > 12 ? '1.6rem' : display.length > 8 ? '2.4rem' : '3rem', wordBreak: 'break-all' }}>
          {display}
        </div>
      </div>

      {/* Buttons */}
      <div className="grid grid-rows-5 gap-1.5 p-3 flex-shrink-0" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {BUTTONS.flat().map((key, i) => (
          <button
            key={i}
            onClick={() => press(key)}
            className="rounded-2xl flex items-center justify-center transition-all active:scale-95 font-medium"
            style={{
              ...buttonStyle(key),
              height: 64,
              fontSize: key === '⌫' ? undefined : '1.15rem',
              gridColumn: key === '0' ? 'span 1' : undefined,
            }}
          >
            {key === '⌫' ? <Delete size={18} /> : key}
          </button>
        ))}
      </div>
    </div>
  )
}
