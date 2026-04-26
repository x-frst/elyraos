import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function Clock() {
  const [time, setTime] = useState(new Date())
  const timezone = useStore(s => s.settings?.timezone)

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const tz = timezone || undefined
  const opts = { weekday: 'short', month: 'short', day: 'numeric', ...(tz && { timeZone: tz }) }
  const dateStr = time.toLocaleDateString('en-US', opts)
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', ...(tz && { timeZone: tz }) })

  return (
    <div className="fixed top-4 right-5 z-50 text-right pointer-events-none">
      <div className="text-white/90 text-sm font-semibold leading-tight drop-shadow">{timeStr}</div>
      <div className="text-white/55 text-xs leading-tight">{dateStr}</div>
    </div>
  )
}
