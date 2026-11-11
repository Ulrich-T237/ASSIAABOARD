'use strict'

// Zero-dependency HTTP server for the AGC web assistant:
//   GET  /            → standalone assistant page
//   GET  /embed       → chat-only page (for iframes / the floating widget)
//   GET  /widget.js   → one-line embed: floating ASSIAA bubble on any page
//   POST /api/start   → greeting + menu (opens the assistant directly)
//   POST /api/chat    → one user message → ASSIAA's replies
//   POST /api/reset    → forget the conversation
//   GET  /api/health  → Render health / uptime
//   GET  /api/config  → public config (WhatsApp CTA details)

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const cfg = require('./config')
const pipeline = require('./pipeline')
const sessions = require('./session')
const knowledge = require('./knowledge')
const brain = require('./brain')

const STARTED_AT = Date.now()

/* ------------------------------------------------------------------ helpers */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function cors(req, res) {
  const origin = req.headers.origin || ''
  const allowAll = cfg.ALLOWED_ORIGINS.includes('*')
  const allowed = allowAll || cfg.ALLOWED_ORIGINS.includes(origin)
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let data = ''
    let tooBig = false
    req.on('data', (chunk) => {
      if (tooBig) return
      data += chunk
      if (data.length > limit) {
        tooBig = true
        data = ''
      }
    })
    req.on('end', () => {
      if (tooBig) return resolve({})
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function serveStatic(res, file, extraHeaders = {}) {
  const full = path.join(cfg.PUBLIC_DIR, file)
  if (!full.startsWith(cfg.PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' })
  fs.readFile(full, (err, data) => {
    if (err) return json(res, 404, { error: 'not found' })
    res.writeHead(200, {
      'content-type': MIME[path.extname(full)] || 'application/octet-stream',
      'cache-control': file === 'widget.js' ? 'public, max-age=300' : 'no-cache',
      'content-length': data.length,
      ...extraHeaders,
    })
    res.end(data)
  })
}

/* ----------------------------------------------------------- rate limiting */

const hits = new Map() // ip -> { count, resetAt }

function rateLimited(ip) {
  const t = Date.now()
  const rec = hits.get(ip)
  if (!rec || t > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: t + 60_000 })
    return false
  }
  rec.count++
  return rec.count > cfg.RATE_LIMIT_PER_MIN
}

const cleanup = setInterval(() => {
  const t = Date.now()
  for (const [ip, rec] of hits) if (t > rec.resetAt) hits.delete(ip)
}, 5 * 60_000)
cleanup.unref?.()

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  )
}

/* ---------------------------------------------------------------- handlers */

async function handleStart(req, res, body) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
  const out = pipeline.start(sessionId, body.lang === 'en' ? 'en' : undefined)
  json(res, 200, out)
}

async function handleChat(req, res, body) {
  const text = String(body.text || '').slice(0, 1500)
  if (!text.trim()) return json(res, 400, { error: 'empty message' })
  const out = await pipeline.handle(body.sessionId, text)
  json(res, 200, out)
}

function handleReset(req, res, body) {
  const s = sessions.get(body.sessionId)
  if (s) {
    s.flow = null
    s.history = []
  }
  json(res, 200, { ok: true })
}

/* ------------------------------------------------------------------ server */

function startServer() {
  knowledge.startAutoRefresh()
  brain.warmup()

  const server = http.createServer(async (req, res) => {
    cors(req, res)
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    try {
      /* ---- pages & assets */
      if (req.method === 'GET') {
        if (pathname === '/' || pathname === '/index.html') return serveStatic(res, 'index.html')
        if (pathname === '/embed') return serveStatic(res, 'index.html') // same UI, embedded chrome
        if (pathname === '/widget.js') return serveStatic(res, 'widget.js')
        if (pathname === '/demo') return serveStatic(res, 'demo.html')
        if (pathname === '/favicon.ico') return serveStatic(res, 'favicon.svg')
        if (pathname === '/manifest.webmanifest') return serveStatic(res, 'manifest.webmanifest')
        if (/^\/[a-z0-9._-]+\.(svg|png|jpg|css|js)$/i.test(pathname)) {
          return serveStatic(res, pathname.slice(1))
        }

        /* ---- api */
        if (pathname === '/api/health') {
          return json(res, 200, {
            ok: true,
            name: cfg.DISPLAY_NAME,
            company: cfg.COMPANY,
            uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
            whatsapp: cfg.WHATSAPP_NUMBER,
            ...sessions.stats(),
            brain: brain.status().workingModel || brain.status().configuredModel,
            pages: knowledge.pagesInfo().length,
          })
        }
        if (pathname === '/api/config') {
          return json(res, 200, {
            name: cfg.DISPLAY_NAME,
            company: cfg.COMPANY,
            slogan: cfg.SLOGAN,
            whatsappNumber: cfg.WHATSAPP_NUMBER,
            whatsappUrl: pipeline.waLink(),
            whatsappOpener: cfg.WHATSAPP_OPENER,
          })
        }
        return json(res, 404, { error: 'not found' })
      }

      if (req.method === 'POST') {
        const ip = clientIp(req)
        if (pathname === '/api/start') {
          if (rateLimited(ip)) return json(res, 429, { error: 'Too many requests — patientez un instant.' })
          return handleStart(req, res, await readBody(req))
        }
        if (pathname === '/api/chat') {
          if (rateLimited(ip)) return json(res, 429, { error: 'Trop de messages d’un coup — réessayez dans une minute 🙂' })
          return handleChat(req, res, await readBody(req))
        }
        if (pathname === '/api/reset') {
          return handleReset(req, res, await readBody(req))
        }
        return json(res, 404, { error: 'not found' })
      }

      json(res, 405, { error: 'method not allowed' })
    } catch (err) {
      console.error(`[web] ${err.stack || err.message}`)
      json(res, 500, { error: 'internal error' })
    }
  })

  server.listen(cfg.PORT, '0.0.0.0', () => {
    console.log(`[web] ASSIAA web assistant on http://0.0.0.0:${cfg.PORT}/ (embed: /embed · widget: /widget.js)`)
    console.log(`[web] WhatsApp hand-off → +${cfg.WHATSAPP_NUMBER.replace(/^(\d{3})/, '$1 ')}`)
  })
  server.on('error', (err) => console.error(`[web] listen failed: ${err.message}`))
  return server
}

module.exports = { startServer }
