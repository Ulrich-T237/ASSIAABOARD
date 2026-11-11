'use strict'

// ASSIAA's knowledge of the official AGC website.
//
// - data/pages/*.md      : local copy of the public pages (seeded once, committed to git)
// - data/site-cache.json : metadata (seededAt, last refresh attempts…)
//
// She learns by herself: a background refresher re-reads the site whenever it is up,
// and the Gemini brain can call the tool `read_agc_site` to read (and refresh) any
// official page on demand. When the site is unreachable, everything answers from the
// local copy.

const fs = require('fs')
const path = require('path')
const { norm, tokens } = require('./lang')
const cfg = require('./config')

/** The public pages ASSIAA knows about. */
const PAGE_DEFS = [
  { path: '/', file: 'index.md', url: 'https://agc-assurances.com/', title: 'AGC Assurances — accueil' },
  { path: '/a-propos/', file: 'a-propos.md', url: 'https://agc-assurances.com/a-propos/', title: 'À propos d’AGC' },
  { path: '/contact/', file: 'contact.md', url: 'https://agc-assurances.com/contact/', title: 'Contact & agences' },
  { path: '/assurance-auto/', file: 'assurance-auto.md', url: 'https://agc-assurances.com/assurance-auto/', title: 'Assurance automobile' },
  { path: '/assurance-sante-2/', file: 'assurance-sante.md', url: 'https://agc-assurances.com/assurance-sante-2/', title: 'Assurance santé & carte santé' },
  { path: '/assurance-voyage-2/', file: 'assurance-voyage.md', url: 'https://agc-assurances.com/assurance-voyage-2/', title: 'Assurance voyage' },
  { path: '/assurance-multirisques/', file: 'assurance-multirisques.md', url: 'https://agc-assurances.com/assurance-multirisques/', title: 'Assurance multirisques (MRH)' },
  { path: '/assurance-transport-2/', file: 'assurance-transport.md', url: 'https://agc-assurances.com/assurance-transport-2/', title: 'Assurance transport' },
  { path: '/responsabilite-civile/', file: 'rc-chef-famille.md', url: 'https://agc-assurances.com/responsabilite-civile/', title: 'Responsabilité civile — chef de famille' },
  { path: '/responsabilite-civile-du-chef-entreprise/', file: 'rc-chef-entreprise.md', url: 'https://agc-assurances.com/responsabilite-civile-du-chef-entreprise/', title: 'Responsabilité civile — chef d’entreprise' },
  { path: '/risques-techniques/', file: 'risques-techniques.md', url: 'https://agc-assurances.com/risques-techniques/', title: 'Risques techniques' },
]

const HOSTS_OK = new Set(['agc-assurances.com', 'www.agc-assurances.com'])

let meta = { seededAt: null, lastAttempt: null, lastOk: null, pages: {} }
const texts = new Map() // file -> string
let refreshing = false
let refreshTimerStarted = false

/* ------------------------------------------------------------------ storage */

function ensureDirs() {
  fs.mkdirSync(cfg.PAGES_DIR, { recursive: true })
}

function existingText(file) {
  return texts.get(file) || ''
}

/**
 * Quality gate: a refresh only replaces the local copy when the new extraction
 * is at least as good as what we have (enough real content, not navigation soup).
 * She learns from the site — but a bad scrape never degrades her memory.
 */
function isCleanerThan(oldText, newText) {
  if (!oldText || oldText.length < 200) return true
  const junkRatio = (t) => {
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return 1
    const junk = lines.filter((l) => /^[-–—•·|>\s]+$/.test(l) || l === '-').length
    return junk / lines.length
  }
  const oldJunk = junkRatio(oldText)
  const newJunk = junkRatio(newText)
  if (newJunk > 0.35 && newJunk >= oldJunk) return false
  if (newText.length < oldText.length * 0.45 && newJunk >= oldJunk) return false
  return true
}

function saveMeta() {
  ensureDirs()
  const tmp = cfg.CACHE_META + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2))
  fs.renameSync(tmp, cfg.CACHE_META)
}

function load() {
  ensureDirs()
  try {
    const raw = fs.readFileSync(cfg.CACHE_META, 'utf8')
    meta = { ...meta, ...JSON.parse(raw) }
  } catch {
    meta.seededAt = meta.seededAt || new Date().toISOString()
    meta.pages = {}
  }
  for (const def of PAGE_DEFS) {
    if (!meta.pages[def.path]) {
      meta.pages[def.path] = { url: def.url, file: def.file, title: def.title, fetchedAt: null }
    }
    try {
      texts.set(def.file, fs.readFileSync(path.join(cfg.PAGES_DIR, def.file), 'utf8'))
    } catch {
      texts.set(def.file, '')
    }
  }
}

