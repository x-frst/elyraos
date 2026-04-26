import { Router } from 'express'
import { requireAuth } from './auth.js'

const router = Router()
export { router as proxyRouter }

// Headers that prevent iframe embedding — we strip these before forwarding
const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-encoding',   // we decode on the server, so don't forward encoding hint
  'transfer-encoding',
  'connection',
  'keep-alive',
])

// SSRF protection: block loopback / private network ranges
function isBlockedHost(hostname) {
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return true
  if (/^(10|127)\.\d+\.\d+\.\d+$/.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true
  return false
}

// Injected into every proxied HTML page:
// – captures link clicks and form submits → postMessage to parent for navigation
// – reports pushState changes (SPA routing)
// – reports the final URL on load
const INTERCEPTOR = `<script data-nova-proxy>
(function(){
  var P = window.parent;
  function nav(url){
    try {
      var u = new URL(url);
      if(u.protocol==='http:'||u.protocol==='https:'){
        P.postMessage({type:'nova-nav',url:u.href},'*');
        return true;
      }
    } catch(e){}
    return false;
  }
  // Capture link clicks
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if(!a) return;
    var href = a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    try { href = new URL(href, location.href).href; } catch(e){ return; }
    if(a.hasAttribute('download')){
      var fname = a.getAttribute('download') || '';
      if(!fname){try{fname=new URL(href).pathname.split('/').pop()||'download';}catch(ex){fname='download';}}
      P.postMessage({type:'nova-download',url:href,filename:fname},'*');
      e.preventDefault();
      return;
    }
    if(nav(href)) e.preventDefault();
  }, true);
  // Capture GET form submissions
  document.addEventListener('submit', function(e){
    var f = e.target;
    if(f.method && f.method.toLowerCase() !== 'get') return;
    e.preventDefault();
    var action = f.action || location.href;
    var q = new URLSearchParams(new FormData(f)).toString();
    var url = action.split('?')[0] + (q ? '?' + q : '');
    nav(url);
  }, true);
  // Intercept SPA history.pushState / replaceState
  function wrap(fn){
    return function(state, title, url){
      fn.call(history, state, title, url);
      if(url) {
        try { P.postMessage({type:'nova-loc',url:new URL(url,location.href).href},'*'); } catch(e){}
      }
    };
  }
  history.pushState    = wrap(history.pushState.bind(history));
  history.replaceState = wrap(history.replaceState.bind(history));
  // Report URL after full page load
  window.addEventListener('load', function(){
    P.postMessage({type:'nova-loc',url:location.href},'*');
  });
})();
</script>
`

router.use(requireAuth)

// GET /api/proxy/download?url=<encoded-url>
// Fetches a file through the proxy and returns it for saving to the virtual FS
router.get('/download', async (req, res) => {
  const raw = req.query.url
  if (!raw) return res.status(400).json({ error: 'Missing url parameter' })

  let parsed
  try {
    parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol))
      return res.status(400).json({ error: 'Only http/https URLs are supported' })
    if (isBlockedHost(parsed.hostname))
      return res.status(400).json({ error: 'Access to this host is not allowed' })
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const upstream = await fetch(parsed.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })

    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()

    // Derive filename from Content-Disposition or URL
    const disposition = upstream.headers.get('content-disposition') || ''
    let filename = ''
    const cdMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
    if (cdMatch) filename = decodeURIComponent(cdMatch[1].trim())
    if (!filename) filename = parsed.pathname.split('/').pop().split('?')[0] || 'download'

    const isText = contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript')
    if (isText) {
      const content = await upstream.text()
      return res.json({ filename, contentType, content, encoding: 'text' })
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer())
      const content = buf.toString('base64')
      return res.json({ filename, contentType, content, encoding: 'base64' })
    }
  } catch (err) {
    return res.status(502).json({ error: `Download failed: ${err.message}` })
  }
})

// GET /api/proxy?url=<encoded-url>
// Returns { html: string, finalUrl: string } for HTML pages
// Returns { html: string, finalUrl: string } with a wrapper for media/text
router.get('/', async (req, res) => {
  const raw = req.query.url
  if (!raw) return res.status(400).json({ error: 'Missing url parameter' })

  let parsed
  try {
    parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol))
      return res.status(400).json({ error: 'Only http/https URLs are supported' })
    if (isBlockedHost(parsed.hostname))
      return res.status(400).json({ error: 'Access to this host is not allowed' })
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const upstream = await fetch(parsed.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',   // disable gzip — we read text directly
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    const finalUrl   = upstream.url || parsed.href
    const contentType = (upstream.headers.get('content-type') || 'text/html').toLowerCase()

    // ── HTML ────────────────────────────────────────────────────────────────
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      let html = await upstream.text()

      // Derive the base for relative-URL resolution
      const baseOrigin = new URL(finalUrl).origin
      const baseHref   = finalUrl.replace(/[^/]+$/, '') || (baseOrigin + '/')

      // Inject <base> if one isn't already present
      if (!/<base\b/i.test(html)) {
        html = html.replace(/(<head\b[^>]*>)/i, `$1\n<base href="${baseHref}">`)
        if (!html.includes('<base')) html = `<base href="${baseHref}">\n` + html
      }

      // Inject interceptor before </head>, or prepend
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, INTERCEPTOR + '</head>')
      } else {
        html = INTERCEPTOR + html
      }

      return res.json({ html, finalUrl, type: 'html' })
    }

    // ── Image ───────────────────────────────────────────────────────────────
    if (contentType.startsWith('image/')) {
      const buf = Buffer.from(await upstream.arrayBuffer())
      const b64 = buf.toString('base64')
      const dataUrl = `data:${contentType.split(';')[0]};base64,${b64}`
      const html = `<!DOCTYPE html><html><head><base href="${parsed.href}"><style>*{margin:0;padding:0}body{background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${dataUrl}"></body></html>`
      return res.json({ html, finalUrl, type: 'image' })
    }

    // ── Plain text / JSON / XML ─────────────────────────────────────────────
    if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')) {
      const text = await upstream.text()
      const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      const html = `<!DOCTYPE html><html><head><base href="${parsed.href}"><style>body{background:#1a1a2e;color:#e2e8f0;font-family:monospace;padding:1rem;white-space:pre-wrap;word-break:break-all;line-height:1.5}</style></head><body>${escaped}</body></html>`
      return res.json({ html, finalUrl, type: 'text' })
    }

    // ── Unsupported binary content ──────────────────────────────────────────
    const html = `<!DOCTYPE html><html><head><style>body{background:#1a1a2e;color:#94a3b8;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:1rem;text-align:center}</style></head><body><div style="font-size:3rem">📄</div><div>Binary content</div><div style="font-size:.85rem;color:#64748b">${contentType}</div><a href="${finalUrl}" target="_blank" rel="noopener noreferrer" style="padding:.5rem 1.5rem;background:#7c3aed;color:white;border-radius:.5rem;text-decoration:none;margin-top:.5rem">Open in new tab</a></body></html>`
    return res.json({ html, finalUrl, type: 'binary' })

  } catch (err) {
    return res.status(502).json({ error: `Could not reach ${parsed.hostname}: ${err.message}` })
  }
})
