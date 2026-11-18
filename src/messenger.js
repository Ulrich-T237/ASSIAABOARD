'use strict'

// The Messenger channel for ASSIAA — nothing more than a transport.
// Every decision (greeting, menu, AGC memory, devis, sinistre, language) is made
// by the exact same pipeline the WhatsApp bot and the web assistant use.

const https = require('https')
const crypto = require('crypto')

const cfg = require('./config')
const pipeline = require('./pipeline')
const sessions = require('./session')
const { detectLang } = require('./lang')

/* ------------------------------------------------------------------ logging */

function log(...args) {
  console.log('[messenger]', ...args)
}

/* ------------------------------------------------------- signature + tokens */

/** Meta signs every webhook POST: X-Hub-Signature-256 = "sha256=" + HMAC(secret, rawBody) */
function verifySignature(rawBody, header) {
  if (!cfg.FB_APP_SECRET) return true // not configured yet: development mode
  if (!header || !String(header).startsWith('sha256=')) return false
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', cfg.FB_APP_SECRET).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(String(header))
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Meta's GET handshake: echo hub.challenge when hub.verify_token matches. */
function verifyHandshake(query) {
  if (String(query['hub.mode'] || '') !== 'subscribe') return null
  const token = String(query['hub.verify_token'] || '')
  if (!cfg.VERIFY_TOKEN || token !== cfg.VERIFY_TOKEN) return null
  return String(query['hub.challenge'] || '')
}

/** Meta's data-deletion callback posts a signed_request we must validate. */
function readSignedRequest(signed) {
  try {
    const [sig, payload] = String(signed).split('.')
    if (!sig || !payload) return null
    const expected = crypto
      .createHmac('sha256', cfg.FB_APP_SECRET)
      .update(payload)
      .digest('base64url')
    if (expected !== sig) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch (e) {
    return null
  }
}

/* ---------------------------------------------------------------- outbound */

function graphRequest(path, body, method = 'POST') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {})
    const url = new URL(`${cfg.GRAPH_BASE}/${cfg.GRAPH_VERSION}/${path}`)
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let out = ''
        res.on('data', (c) => (out += c))
        res.on('end', () => {
          let parsed = null
          try {
            parsed = JSON.parse(out)
          } catch (e) {
            parsed = { raw: out }
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed)
          else reject(Object.assign(new Error(`graph ${res.statusCode}`), { status: res.statusCode, body: parsed }))
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('graph timeout')))
    req.write(data)
    req.end()
  })
}

/** Real sender — swapped for a stub in tests (see __setSenderForTests). */
async function graphSend(psid, payload) {
  if (cfg.DRY_RUN || !cfg.PAGE_ACCESS_TOKEN) {
    log('DRY_RUN → outbound to', psid, JSON.stringify(payload).slice(0, 160))
    return { dryRun: true }
  }
  const query = `me/messages?access_token=${encodeURIComponent(cfg.PAGE_ACCESS_TOKEN)}`
  return graphRequest(query, Object.assign({ recipient: { id: psid } }, payload))
}

let sender = graphSend
function __setSenderForTests(fn) {
  sender = fn
}
function __resetSender() {
  sender = graphSend
}

async function typingOn(psid) {
  try {
    await sender(psid, { sender_action: 'typing_on' })
  } catch (e) {
    /* cosmetic — never break a reply because of the typing indicator */
  }
}

/** Messenger rejects anything above 2000 characters: split on paragraph/word boundaries. */
function splitMessage(text, limit = 1900) {
  const src = String(text || '')
  if (src.length <= limit) return [src]
  const parts = []
  let rest = src
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit)
    if (cut < limit * 0.5) cut = limit
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts.filter(Boolean)
}

async function sendText(psid, text) {
  const chunks = splitMessage(text)
  for (const chunk of chunks) {
    await sender(psid, { message: { text: chunk } })
  }
  return chunks.length
}

/** Quick replies for the menu: one tap instead of typing a number. */
function menuQuickReplies(lang) {
  const FR = [
    { title: '1️⃣ Automobile', payload: '1' },
    { title: '2️⃣ Santé', payload: '2' },
    { title: '6️⃣ Devis', payload: '6' },
    { title: '7️⃣ Sinistre', payload: '7' },
  ]
  const EN = [
    { title: '1️⃣ Motor', payload: '1' },
    { title: '2️⃣ Health', payload: '2' },
    { title: '6️⃣ Quote', payload: '6' },
    { title: '7️⃣ Claim', payload: '7' },
  ]
  return (lang === 'en' ? EN : FR).map((q) => ({
    content_type: 'text',
    title: q.title,
    payload: q.payload,
  }))
}

/* -------------------------------------------------- de-duplication + order */

const seen = new Map() // mid → timestamp
const SEEN_TTL = 10 * 60 * 1000
function alreadySeen(mid) {
  if (!mid) return false
  const now = Date.now()
  for (const [k, t] of seen) if (now - t > SEEN_TTL) seen.delete(k)
  if (seen.has(mid)) return true
  seen.set(mid, now)
  if (seen.size > 2000) seen.delete(seen.keys().next().value)
  return false
}

// One conversation at a time per PSID, so replies never arrive out of order.
const queues = new Map()
function enqueue(psid, job) {
  const prev = queues.get(psid) || Promise.resolve()
  const next = prev.then(job).catch((e) => log('job error', psid, e.message))
  queues.set(psid, next)
  next.finally(() => {
    if (queues.get(psid) === next) queues.delete(psid)
  })
  return next
}

/* ------------------------------------------------------------- handover */

