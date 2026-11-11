'use strict'

// Language + greeting + clock helpers.
// Language comes from the LAST user message. Greetings read the Douala clock (Africa/Douala).

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[\u2019\u2018\u02bc]/g, "'") // curly apostrophes → straight
}

function tokens(s) {
  return norm(s)
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Current hour in Douala (UTC+1, no DST). */
function doualaHour(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    hour12: false,
  })
  return parseInt(fmt.format(date), 10)
}

/** 'morning' | 'afternoon' | 'evening' according to the Douala clock. */
function timeSlot(hour = doualaHour()) {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  return 'evening'
}

const FR_MARKERS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'et', 'ou', 'est', 'sont',
  'je', 'vous', 'nous', 'pour', 'avec', 'dans', 'qui', 'que', 'quoi', 'pourquoi', 'comment',
  'combien', 'peux', 'peut', 'veux', 'voulez', 'voulez', 'vais', 'votre', 'mon', 'ma', 'mes',
  'ton', 'ta', 'tes', 'ce', 'cette', 'ces', 'sur', 'pas', 'plus', 'oui', 'merci', 'bonjour',
  'bonsoir', 'salut', 'svp', "s'il", "c'est", 'm', 'aidez', 'aider', 'aide', 'veut', 'voudrais',
  'faire', 'etre', 'avoir', 'aussi', 'apres', 'avant', 'chez', 'tout', 'tous', 'toute', 'toutes',
  'sinistre', 'sinistres', 'contrat', 'contrats', 'assure', 'assuree', 'dites', 'dis', 'peuton',
  'numeros', 'ville', 'jour', 'aujourd', 'demain', 'ici', 'maintenant', 'toujours', 'jamais',
])

const EN_MARKERS = new Set([
  'the', 'is', 'are', 'you', 'your', 'we', 'can', 'could', 'please', 'thanks', 'thank', 'what',
  'how', 'when', 'where', 'why', 'much', 'many', 'help', 'want', 'need', 'for', 'with', 'about',
  'quote', 'claim', 'hi', 'hello', 'good', 'morning', 'today', 'get', 'give', 'tell', 'info',
  'price', 'cost', 'does', 'did', 'have', 'has', 'would', 'should', 'there', 'their', 'this',
  'that', 'these', 'those', 'from', 'into', 'our', 'us', 'and', 'not', 'any', 'some', 'buy',
  'cover', 'covers', 'covered', 'insurance', 'coverages', 'buying',
  'assurance', /* EN speakers may use the FR word when writing to AGC */
  'thanks',
])

/**
 * Detect FR/EN from the message itself.
 * Falls back to the previous conversation language, then French (AGC's default).
 */
function detectLang(text, prev = 'fr') {
  const toks = tokens(text)
  if (!toks.length) return prev === 'en' ? 'en' : 'fr'
  let fr = 0
  let en = 0
  for (const t of toks) {
    if (FR_MARKERS.has(t)) fr++
    if (EN_MARKERS.has(t)) en++
  }
  if (fr > en) return 'fr'
  if (en > fr) return 'en'
  // tie → raw accents are a strong French signal
  if (/[\u00c0-\u024f]/.test(String(text))) return 'fr'
  return prev === 'en' ? 'en' : 'fr'
}

const GREETING_PRIMARY = new Set([
  'hi', 'hello', 'hey', 'yo', 'hiya', 'bonjour', 'bonsoir', 'salut', 'salutations',
  'greetings', 'good', 'bonne',
])
const GREETING_ALLOWED = new Set([
  ...GREETING_PRIMARY,
  'morning', 'afternoon', 'evening', 'day', 'journee', 'soiree', 'matinee', 'la',
  'there', 'everyone', 'all', 'folks',
])

/**
 * A pure greeting message ("hi", "hello!", "bonjour 🌞", "good evening"…).
 * Returns { yes, lang } — language from the greeting word itself.
 */
function isGreeting(text) {
  const t = tokens(text)
  if (!t.length || t.length > 5) return { yes: false }
  if (!t.every((w) => GREETING_ALLOWED.has(w))) return { yes: false }
  if (!t.some((w) => GREETING_PRIMARY.has(w))) return { yes: false }
  const hasFr = t.some((w) => ['bonjour', 'bonsoir', 'salut', 'salutations', 'bonne'].includes(w))
  const hasEn = t.some((w) => ['hi', 'hello', 'hey', 'yo', 'hiya', 'good', 'greetings'].includes(w))
  const lang = hasEn && !hasFr ? 'en' : 'fr'
  return { yes: true, lang }
}

/** Words that cancel any running flow (FR + EN). */
function isCancel(text) {
  const t = tokens(text)
  if (!t.length || t.length > 3) return false
  const set = new Set(t)
  const cancel = [
    'annuler', 'annule', 'cancel', 'stop', 'arret', 'menu', 'restart', 'recommencer',
    'retour', 'back', 'nevermind', 'never', 'oublie', 'forget',
  ]
  return cancel.some((w) => set.has(w))
}

module.exports = { norm, tokens, doualaHour, timeSlot, detectLang, isGreeting, isCancel }