function writeFileSafe(file, content) {
  ensureDirs()
  const full = path.join(cfg.PAGES_DIR, file)
  const tmp = full + '.tmp'
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, full)
}

/* ------------------------------------------------------------ html → text */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à',
  ccedil: 'ç', ugrave: 'ù', ocirc: 'ô', ecirc: 'ê', acirc: 'â', icirc: 'î', ucirc: 'û',
  euro: '€', copy: '©', reg: '®', hellip: '…', raquo: '»', laquo: '«',
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => (NAMED[name.toLowerCase()] != null ? NAMED[name.toLowerCase()] : m))
}

function htmlToText(html) {
  let s = String(html)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  // page furniture: menus, headers, footers, sidebars, forms, cookie bars
  s = s.replace(/<(nav|header|footer|aside|form|select|option|button)[\b][\s\S]*?<\/\1>/gi, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|section|article|h[1-6]|tr|table|ul|ol|blockquote|li)>/gi, '\n')
  s = s.replace(/<li[^>]*>/gi, '- ')
  s = s.replace(/<td[^>]*>/gi, ' | ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s.replace(/[ \t\u00a0]+/g, ' ')
  s = s.replace(/ ?\n ?/g, '\n')
  // drop furniture / separator lines
  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter((line) => {
      if (!line) return ''
      if (/^(cookie|cookies|accepter|tout accepter|menu|search|rechercher|fermer|close)$/i.test(line)) return false
      if (/^[-–—•·|>\s]+$/.test(line)) return false // pure separators
      return true
    })
    .join('\n')
  // keep bullet blocks tight, separate real paragraphs
  s = s.replace(/\n{2,}/g, '\n\n')
  return s.trim()
}

/** Heuristic: does this paragraph look like navigation/page furniture? */
function looksLikeNav(p) {
  const lines = p.split('\n').map((l) => l.trim()).filter(Boolean)
  if (p.startsWith('#')) return true // markdown heading (title already shown separately)
  if (p.length < 80 && /^[-\s]+$/.test(p)) return true
  const navWords = /(accueil|a propos|à propos|nos produits|actualités|actualites|faq|connexion|mentions l[eé]gales|agc centrafrique|carri[eè]res|appels d.?offres|nos agences\s*$)/i
  if (lines.length >= 3 && lines.every((l) => l.startsWith('-'))) {
    const short = lines.filter((l) => l.length < 26).length
    if (short >= lines.length * 0.6) return true // bullet soup (menus)
  }
  if (lines.length >= 3 && lines.length <= 12 && p.length < 350 && lines.filter((l) => navWords.test(l)).length >= 2) {
    return true
  }
  return false
}

/* ---------------------------------------------------------------- fetching */

async function fetchText(url, timeoutMs = 9000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'ASSIAA-AGC/1.0 (+https://agc-assurances.com; conseillère WhatsApp)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return htmlToText(html)
  } finally {
    clearTimeout(t)
  }
}

/* ---------------------------------------------------------------- refreshing */

/**
 * Re-read every known page from the live site. Keeps the local copy fresh
 * whenever the site is up; when it is down the local copy simply stays.
 */
async function refreshAll({ silent = false } = {}) {
  if (refreshing) return { skipped: true }
  refreshing = true
  meta.lastAttempt = new Date().toISOString()
  let okCount = 0
  try {
    for (const def of PAGE_DEFS) {
      try {
        const text = await fetchText(def.url, 9000)
        if (text && text.length > 100 && isCleanerThan(existingText(def.file), text)) {
          writeFileSafe(def.file, text + '\n')
          texts.set(def.file, text)
          meta.pages[def.path] = {
            ...(meta.pages[def.path] || {}),
            url: def.url, file: def.file, title: def.title,
            fetchedAt: new Date().toISOString(),
          }
        }
        okCount++
      } catch (err) {
        if (!silent) console.log(`[knowledge] refresh miss ${def.path}: ${err.message}`)
      }
      await new Promise((r) => setTimeout(r, 350)) // polite delay
    }
    if (okCount > 0) meta.lastOk = new Date().toISOString()
    saveMeta()
  } finally {
    refreshing = false
  }
  return { refreshed: okCount }
}