const HANDOVER_RE =
  /\b(conseiller|conseill[eè]re|humain|humaine|agent|quelqu'?un|responsable|advisor|adviser|human|representative|manager)\b/i

const handedOver = new Map() // psid → timestamp
const HANDOVER_TTL = 60 * 60 * 1000

function isHandedOver(psid) {
  const t = handedOver.get(psid)
  if (!t) return false
  if (Date.now() - t > HANDOVER_TTL) {
    handedOver.delete(psid)
    return false
  }
  return true
}

const HANDOVER_FR =
  'Bien sûr 🤝 Je transmets notre conversation à un conseiller AGC, qui vous répondra ici même. ' +
  'Merci de votre patience.'
const HANDOVER_EN =
  'Of course 🤝 I’m passing this conversation to an AGC advisor, who will reply right here. ' +
  'Thank you for your patience.'

async function passToHuman(psid, lang) {
  handedOver.set(psid, Date.now())
  await sendText(psid, lang === 'en' ? HANDOVER_EN : HANDOVER_FR)
  try {
    await graphRequest(
      `me/pass_thread_control?access_token=${encodeURIComponent(cfg.PAGE_ACCESS_TOKEN)}`,
      {
        recipient: { id: psid },
        target_app_id: Number(cfg.HANDOVER_APP_ID),
        metadata: 'ASSIAA handover',
      }
    )
  } catch (e) {
    log('pass_thread_control failed (the inbox can still take over manually):', e.message)
  }
  if (cfg.ALERT_WEBHOOK_URL) {
    try {
      await fetch(cfg.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `ASSIAA: a visitor (${psid}) asked for a human on the AGC Page.` }),
      })
    } catch (e) {
      log('alert webhook failed', e.message)
    }
  }
  return 'handover'
}

/* --------------------------------------------------------------- inbound */

const ATTACHMENT_FR =
  'Merci pour votre envoi 📎 Je ne peux pas encore lire les pièces jointes ici. ' +
  'Décrivez-moi votre besoin en quelques mots, ou envoyez la pièce à un conseiller : agc@agc-assurances.com — +237 233 43 89 38.'
const ATTACHMENT_EN =
  'Thank you for your attachment 📎 I can’t read files here yet. ' +
  'Tell me what you need in a few words, or send the file to an advisor: agc@agc-assurances.com — +237 233 43 89 38.'

/** One Messenger event → ASSIAA's answer. Returns what happened (useful for tests). */
async function handleEvent(event) {
  // Echoes of our own messages, read receipts, deliveries, typing: ignore.
  if (event.message && event.message.is_echo) return 'echo'
  if (event.delivery) return 'delivery'
  if (event.read) return 'read'
  if (event.message && event.message.app_id) return 'echo'

  // A human returned the thread to us: resume normal service.
  if (event.pass_thread_control || event.take_thread_control) {
    const psid = event.sender && event.sender.id
    if (psid) handedOver.delete(psid)
    return 'control'
  }

  const psid = event.sender && event.sender.id
  if (!psid) return 'no-sender'

  const msg = event.message || {}
  const postback = event.postback || {}
  const mid = msg.mid || postback.mid
  if (alreadySeen(mid)) return 'duplicate'

  // Attachments with no text: acknowledge, never go silent.
  if (msg.attachments && msg.attachments.length && !msg.text) {
    const lang = sessionLang(psid)
    if (!isHandedOver(psid)) {
      await typingOn(psid)
      await sendText(psid, lang === 'en' ? ATTACHMENT_EN : ATTACHMENT_FR)
    }
    return 'attachment'
  }

  const text =
    msg.text ||
    (msg.quick_reply && msg.quick_reply.payload) ||
    postback.payload ||
    postback.title ||
    ''
  if (!text) return 'no-text'

  // A human owns this thread now: stay silent.
  if (isHandedOver(psid)) return 'handed-over'

  const lang = sessionLang(psid)

  // Explicit request for a person → hand over (never pretend to be human).
  if (HANDOVER_RE.test(text)) return passToHuman(psid, lang)

  // First contact: greet in the visitor's own language if we can tell it.
  const isFirst = !sessions.get(psid)
  const firstLang = detectLang(text, 'fr')
  const result = isFirst ? pipeline.start(psid, firstLang) : await pipeline.handle(psid, text)

  await typingOn(psid)

  const replies = result.replies || []
  for (let i = 0; i < replies.length; i++) {
    const isLast = i === replies.length - 1
    const quick = isFirst && isLast ? menuQuickReplies(result.lang) : undefined
    if (quick) {
      const chunks = splitMessage(replies[i])
      for (let c = 0; c < chunks.length; c++) {
        const last = c === chunks.length - 1
        await sender(psid, {
          message: last ? { text: chunks[c], quick_replies: quick } : { text: chunks[c] },
        })
      }
    } else {
      await sendText(psid, replies[i])
    }
  }

  return result.acted || 'answered'
}

function sessionLang(psid) {
  const s = sessions.get(psid)
  return s && s.lang === 'en' ? 'en' : 'fr'
}

/** Whole webhook body → list of events, processed in order, per conversation. */
async function handleWebhookBody(body) {
  const results = []
  const entries = (body && body.entry) || []
  for (const entry of entries) {
    const events = entry.messaging || []
    for (const event of events) {
      const psid = event.sender && event.sender.id
      if (psid) {
        await enqueue(psid, async () => results.push(await handleEvent(event)))
      } else {
        results.push(await handleEvent(event))
      }
    }
  }
  return results
}

module.exports = {
  verifySignature,
  verifyHandshake,
  readSignedRequest,
  handleWebhookBody,
  handleEvent,
  splitMessage,
  menuQuickReplies,
  sendText,
  passToHuman,
  isHandedOver,
  __setSenderForTests,
  __resetSender,
  graphRequest,
}
