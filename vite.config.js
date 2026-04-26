import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Prevent Vite from clearing the terminal — keep concurrently output visible
  clearScreen: false,
  server: {
    host: false,
    port: 5173,
    allowedHosts: [
      '*'
    ],
    proxy: {
      // SSE endpoint — override proxy.emit so the error event is consumed
      // before Vite's own logger listener fires (Vite adds its listener after
      // configure() returns, so proxy.on('error') alone doesn't suppress it).
      // ECONNRESET = browser closed the tab/refreshed; ECONNREFUSED = server restarting.
      '/api/session/events': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        configure: (proxy) => {
          const _emit = proxy.emit.bind(proxy)
          proxy.emit = (event, ...args) => {
            if (event === 'error') {
              const [,, res] = args
              if (res && !res.headersSent) { try { res.writeHead(502); res.end() } catch {} }
              return false  // prevents Vite's logger listener from receiving this event
            }
            return _emit(event, ...args)
          }
        },
      },
      // Streaming upload endpoint — same technique to suppress ECONNABORTED
      // fired when the browser cancels or navigates away mid-upload.
      '/api/fs/stream': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        configure: (proxy) => {
          const _emit = proxy.emit.bind(proxy)
          proxy.emit = (event, ...args) => {
            if (event === 'error') return false
            return _emit(event, ...args)
          }
        },
      },
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