function startAutoRefresh() {
  if (refreshTimerStarted) return
  refreshTimerStarted = true
  // first refresh shortly after boot (never blocks startup)
  const first = setTimeout(() => { refreshAll({ silent: true }).catch(() => {}) }, 25000)
  const every = setInterval(() => { refreshAll({ silent: true }).catch(() => {}) }, 6 * 60 * 60 * 1000)
  first.unref?.()
  every.unref?.()
}

/* ------------------------------------------------------------ page helpers */

function resolvePath(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      const host = u.hostname.toLowerCase()
      const base = host === 'www.agc-assurances.com' ? 'agc-assurances.com' : host
      if (base !== 'agc-assurances.com') return { error: 'I can only read the official AGC site (agc-assurances.com).' }
      let p = u.pathname || '/'
      if (!p.endsWith('/')) p += '/'
      return { path: p }
    } catch {
      return { error: 'That does not look like a valid URL.' }
    }
  }
  let p = raw.startsWith('/') ? raw : '/' + raw
  if (!p.endsWith('/')) p += '/'
  return { path: p }
}

function defForPath(p) {
  return PAGE_DEFS.find((d) => d.path === p) || null
}

/**
 * The tool used by the Gemini brain: read a page from the live site,
 * refreshing the local copy on success; fall back to the local copy when
 * the site is unreachable.
 */
async function readPage(input) {
  const resolved = resolvePath(input)
  if (resolved.error) return { source: 'error', message: resolved.error }
  const p = resolved.path
  const def = defForPath(p)

  // Live read (also refreshes the local copy, subject to the quality gate)
  const url = def ? def.url : `https://agc-assurances.com${p}`
  if (HOSTS_OK.has('agc-assurances.com')) {
    try {
      const text = await fetchText(url, 9000)
      if (text && text.length > 100) {
        const file = def ? def.file : `extra${p.replace(/[^a-z0-9]+/gi, '_')}.md`
        if (isCleanerThan(existingText(file), text)) {
          writeFileSafe(file, text + '\n')
          texts.set(file, text)
        }
        if (def) {
          meta.pages[p] = { url: def.url, file: def.file, title: def.title, fetchedAt: new Date().toISOString() }
          meta.lastOk = new Date().toISOString()
          saveMeta()
        }
        const out = texts.get(file) || text
        return { source: 'live', url: p, title: def ? def.title : p, text: out.slice(0, 6000) }
      }
    } catch {
      // fall through to the local copy
    }
  }

  if (def && texts.get(def.file)) {
    return {
      source: 'local-copy (site unreachable right now)',
      url: p,
      title: def.title,
      text: texts.get(def.file).slice(0, 6000),
    }
  }
  return {
    source: 'local-copy',
    message: 'This page is not part of the local copy and the site is unreachable right now.',
    knownPages: PAGE_DEFS.map((d) => d.path),
  }
}

/* ---------------------------------------------------------------- searching */

const STOP = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'en', 'que', 'qui', 'pour', 'dans',
  'sur', 'au', 'aux', 'ce', 'est', 'avec', 'pas', 'plus', 'the', 'and', 'for', 'are', 'you',
  'your', 'with', 'that', 'this', 'from', 'what', 'how', 'why', 'when', 'who', 'is', 'of', 'to',
  'in', 'a', 'an', 'do', 'does', 'can', 'could', 'please', 'assurance', 'agc', 'assurances',
])

function keywords(s) {
  return tokens(s).filter((t) => t.length >= 3 && !STOP.has(t))
}

/** Paragraph-level search over the local copy. Returns best paragraphs joined. */
function search(query, { maxChars = 1200, maxParas = 4 } = {}) {
  const qk = new Set(keywords(query))
  if (!qk.size) return ''
  const scored = []
  for (const def of PAGE_DEFS) {
    const text = texts.get(def.file) || ''
    if (!text) continue
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40)
    for (const para of paras) {
      const pn = norm(para)
      let score = 0
      for (const k of qk) if (pn.includes(k)) score++
      if (score > 0) scored.push({ score, para, path: def.path })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, maxParas)
  if (!top.length) return ''
  let out = ''
  for (const t of top) {
    const piece = (out ? '\n' : '') + t.para
    if (out.length + piece.length > maxChars) break
    out += piece
  }
  return out
}

/* ------------------------------------------------------------ topic digests */

const TOPIC_FILES = {
  1: ['assurance-auto.md'],
  2: ['assurance-sante.md'],
  3: ['assurance-voyage.md'],
  4: ['assurance-multirisques.md'],
  5: ['assurance-transport.md', 'rc-chef-famille.md', 'risques-techniques.md'],
  8: ['assurance-sante.md'],
}

