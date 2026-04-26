import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X } from "lucide-react"
import { useStore, SYSTEM_APPS } from "../store/useStore"
import { AppTile, CatalogTile } from "../utils/icons"

// All built-in app IDs — will be sorted alphabetically by title at render time
const BUILTIN_IDS = ["files","notes","terminal","ai","appcenter","settings","codeeditor","music","camera","recorder","photoviewer","videoplayer","archivemanager","trash","browser","calculator","paint","docviewer","calendar"]

export default function StartMenu() {
  const launcherOpen    = useStore(s => s.launcherOpen)
  const closeLauncher   = useStore(s => s.closeLauncher)
  const openWindow      = useStore(s => s.openWindow)
  const pinToDock       = useStore(s => s.pinToDock)
  const addToDesktop    = useStore(s => s.addToDesktop)
  const desktopItems    = useStore(s => s.desktopItems)
  const showContextMenu = useStore(s => s.showContextMenu)
  const recentApps      = useStore(s => s.recentApps)
  const addRecentApp    = useStore(s => s.addRecentApp)
  const [query, setQuery] = useState("")

  // Reset search query whenever the launcher is closed
  useEffect(() => { if (!launcherOpen) setQuery("") }, [launcherOpen])

  // System apps sorted alphabetically
  const builtinApps = BUILTIN_IDS.map(id => SYSTEM_APPS[id]).filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title))

  const q = query.toLowerCase()
  const filteredBuiltin = q
    ? builtinApps.filter(a => a.title.toLowerCase().includes(q))
    : builtinApps
  const filteredRecent = q
    ? recentApps.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.toLowerCase().includes(q))
      )
    : recentApps

  const launch = (app) => {
    openWindow(app.id, app.type, app.title, app.type === "iframe" ? { app } : {})
    addRecentApp(app)
    closeLauncher()
  }

  const handleRightClick = (e, app) => {
    e.preventDefault(); e.stopPropagation()
    const isSystemApp = !!SYSTEM_APPS[app.id]
    const isInstalled = desktopItems.includes(app.id)
    // Pin to Taskbar: always available for system apps; only when installed for catalog apps
    const canPin = isSystemApp || isInstalled
    showContextMenu(e.clientX, e.clientY, [
      { label: "Launch App", action: () => launch(app) },
      { type: "separator" },
      ...(canPin ? [{ label: "Pin to Dock", action: () => pinToDock(app.id) }] : []),
      ...(isSystemApp && app.id !== "launcher" ? [{ label: "Add to Desktop", action: () => addToDesktop(app.id) }] : []),
    ])
  }

  return (
    <AnimatePresence>
      {launcherOpen && (
        <>
          <motion.div key="lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="fixed inset-0 z-[800]" data-launcher
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
            onClick={closeLauncher} />

          {/* Centering wrapper — lets FM animate without fighting CSS translate */}
          <div className="fixed inset-0 z-[810] flex items-center justify-center pointer-events-none" data-launcher>
            <motion.div
              key="lp"
              data-launcher
              initial={{ opacity: 0, scale: 0.93, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 14 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="pointer-events-auto rounded-2xl overflow-hidden flex flex-col"
              style={{
                width: Math.min(800, window.innerWidth - 40),
                maxHeight: Math.min(620, window.innerHeight - 100),
                background: "rgba(14,14,26,0.94)",
                backdropFilter: "blur(44px) saturate(180%)",
                WebkitBackdropFilter: "blur(44px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 40px 100px rgba(0,0,0,0.65)",
              }}
            >
              {/* Search bar */}
              <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <Search size={16} className="text-white/40 flex-shrink-0" />
                <input autoFocus className="flex-1 bg-transparent text-white text-[15px] outline-none placeholder:text-white/30"
                  placeholder="Search apps..." value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && closeLauncher()} />
                {query && <button onClick={() => setQuery("")} className="text-white/40 hover:text-white/70"><X size={14} /></button>}
              </div>

              <div className="overflow-y-auto flex-1 p-5">
                {/* Recent Apps */}
                {filteredRecent.length > 0 && (
                  <section className="mb-6">
                    <h3 className="text-white/40 text-[11px] font-semibold uppercase tracking-widest mb-3">Recent Apps</h3>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
                      {filteredRecent.map(app => (
                        <LauncherIcon key={app.id}
                          tile={app.type === "iframe"
                            ? <CatalogTile app={app} size={52} />
                            : <AppTile app={app} size={52} />
                          }
                          label={app.title}
                          onClick={() => launch(app)}
                          onContextMenu={(e) => handleRightClick(e, app)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* System Apps (alphabetical) */}
                {filteredBuiltin.length > 0 && (
                  <section>
                    <h3 className="text-white/40 text-[11px] font-semibold uppercase tracking-widest mb-3">System Apps</h3>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
                      {filteredBuiltin.map(app => (
                        <LauncherIcon key={app.id} tile={<AppTile app={app} size={52} />} label={app.title}
                          onClick={() => launch(app)}
                          onContextMenu={(e) => handleRightClick(e, app)} />
                      ))}
                    </div>
                  </section>
                )}

                {!filteredBuiltin.length && !filteredRecent.length && (
                  <div className="text-center text-white/30 py-12 text-sm">No apps found</div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function LauncherIcon({ tile, label, onClick, onContextMenu }) {
  return (
    <motion.button className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-white/8 transition-colors"
      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
      title={label}
      onClick={onClick} onContextMenu={onContextMenu}>
      {tile}
      <span className="text-white/80 text-[11px] text-center leading-tight w-full truncate px-1">{label}</span>
    </motion.button>
  )
}
