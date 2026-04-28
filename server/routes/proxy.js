import { Router } from 'express'
import express from 'express'
import { requireAuth } from './auth.js'
import { PROXY_WORKER_URL, PROXY_WORKER_SECRET } from '../config.js'

const router = Router()
export { router as proxyRouter }

// Parse urlencoded + text bodies for the POST proxy route
router.use(express.urlencoded({ extended: true, limit: '1mb' }))
router.use(express.text({ limit: '1mb' }))
// Headers that prevent iframe embedding — we strip these before forwarding
const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-encoding',   // we decode on the server, so don't forward encoding hint
  'transfer-encoding',
  'connection',
  'keep-alive',
])

// ── Cloudflare Worker proxy ───────────────────────────────────────────────────
// Most browser page fetches are routed through the CF Worker so outbound
// requests originate from Cloudflare's datacenter, not the home server.
// Exception: major search engines block CF datacenter IPs — bypass the Worker
// for those and fetch directly (server IP).  The server still strips
// X-Frame-Options so srcdoc embedding works fine.
const CF_WORKER_URL    = PROXY_WORKER_URL
const CF_WORKER_SECRET = PROXY_WORKER_SECRET

// URLs that should be fetched directly from the server (bypass CF Worker).
// CF Worker's datacenter IP gets CAPTCHAed on search engine result pages, but
// NOT on their click-tracking / redirect endpoints (e.g. bing.com/ck/a).
// So we only bypass for the actual search/homepage paths — everything else,
// including redirect chains, goes through the Worker.
function isDirectFetch(url) {
  try {
    const { hostname, pathname } = new URL(url)
    const h = hostname.replace(/^www\./, '')
    if (h === 'bing.com') {
      // Only Bing search UI pages — NOT /ck/a tracking redirects
      return pathname === '/' || /^\/(search|images|videos|news|maps|translate)(\/|$|\?)/i.test(pathname)
    }
    if (h === 'google.com') {
      return pathname === '/' || /^\/(search|maps|imghp|webhp)(\/|$|\?)/i.test(pathname)
    }
    if (h === 'duckduckgo.com') {
      return pathname === '/' || pathname.startsWith('/html') || pathname.startsWith('/lite')
    }
    if (h === 'search.yahoo.com') return true
    if (h === 'youtube.com') return true
    return false
  } catch { return false }
}

// Decode search-engine click-tracking redirect URLs to get the real destination
// so we can route it through CF Worker directly (avoiding redirect ambiguity).
// Bing: /ck/a?...&u=a1<base64url>&...  → decode base64 after "a1" prefix
// Google: /url?q=<url>&...             → plain URL in q param
function decodeTrackerUrl(url) {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\./, '')

    if (h === 'bing.com' && u.pathname === '/ck/a') {
      const encoded = u.searchParams.get('u')
      if (encoded && encoded.startsWith('a1')) {
        const decoded = Buffer.from(encoded.slice(2), 'base64').toString('utf-8')
        const dest = new URL(decoded)
        if ((dest.protocol === 'http:' || dest.protocol === 'https:') && !isBlockedHost(dest.hostname))
          return dest.href
      }
    }

    if (h === 'google.com' && u.pathname === '/url') {
      const q = u.searchParams.get('q') || u.searchParams.get('url')
      if (q) {
        const dest = new URL(q)
        if ((dest.protocol === 'http:' || dest.protocol === 'https:') && !isBlockedHost(dest.hostname))
          return dest.href
      }
    }
  } catch {}
  return null
}

const COMMON_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Cache-Control':   'no-cache',
}

/**
 * Fetch a URL via the Cloudflare Worker when configured.
 * Falls back to direct fetch if PROXY_WORKER_URL / PROXY_WORKER_SECRET are unset.
 * Only used by the Browser app routes — no other routes call this.
 * @param {string} url
 * @param {'GET'|'POST'} [method='GET']
 * @param {string|null} [body]
 * @param {string|null} [contentType]
 */
