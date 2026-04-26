/**
 * Shared in-memory SSE connection registry.
 * Map<userId, Set<Response>>
 * Imported by session.js (to add/remove) and admin.js (to push events).
 * ES modules are true singletons in Node.js — both importers share the same Map.
 */

const _clients = new Map()

export function addClient(userId, res) {
  if (!_clients.has(userId)) _clients.set(userId, new Set())
  _clients.get(userId).add(res)
}

export function removeClient(userId, res) {
  const conns = _clients.get(userId)
  if (!conns) return
  conns.delete(res)
  if (conns.size === 0) _clients.delete(userId)
}

/**
 * Push a named SSE event to every open connection for this user.
 * Silently drops any dead connections it finds.
 */
export function pushToUser(userId, event, data = {}) {
  const conns = _clients.get(userId)
  if (!conns || conns.size === 0) return
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of [...conns]) {
    try { res.write(msg) } catch { conns.delete(res) }
  }
  if (conns.size === 0) _clients.delete(userId)
}

/**
 * Push a named SSE event to every connected client (all users).
 */
export function pushToAll(event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [userId, conns] of [..._clients]) {
    for (const res of [...conns]) {
      try { res.write(msg) } catch { conns.delete(res) }
    }
    if (conns.size === 0) _clients.delete(userId)
  }
}