function leadOf(text, n = 4) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30 && !/^!\[/.test(p) && !looksLikeNav(p))
  return paras.slice(0, n).join('\n')
}

function paragraphsAbout(text, keyword, n = 3) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40)
  const hit = paras.filter((p) => norm(p).includes(norm(keyword)))
  return hit.slice(0, n).join('\n')
}

/** Digest for menu topics 1-5 and 8, straight from the local copy. */
function topicDigest(topic, lang = 'fr') {
  const files = TOPIC_FILES[topic] || []
  const parts = []
  for (const f of files) {
    const text = texts.get(f) || ''
    if (!text) continue
    if (topic === 8) {
      const focus = paragraphsAbout(text, 'carte santé', 3) || leadOf(text, 3)
      parts.push(focus)
    } else if (files.length > 1) {
      parts.push(leadOf(text, 2))
    } else {
      parts.push(leadOf(text, 5))
    }
  }
  const joined = parts.join('\n\n').trim()
  if (joined) return joined
  // last resort: search
  return search(topic === 8 ? 'carte santé' : 'produits assurance') || 'AGC — Le gage de votre sécurité.'
}

/* ------------------------------------------------------------------ branches */

const ENTRY_RE = /^\s*(Espace\s+Clients?\b|Customer\s+Service\b)/i
const ENTRY_END_RE = /^\s*(Horaires de travail|Email général|Standard siège)/i

/** Parse AGC branch entries line-by-line (works for both the seed and live text). */
function contactEntries() {
  const text = texts.get('contact.md') || ''
  const entries = []
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (cur) { entries.push(cur); cur = null }
      continue
    }
    if (ENTRY_END_RE.test(line)) {
      if (cur) { entries.push(cur); cur = null }
      continue
    }
    if (ENTRY_RE.test(line)) {
      if (cur) entries.push(cur)
      cur = [line]
      continue
    }
    if (cur) cur.push(line)
  }
  if (cur) entries.push(cur)
  return entries
}

function compactBlock(entryLines) {
  const name = entryLines[0]
  const rest = entryLines.slice(1)
  const addr = rest.find((l) => /face|immeuble|rond|carrefour|avenue|[ée]tage|[ée]ntr[ée]e|mile|pr[eè]s|bp|ancien|commercial|1er|bess[eè]ke|deïdo/i.test(l))
  const phone = rest.find((l) => /^\+?\d[\d\s.\-]{5,}$/.test(l))
  const parts = [name, addr, phone].filter(Boolean)
  // avoid repeating the name when it already contains the address/phone
  return [...new Set(parts)].join(' — ')
}

/**
 * Cities are not always written on the page (e.g. "Espace Clients Capitole"
 * serves Yaoundé) — aliases are AGC's own landmarks from the site.
 */
const CITY_ALIASES = {
  yaounde: ['yaounde', 'capitole', 'mimboman', 'tsinga', 'rond point express'],
  douala: ['douala', 'bonanjo', 'bonamoussadi', 'deido', 'dakar', 'bonaberi', 'akwa', 'siege'],
  buea: ['buea', 'mile 17'],
  bamenda: ['bamenda'],
  bafoussam: ['bafoussam'],
  garoua: ['garoua'],
  maroua: ['maroua'],
  ngaoundere: ['ngaoundere'],
  bertoua: ['bertoua'],
  kribi: ['kribi'],
  nkongsamba: ['nkongsamba'],
  mbouda: ['mbouda'],
  bafang: ['bafang'],
}

function branchesDigest(lang = 'fr', max = 8) {
  const entries = contactEntries().slice(0, max)
  if (!entries.length) {
    return lang === 'en'
      ? 'Our network of about 30 branches covers the whole of Cameroon — tell me your city and I’ll find your closest Espace Clients.'
      : 'Notre réseau d’une trentaine d’agences couvre tout le Cameroun — dites-moi votre ville et je trouve l’Espace Clients le plus proche.'
  }
  return entries.map((e) => '• ' + compactBlock(e)).join('\n')
}

function branchesFor(city) {
  const c = norm(city).trim()
  if (!c) return []
  const aliases = CITY_ALIASES[c] || [c]
  return contactEntries()
    .filter((entry) => {
      const hay = norm(entry.join(' '))
      return aliases.some((a) => hay.includes(norm(a)))
    })
    .map(compactBlock)
}

/* ------------------------------------------------------ hours & contact info */

