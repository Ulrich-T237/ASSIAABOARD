'use strict'

// Zero-dependency HTTP server for the Messenger channel of ASSIAA.
//   GET  /webhook            → Meta verification handshake (hub.challenge)
//   POST /webhook            → messages (signature-checked, 200 in milliseconds)
//   GET  /privacy            → privacy policy (required by App Review)
//   GET  /data-deletion      → data deletion instructions (required by App Review)
//   POST /data-deletion      → Meta's signed data-deletion callback
//   POST /api/simulate       → talk to the brain without Meta (guard: SIMULATE_TOKEN)
//   GET  /ping               → keep-alive for cron-job.org
//   GET  /api/health         → status + configuration report
//   GET  /                   → one-page status card

const http = require('http')

const cfg = require('./config')
const messenger = require('./messenger')
const knowledge = require('./knowledge')
const sessions = require('./session')
const pages = require('./pages')

const STARTED_AT = Date.now()

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body))
  res.writeHead(status, { 'content-type': type, 'content-length': payload.length })
  res.end(payload)
}

const json = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8')

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        req.destroy()
        return reject(new Error('payload too large'))
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function configReport() {
  return {
    app_id: !!cfg.FB_APP_ID,
    app_secret: !!cfg.FB_APP_SECRET,
    verify_token: !!cfg.VERIFY_TOKEN,
    page_access_token: !!cfg.PAGE_ACCESS_TOKEN,
    page_id: cfg.PAGE_ID || null,
    graph_version: cfg.GRAPH_VERSION,
    dry_run: cfg.DRY_RUN,
  }
}

function ready() {
  const r = configReport()
  return r.app_secret && r.verify_token && r.page_access_token
}

