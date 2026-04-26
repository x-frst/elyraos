import { useState } from 'react'
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'

export default function Trash({ windowId }) {
  const trash            = useStore(s => s.trash)
  const emptyTrash       = useStore(s => s.emptyTrash)
  const restoreFromTrash = useStore(s => s.restoreFromTrash)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  return (
    <div className="flex flex-col h-full text-white relative" style={{ background: 'rgba(14,14,24,0.85)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(22,22,36,0.8)' }}>
        <span className="text-white/50 text-[13px]">
          {trash.length} item{trash.length !== 1 ? 's' : ''} in Trash
        </span>
        {trash.length > 0 && (
          <button
            onClick={() => setConfirmEmpty(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-red-400 hover:bg-red-500/15 transition-colors"
          >
            <AlertTriangle size={12} />
            Empty Trash
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-3">
        {trash.length === 0 && (
          <div className="text-center py-16">
            <Trash2 size={40} className="mx-auto mb-3 text-white/15" />
            <p className="text-white/25 text-sm">Trash is empty</p>
          </div>
        )}
        {trash.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 group"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-lg">{item.type === 'folder' ? '📁' : '📄'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-white/80 text-[13px] font-medium truncate">{item.name}</div>
              <div className="text-white/30 text-[11px]">
                Deleted {new Date(item.deletedAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => restoreFromTrash(item.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] text-emerald-400 hover:bg-emerald-500/15 opacity-0 group-hover:opacity-100 transition-all"
            >
              <RotateCcw size={11} /> Restore
            </button>
          </motion.div>
        ))}
      </div>

      {/* Empty Trash confirmation dialog */}
      {confirmEmpty && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="rounded-2xl p-5 w-80 text-sm" style={{ background: 'rgba(20,20,36,0.97)', border: '1px solid rgba(255,80,80,0.3)' }}>
            <div className="font-semibold text-white text-base mb-2">Empty Trash?</div>
            <p className="text-white/55 text-[13px] mb-5">
              This will permanently delete all {trash.length} item{trash.length !== 1 ? 's' : ''} in the Trash. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmEmpty(false)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white/70 transition-all"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={() => { emptyTrash(); setConfirmEmpty(false) }}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{ background: 'rgba(239,68,68,0.7)' }}>Empty Trash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
