const BLOCKED = [/^localhost$/, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./]

export default {
  async fetch(request, env) {
    if (request.method !== 'POST')
      return new Response('Method Not Allowed', { status: 405 })

    const secret = request.headers.get('X-Proxy-Secret')
    if (!secret || secret !== env.PROXY_SECRET)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })

    let body
    try { body = await request.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const { url, method = 'GET', body: postBody = null, contentType = null } = body || {}
    if (!url) return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })

    let parsed
    try {
      parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      if (BLOCKED.some(r => r.test(parsed.hostname)))
        return new Response(JSON.stringify({ error: 'Blocked host' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const upstreamHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
      if (postBody && contentType) upstreamHeaders['Content-Type'] = contentType

      const upstream = await fetch(parsed.href, {
        method: method.toUpperCase(),
        headers: upstreamHeaders,
        body: (method.toUpperCase() !== 'GET' && postBody) ? postBody : undefined,
        redirect: 'follow',
      })

      const ct = upstream.headers.get('content-type') || 'application/octet-stream'
      const buffer = await upstream.arrayBuffer()

      return new Response(buffer, {
        status: upstream.status,
        headers: {
          'Content-Type': ct,
          'X-Final-Url': upstream.url || parsed.href,
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }
  },
}