const FALLBACK = {
  hoursFr: '🕘 Lundi – Vendredi : 08H à 18H\n🕘 Samedi : 09H à 13H\n🚫 Dimanche : fermé',
  hoursEn: '🕘 Monday – Friday: 8 AM to 6 PM\n🕘 Saturday: 9 AM to 1 PM\n🚫 Sunday: closed',
  address: 'Immeuble le Cauris, Rue Alfred Saker, près de l’église le Centenaire, Akwa, Douala — BP 1290',
  phones: ['+237 233 43 89 38', '+237 694 13 38 76'],
  email: 'agc@agc-assurances.com',
}

function hoursAndContact() {
  const about = texts.get('a-propos.md') || ''
  const contact = texts.get('contact.md') || ''
  const all = about + '\n' + contact

  let hoursFr = FALLBACK.hoursFr
  let hoursEn = FALLBACK.hoursEn
  const m = all.match(/Lundi\s*[–\-]\s*Vendredi\s*:\s*0?8\s*H[^S]*Samedi\s*:\s*0?9\s*H[^D]*Dimanche\s*:\s*[Ff]erm[^\n]*/)
  if (m) {
    hoursFr = '🕘 ' + m[0].replace(/\s+/g, ' ').trim()
    hoursEn = '🕘 Monday – Friday: 8 AM to 6 PM\n🕘 Saturday: 9 AM to 1 PM\n🚫 Sunday: closed'
  }

  // +237 with 9 national digits — grouped (233 43 89 38) or contiguous
  const phoneRe = /\+237[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}/g
  const found = []
  for (const src of [about, contact]) {
    for (const p of src.match(phoneRe) || []) {
      const normed = p.replace(/[\s.\-]+/g, ' ').trim()
      if (!found.includes(normed)) found.push(normed)
    }
  }
  // prefer the official numbers first, then whatever else the pages give
  const preferred = ['+237 233 43 89 38', '+237 694 13 38 76']
  const phones = []
  for (const p of preferred) if (found.some((f) => f.replace(/\s+/g, '') === p.replace(/\s+/g, ''))) phones.push(p)
  for (const f of found) if (!phones.includes(f) && phones.length < 3) phones.push(f)

  // the official address is the AGC mailbox — not the claims inbox
  const emailMatch =
    all.match(/agc@agc-assurances\.com/i) ||
    all.match(/[\w.+-]+@agc-assurances\.com/)

  const addressMatch = contact.match(/Immeuble le Cauris[^\n]*/) || about.match(/Immeuble le Cauris[^\n]*/)
  const address = addressMatch
    ? addressMatch[0].trim().replace(/\*\*/g, '') + ' — BP 1290 Douala'
    : FALLBACK.address

  return {
    hoursFr: hoursFr || FALLBACK.hoursFr,
    hoursEn: hoursEn || FALLBACK.hoursEn,
    address: address || FALLBACK.address,
    phones: phones.length ? phones.slice(0, 3) : FALLBACK.phones,
    email: emailMatch ? emailMatch[0] : FALLBACK.email,
  }
}

/* -------------------------------------------------------------- system digest */

function pageIndex() {
  return PAGE_DEFS.map((d) => `- ${d.path} — ${d.title}`).join('\n')
}

/** Compact digest of everything she knows, injected into the Gemini system prompt. */
function digest(maxPer = 300) {
  const parts = []
  for (const def of PAGE_DEFS) {
    const text = (texts.get(def.file) || '').trim()
    if (!text) continue
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 30)
    const lead = paras.slice(0, 2).join(' ').slice(0, maxPer)
    parts.push(`[${def.path}] ${def.title}: ${lead}`)
  }
  return parts.join('\n')
}

function pagesInfo() {
  return PAGE_DEFS.map((d) => ({
    path: d.path,
    title: d.title,
    fetchedAt: (meta.pages[d.path] || {}).fetchedAt || null,
    bytes: (texts.get(d.file) || '').length,
  }))
}

function status() {
  return {
    seededAt: meta.seededAt,
    lastAttempt: meta.lastAttempt,
    lastOk: meta.lastOk,
    pageCount: PAGE_DEFS.length,
  }
}

// Load immediately so the first message already has memory.
load()

module.exports = {
  PAGE_DEFS,
  load,
  refreshAll,
  startAutoRefresh,
  readPage,
  search,
  topicDigest,
  branchesDigest,
  branchesFor,
  hoursAndContact,
  pageIndex,
  digest,
  pagesInfo,
  status,
  htmlToText,
}
