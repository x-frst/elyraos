import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin } from 'lucide-react'
import { useStore } from '../store/useStore'
import { dbGet, dbSet } from '../utils/db'

import { STORAGE_PREFIX } from '../config.js'

const STORAGE_KEY = `${STORAGE_PREFIX}-calendar-events`

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const EVENT_COLORS = [
  { id: 'violet', bg: 'rgba(124,58,237,0.85)',  dot: '#8b5cf6' },
  { id: 'blue',   bg: 'rgba(37,99,235,0.85)',   dot: '#3b82f6' },
  { id: 'green',  bg: 'rgba(5,150,105,0.85)',   dot: '#10b981' },
  { id: 'red',    bg: 'rgba(220,38,38,0.85)',   dot: '#ef4444' },
  { id: 'amber',  bg: 'rgba(217,119,6,0.85)',   dot: '#f59e0b' },
  { id: 'pink',   bg: 'rgba(219,39,119,0.85)',  dot: '#ec4899' },
]

function colorById(id) { return EVENT_COLORS.find(c => c.id === id) || EVENT_COLORS[0] }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dateStr(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Event Form Modal ──────────────────────────────────────────────────────────
function EventModal({ date, event, onSave, onDelete, onClose }) {
  const [title, setTitle]   = useState(event?.title  || '')
  const [time,  setTime]    = useState(event?.time   || '')
  const [location, setLocation] = useState(event?.location || '')
  const [notes, setNotes]   = useState(event?.notes  || '')
  const [color, setColor]   = useState(event?.color  || 'violet')

  const submit = () => {
    if (!title.trim()) return
    onSave({ id: event?.id || uid(), date, title: title.trim(), time, location, notes, color })
  }

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-[360px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'rgba(18,12,36,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-white font-semibold text-sm">{event ? 'Edit Event' : 'New Event'}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <div className="text-white/40 text-xs">{date}</div>
          <input
            autoFocus
            className="w-full px-3 py-2 rounded-xl text-white text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            placeholder="Event title *"
            value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Clock size={13} className="text-white/30 flex-shrink-0" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="bg-transparent text-white/70 text-sm outline-none flex-1 min-w-0"
                style={{ colorScheme: 'dark' }} />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <MapPin size={13} className="text-white/30 flex-shrink-0" />
            <input className="bg-transparent text-white/70 text-sm outline-none flex-1"
              placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <textarea
            className="w-full px-3 py-2 rounded-xl text-white/70 text-sm outline-none resize-none h-16"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

          {/* Color picker */}
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-xs">Color:</span>
            {EVENT_COLORS.map(c => (
              <button key={c.id} onClick={() => setColor(c.id)}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{ background: c.dot, borderColor: color === c.id ? 'white' : 'transparent' }} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 gap-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {event
            ? <button onClick={() => onDelete(event.id)}
                className="px-3 py-1.5 rounded-xl text-red-400/80 hover:text-red-400 text-sm transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)' }}>Delete</button>
            : <div />
          }
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-white/50 text-sm hover:text-white/80 transition-colors"
              style={{ background: 'rgba(255,255,255,0.07)' }}>Cancel</button>
            <button onClick={submit} disabled={!title.trim()}
              className="px-4 py-1.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-all"
              style={{ background: 'var(--nova-accent,#7c3aed)' }}>
              {event ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Day Detail Panel ─────────────────────────────────────────────────────────
function DayPanel({ date, events, onAdd, onEdit, onClose }) {
  const sorted = [...events].sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz'))
  return (
    <div className="flex flex-col h-full"
      style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-white font-semibold text-sm">{date}</span>
        <div className="flex items-center gap-1">
          <button onClick={onAdd}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-colors"
            style={{ background: 'rgba(130,80,255,0.25)' }}>
            <Plus size={14} />
          </button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {sorted.length === 0
          ? <div className="text-white/25 text-sm text-center pt-8">No events</div>
          : sorted.map(ev => {
            const c = colorById(ev.color)
            return (
              <div key={ev.id}
                className="rounded-xl px-3 py-2.5 cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: c.bg }}
                onClick={() => onEdit(ev)}>
                <div className="text-white font-medium text-sm">{ev.title}</div>
                {ev.time && <div className="text-white/70 text-xs mt-0.5"><Clock size={10} className="inline mr-1" />{ev.time}</div>}
                {ev.location && <div className="text-white/60 text-xs mt-0.5"><MapPin size={10} className="inline mr-1" />{ev.location}</div>}
                {ev.notes && <div className="text-white/50 text-xs mt-1 line-clamp-2">{ev.notes}</div>}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ── Main Calendar ──────────────────────────────────────────────────────────
export default function Calendar() {
  const settings = useStore(s => s.settings)
  const tz = settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const now = useMemo(() => {
    try { return new Date(new Date().toLocaleString('en-US', { timeZone: tz })) }
    catch { return new Date() }
  }, [tz])

  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [events, setEvents] = useState({})   // { 'YYYY-MM-DD': [event, ...] }
  const [modal, setModal] = useState(null)   // { date, event? }

  // Load events from persistent storage
  useEffect(() => {
    const saved = dbGet(STORAGE_KEY, {})
    if (saved) setEvents(saved)
  }, [])

  const saveEvents = (updated) => {
    setEvents(updated)
    dbSet(STORAGE_KEY, updated)
  }

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0) } else setMonth(m => m+1) }
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDate(todayStr()) }

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const handleDayClick = (day) => {
    const ds = dateStr(year, month, day)
    setSelectedDate(ds)
  }

  const openAddModal = (ds) => setModal({ date: ds })
  const openEditModal = (ev) => setModal({ date: ev.date, event: ev })

  const handleSave = (ev) => {
    const updated = { ...events }
    const list = updated[ev.date] || []
    const idx = list.findIndex(e => e.id === ev.id)
    if (idx >= 0) list[idx] = ev; else list.push(ev)
    updated[ev.date] = list
    saveEvents(updated)
    setModal(null)
  }

  const handleDelete = (id) => {
    const updated = {}
    for (const [d, list] of Object.entries(events)) {
      const filtered = list.filter(e => e.id !== id)
      if (filtered.length) updated[d] = filtered
    }
    saveEvents(updated)
    setModal(null)
  }

  const today = todayStr()
  const MAX_DOT_DISPLAY = 3

  return (
    <div className="flex flex-col h-full text-white"
      style={{ background: 'rgba(12,12,22,0.97)', fontFamily: 'system-ui,sans-serif' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <span className="font-semibold text-[15px]">{MONTHS[month]} {year}</span>
        </div>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <ChevronRight size={18} />
        </button>
        <button onClick={goToday}
          className="px-3 py-1 rounded-xl text-xs font-medium text-white/70 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.08)' }}>Today</button>
        <button onClick={() => selectedDate && openAddModal(selectedDate)}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
          style={{ background: 'rgba(130,80,255,0.4)', color: '#c4b5fd' }}
          title="Add event">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 flex flex-col overflow-hidden p-2 sm:p-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-white/30 text-xs font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div className="flex-1 grid grid-cols-7" style={{ gridTemplateRows: `repeat(${Math.ceil(cells.length/7)}, 1fr)` }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const ds = dateStr(year, month, day)
              const dayEvents = events[ds] || []
              const isToday = ds === today
              const isSelected = ds === selectedDate

              return (
                <div key={ds}
                  className="relative flex flex-col p-1 rounded-xl cursor-pointer transition-all m-0.5"
                  style={{
                    background: isSelected
                      ? 'rgba(130,80,255,0.3)'
                      : isToday
                        ? 'rgba(130,80,255,0.12)'
                        : 'rgba(255,255,255,0.02)',
                    border: isToday ? '1px solid rgba(130,80,255,0.4)' : '1px solid transparent',
                    minHeight: 40,
                  }}
                  onClick={() => handleDayClick(day)}
                  onDoubleClick={() => { handleDayClick(day); openAddModal(ds) }}>
                  <div className={`text-xs font-medium mb-0.5 ${isToday ? 'text-violet-300' : 'text-white/70'}`}
                    style={{ alignSelf: 'flex-end' }}>
                    {day}
                  </div>
                  {/* Event dots / labels */}
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, MAX_DOT_DISPLAY).map(ev => {
                      const c = colorById(ev.color)
                      return (
                        <div key={ev.id}
                          className="rounded px-1 text-[10px] leading-tight truncate text-white font-medium hidden sm:block"
                          style={{ background: c.bg }}>
                          {ev.title}
                        </div>
                      )
                    })}
                    {/* Mobile: dots only */}
                    {dayEvents.length > 0 && (
                      <div className="flex items-center gap-0.5 sm:hidden">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id} className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: colorById(ev.color).dot }} />
                        ))}
                      </div>
                    )}
                    {dayEvents.length > MAX_DOT_DISPLAY && (
                      <div className="text-white/30 text-[10px] hidden sm:block">+{dayEvents.length - MAX_DOT_DISPLAY} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <div className="w-48 sm:w-56 flex-shrink-0 hidden sm:block">
            <DayPanel
              date={selectedDate}
              events={events[selectedDate] || []}
              onAdd={() => openAddModal(selectedDate)}
              onEdit={openEditModal}
              onClose={() => setSelectedDate(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile: selected day events at bottom */}
      {selectedDate && (
        <div className="sm:hidden flex-shrink-0 max-h-40 overflow-y-auto border-t border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/60 text-xs">{selectedDate}</span>
            <button onClick={() => openAddModal(selectedDate)}
              className="text-xs px-2 py-0.5 rounded-lg text-white/70"
              style={{ background: 'rgba(130,80,255,0.3)' }}>+ Add</button>
          </div>
          {(events[selectedDate] || []).map(ev => {
            const c = colorById(ev.color)
            return (
              <div key={ev.id} className="rounded-lg px-2 py-1.5 mb-1 cursor-pointer text-white text-xs"
                style={{ background: c.bg }} onClick={() => openEditModal(ev)}>
                {ev.time && <span className="opacity-70 mr-1">{ev.time}</span>}{ev.title}
              </div>
            )
          })}
          {!(events[selectedDate]?.length) && <div className="text-white/25 text-xs text-center">No events</div>}
        </div>
      )}

      {/* Event Modal */}
      {modal && (
        <EventModal
          date={modal.date}
          event={modal.event}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