const CARD = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASSIAA — Messenger</title>
<style>
body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f6f7f9;margin:0;color:#111b2b}
.bar{background:#fff;border-bottom:3px solid #E2001A;padding:16px 22px;display:flex;gap:12px;align-items:center}
.blk{background:#E2001A;color:#fff;font-weight:800;padding:6px 10px;border-radius:6px}
.wrap{max-width:720px;margin:0 auto;padding:26px 22px 60px}
h1{color:#0A2A5E;font-size:24px;margin:0 0 4px}
p.sub{color:#5b6472;margin:0 0 20px;font-size:14px}
.card{background:#fff;border:1px solid #e3e6ec;border-radius:10px;padding:18px 20px;margin:14px 0}
.k{color:#0A2A5E;font-weight:700}
.ok{color:#0f7a3d;font-weight:700}.ko{color:#c8001b;font-weight:700}
code{background:#eef1f6;padding:2px 6px;border-radius:4px;font-size:13px}
a{color:#0B63CE}
</style></head><body>
<div class="bar"><span class="blk">AGC</span><strong style="color:#0A2A5E">ASSIAA — Messenger channel</strong></div>
<div class="wrap">
<h1>ASSIAA @ Facebook</h1>
<p class="sub">The same assistant as WhatsApp and the website, answering the AGC Page inbox.</p>
<div class="card"><span class="k">Status</span> — <span id="st">checking…</span></div>
<div class="card">
  <span class="k">Endpoints</span>
  <ul>
    <li><code>GET /webhook</code> — Meta verification handshake</li>
    <li><code>POST /webhook</code> — inbound messages</li>
    <li><code>GET /privacy</code> · <code>GET /data-deletion</code> — pages required by App Review</li>
    <li><code>GET /api/health</code> · <code>GET /ping</code></li>
  </ul>
</div>
<p style="color:#5b6472;font-size:12px">Assurances Générales du Cameroun — Le gage de votre sécurité.</p>
</div>
<script>
fetch('/api/health').then(r=>r.json()).then(d=>{
  document.getElementById('st').innerHTML = d.ready
    ? '<span class="ok">configured</span> · brain ' + d.brain + ' · ' + d.pages + ' AGC pages'
    : '<span class="ko">not configured yet</span> · missing: ' + d.missing.join(', ')
}).catch(()=>{ document.getElementById('st').textContent = 'offline' })
</script>
</body></html>`

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const query = {}
  for (const [k, v] of url.searchParams.entries()) query[k] = v

  // ---------------------------------------------------------------- webhook
  if (path === '/webhook') {
    if (req.method === 'GET') {
      const challenge = messenger.verifyHandshake(query)
      if (challenge === null) {
        console.warn('[webhook] handshake rejected — check VERIFY_TOKEN')
        return send(res, 403, 'Forbidden')
      }
      console.log('[webhook] handshake accepted by Meta')
      return send(res, 200, challenge)
    }

    if (req.method === 'POST') {
      const raw = await readBody(req)
      const sig = req.headers['x-hub-signature-256']
      if (!messenger.verifySignature(raw, sig)) {
        console.warn('[webhook] invalid signature — payload rejected')
        return send(res, 401, 'Invalid signature')
      }

      let body = null
      try {
        body = JSON.parse(raw.toString('utf8'))
      } catch (e) {
        return send(res, 400, 'Bad JSON')
      }

      // Meta expects a 200 within 5 seconds: acknowledge first, answer after.
      send(res, 200, 'EVENT_RECEIVED')
      setImmediate(() => {
        messenger
          .handleWebhookBody(body)
          .then((r) => console.log('[webhook] processed', JSON.stringify(r)))
          .catch((e) => console.error('[webhook] processing error', e.message))
      })
      return
    }
    return send(res, 405, 'Method not allowed')
  }

  // ------------------------------------------------------------ legal pages
  if (path === '/privacy' && req.method === 'GET') {
    return send(res, 200, pages.privacyPage(), 'text/html; charset=utf-8')
  }

  if (path === '/data-deletion') {
    if (req.method === 'GET') {
      return send(res, 200, pages.deletionPage(), 'text/html; charset=utf-8')
    }
    if (req.method === 'POST') {
      const raw = await readBody(req)
      let signed = ''
      try {
        const parsed = JSON.parse(raw.toString('utf8'))
        signed = parsed.signed_request || ''
      } catch (e) {
        const form = new URLSearchParams(raw.toString('utf8'))
        signed = form.get('signed_request') || ''
      }
      const data = signed ? messenger.readSignedRequest(signed) : null
      const userId = data && data.user_id ? String(data.user_id) : null
      const code = `DEL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      console.log('[data-deletion] request', code, userId ? `user ${userId}` : '(unverified)')
      return json(res, 200, {
        url: `${cfg.GRAPH_BASE}/${cfg.GRAPH_VERSION}/`,
        confirmation_code: code,
        status: 'pending',
        message:
          'Demande enregistrée. Suppression effective sous 30 jours. / Request recorded; deleted within 30 days.',
      })
    }
    return send(res, 405, 'Method not allowed')
  }

  // ----------------------------------------------------------- dev simulate
  if (path === '/api/simulate' && req.method === 'POST') {
    if (!cfg.SIMULATE_TOKEN) return json(res, 404, { error: 'disabled' })
    if (String(query.token || req.headers['x-simulate-token'] || '') !== cfg.SIMULATE_TOKEN) {
      return json(res, 401, { error: 'bad token' })
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    } catch (e) {
      return json(res, 400, { error: 'bad json' })
    }
    const psid = String(payload.psid || 'simulate-user')
    const text = String(payload.text || '')
    const outbox = []
    messenger.__setSenderForTests(async (to, p) => {
      outbox.push(p)
      return { simulated: true }
    })
    let acted = 'answered'
    try {
      acted = await messenger.handleEvent({
        sender: { id: psid },
        recipient: { id: cfg.PAGE_ID },
        timestamp: Date.now(),
        message: { mid: `sim-${Date.now()}-${Math.random()}`, text },
      })
    } finally {
      messenger.__resetSender()
    }
    return json(res, 200, {
      psid,
      acted,
      outbox: outbox.map((p) => (p.message && p.message.text) || p.sender_action || ''),
    })
  }

  // -------------------------------------------------------------- monitoring
  if (path === '/ping' && req.method === 'GET') {
    return send(res, 200, `ok ${Date.now()}`)
  }

  if ((path === '/api/health' || path === '/healthz') && req.method === 'GET') {
    const r = configReport()
    const missing = []
    if (!r.app_secret) missing.push('FB_APP_SECRET')
    if (!r.verify_token) missing.push('VERIFY_TOKEN')
    if (!r.page_access_token) missing.push('PAGE_ACCESS_TOKEN')
    return json(res, 200, {
      ok: true,
      name: cfg.DISPLAY_NAME,
      company: cfg.COMPANY,
      channel: 'messenger',
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      brain: cfg.GEMINI_MODEL,
      pages: knowledge.status().pageCount,
      sessions: sessions.stats ? sessions.stats() : undefined,
      graph: `${cfg.GRAPH_BASE}/${cfg.GRAPH_VERSION}`,
      ready: ready(),
      missing,
      config: r,
    })
  }

  if (path === '/' && req.method === 'GET') {
    return send(res, 200, CARD, 'text/html; charset=utf-8')
  }

  if (path === '/favicon.ico') return send(res, 204, '')

  return send(res, 404, 'Not found')
}

function startServer(port = cfg.PORT) {
  const server = http.createServer((req, res) => {
    router(req, res).catch((e) => {
      console.error('[server]', e.message)
      if (!res.headersSent) send(res, 500, 'Internal error')
    })
  })
  server.listen(port, '0.0.0.0', () => {
    const r = configReport()
    const missing = []
    if (!r.verify_token) missing.push('VERIFY_TOKEN')
    if (!r.page_access_token) missing.push('PAGE_ACCESS_TOKEN')
    if (!r.app_secret) missing.push('FB_APP_SECRET')
    console.log(`[server] ASSIAA Messenger on http://0.0.0.0:${port}/ — graph ${r.graph_version}`)
    console.log(
      missing.length
        ? `[server] waiting for: ${missing.join(', ')} (the webhook and /api/simulate still work)`
        : '[server] Meta credentials present — ready for the Page'
    )
  })
  return server
}

module.exports = { startServer, router }

if (require.main === module) startServer()