async function proxyFetch(url, method = 'GET', body = null, contentType = null, _hops = 0) {
  if (_hops > 10) throw new Error('Too many redirects')

  // Decode click-tracker URLs (bing.com/ck/a, google.com/url) to the real
  // destination so it's routed through CF Worker from the start.
  const realDest = decodeTrackerUrl(url)
  if (realDest) return proxyFetch(realDest, method, body, contentType, _hops + 1)

  if (CF_WORKER_URL && CF_WORKER_SECRET && !isDirectFetch(url)) {
    const res = await fetch(CF_WORKER_URL, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Proxy-Secret': CF_WORKER_SECRET,
      },
      body:   JSON.stringify({ url, method, body, contentType }),
      signal: AbortSignal.timeout(20_000),
    })
    res._proxyFinalUrl = res.headers.get('X-Final-Url') || url
    return res
  }

  // Direct fetch — handle redirects manually so each hop is re-checked.
  // This prevents a bing.com redirect URL from silently following through to a
  // non-search-engine site using the server's real IP.
  const opts = {
    method,
    headers: { ...COMMON_HEADERS },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  }
  if (body) {
    opts.body = body
    if (contentType) opts.headers['Content-Type'] = contentType
  }
  const res = await fetch(url, opts)

  // Follow 3xx responses one hop at a time, re-entering proxyFetch so the
  // destination is re-evaluated (it might need the CF Worker path).
  if (res.status >= 301 && res.status <= 308) {
    const location = res.headers.get('location')
    if (location) {
      const nextUrl    = new URL(location, url).href
      // 307/308 preserve the original method; everything else becomes GET
      const nextMethod = (res.status === 307 || res.status === 308) ? method : 'GET'
      const nextBody   = nextMethod === 'GET' ? null : body
      return proxyFetch(nextUrl, nextMethod, nextBody, contentType, _hops + 1)
    }
  }

  res._proxyFinalUrl = url
  return res
}

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
  // Intercept location.assign / replace / reload so JS-driven navigations
  // are proxied instead of breaking out of the iframe.
  // Note: location.href setter cannot be overridden in Chrome — the onLoad
  // handler in the parent React component handles that case instead.
  try {
    var _assign  = location.assign.bind(location);
    var _replace = location.replace.bind(location);
    var _reload  = location.reload.bind(location);
    location.assign  = function(u){ try{u=new URL(String(u),location.href).href;}catch(ex){} if(!nav(u)) _assign(u); };
    location.replace = function(u){ try{u=new URL(String(u),location.href).href;}catch(ex){} if(!nav(u)) _replace(u); };
    location.reload  = function(){ nav(location.href) || _reload(); };
  } catch(e){}
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
    const upstream = await proxyFetch(parsed.href)

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

// GET /api/proxy/raw?url=<encoded-url>
// Returns the raw upstream response body with its original Content-Type.
// Used by the in-page fetch/XHR interceptor so JS on proxied pages gets real
// API responses (not JSON-wrapped HTML) while the request originates from the server.
router.get('/raw', async (req, res) => {
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
    const upstream = await proxyFetch(parsed.href)

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buf = Buffer.from(await upstream.arrayBuffer())

    res.status(upstream.status)
    res.set('Content-Type', contentType)
    res.set('X-Proxy-Final-Url', upstream._proxyFinalUrl || parsed.href)
    // Allow the in-page script (same origin via srcdoc) to read the response
    res.set('Access-Control-Allow-Origin', '*')
    return res.send(buf)
  } catch (err) {
    return res.status(502).json({ error: `Proxy failed: ${err.message}` })
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
    const upstream = await proxyFetch(parsed.href)

    const finalUrl   = upstream._proxyFinalUrl || parsed.href
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

// POST /api/proxy?url=<encoded-url>
// Forwards a form POST through the proxy and returns {html, finalUrl}.
// Used by the in-page POST form interceptor so CAPTCHA submissions and other
// POST forms are proxied server-side instead of going directly from the browser.
router.post('/', async (req, res) => {
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

  // Reconstruct body — accept either urlencoded or raw text
  const rawBody = typeof req.body === 'string'
    ? req.body
    : (req.body && Object.keys(req.body).length
        ? new URLSearchParams(req.body).toString()
        : null)
  const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded'

  try {
    const upstream = await proxyFetch(parsed.href, 'POST', rawBody, contentType)
    const finalUrl = upstream._proxyFinalUrl || parsed.href
    const upCt     = (upstream.headers.get('content-type') || 'text/html').toLowerCase()

    let html = await upstream.text()

    if (upCt.includes('text/html') || upCt.includes('application/xhtml')) {
      const baseHref = finalUrl.replace(/[^/]+$/, '') || new URL(finalUrl).origin + '/'
      if (!/<base\b/i.test(html)) {
        html = html.replace(/(<head\b[^>]*>)/i, `$1\n<base href="${baseHref}">`)
        if (!html.includes('<base')) html = `<base href="${baseHref}">\n` + html
      }
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, INTERCEPTOR + '</head>')
      } else {
        html = INTERCEPTOR + html
      }
      return res.json({ html, finalUrl, type: 'html' })
    }

    // Non-HTML POST response — just return finalUrl so client can re-navigate
    return res.json({ html: '', finalUrl, type: 'redirect' })

  } catch (err) {
    return res.status(502).json({ error: `Could not reach ${parsed.hostname}: ${err.message}` })
  }
})
