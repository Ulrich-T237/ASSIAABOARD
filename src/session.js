'use strict'

// In-process conversation memory for the web assistant.
// No database needed: the browser keeps a session id, the server keeps the thread
// (history + running flow) with a TTL. Ideal for a public website widget.

const cfg = require('./config')

const sessions = new Map() // id -> { id, lang, flow, history[], createdAt, updatedAt }

function now() {
  return Date.now()
}

function create() {
  const id = Math.random().toString(36).slice(2) + now().toString(36)
  const s = { id, lang: 'fr', flow: null, history: [], createdAt: now(), updatedAt: now() }
  sessions.set(id, s)
  prune()
  return s
}

function get(id) {
  if (!id) return null
  const s = sessions.get(id)
  if (!s) return null
  if (now() - s.updatedAt > cfg.SESSION_TTL_MS) {
    sessions.delete(id)
    return null
  }
  s.updatedAt = now()
  return s
}

function getOrCreate(id) {
  return get(id) || create()
}

function push(session, role, text) {
  const clean = String(text || '').slice(0, 4000)
  if (!clean) return
  session.history.push({ role, text: clean, at: now() })
  while (session.history.length > 40) session.history.shift()
  session.updatedAt = now()
}

function recent(session, limit = 24) {
  return session.history.slice(-limit).map((h) => ({ role: h.role, text: h.text }))
}

/** Drop expired sessions and enforce a hard cap (protects a small Render instance). */
function prune() {
  const t = now()
  for (const [id, s] of sessions) {
    if (t - s.updatedAt > cfg.SESSION_TTL_MS) sessions.delete(id)
  }
  if (sessions.size > cfg.SESSION_MAX) {
    const sorted = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt)
    for (const s of sorted.slice(0, sessions.size - cfg.SESSION_MAX)) sessions.delete(s.id)
  }
}

function stats() {
  return { sessions: sessions.size, ttlMin: Math.round(cfg.SESSION_TTL_MS / 60000) }
}

// keep the map small even during quiet periods
const timer = setInterval(prune, 10 * 60 * 1000)
timer.unref?.()

module.exports = { create, get, getOrCreate, push, recent, prune, stats }
