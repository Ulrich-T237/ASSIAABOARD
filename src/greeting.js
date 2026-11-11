'use strict'

// THE ONLY SCRIPT: greeting + menu.
// Everything else is the Gemini brain. Menu choices may be typed as a number or as words.

const { doualaHour, timeSlot, norm, tokens } = require('./lang')
const knowledge = require('./knowledge')

/* ------------------------------------------------------------------ greeting */

function slotWord(lang, hour = doualaHour()) {
  const slot = timeSlot(hour)
  if (lang === 'en') {
    if (slot === 'morning') return 'Good morning ☀️🌸'
    if (slot === 'afternoon') return 'Good afternoon 🌤️😊'
    return 'Good evening 🌙✨'
  }
  if (slot === 'morning') return 'Bonjour ☀️🌸'
  if (slot === 'afternoon') return 'Bon après-midi 🌤️😊'
  return 'Bonsoir 🌙✨'
}

/** The full greeting bubble (exact AGC script), language + Douala clock aware. */
function greetingText(lang, hour = doualaHour()) {
  const slot = slotWord(lang, hour)
  if (lang === 'en') {
    return [
      slot,
      '',
      'I’m *ASSIAA* ☺️',
      'your advisor at Assurances Générales du Cameroun (AGC) 🛡️',
      '',
      'My name is inspired by a beautiful Cameroonian expression 🇨🇲💛 — compassion, listening, comfort, and standing with someone going through a hard time. 🤝',
      '',
      'I’m glad to walk with you. So tell me: how can I help you today? ✨😊',
    ].join('\n')
  }
  return [
    slot,
    '',
    'Je suis *ASSIAA* ☺️',
    'votre conseillère Assurances Générales du Cameroun (AGC) 🛡️',
    '',
    'Mon nom est inspiré d’une belle expression camerounaise 🇨🇲💛 : elle parle de compassion, d’écoute, de réconfort et de solidarité envers une personne qui traverse un moment difficile. 🤝',
    '',
    'Je suis ravie de vous accompagner. Alors, dites-moi : comment puis-je vous aider aujourd’hui ? ✨😊',
  ].join('\n')
}

/** The numbered menu bubble (numbers first — words work too). */
function menuText(lang) {
  if (lang === 'en') {
    return [
      '1️⃣ Motor 🚗',
      '2️⃣ Health 🏥',
      '3️⃣ Travel ✈️',
      '4️⃣ Home MRH 🏠',
      '5️⃣ Other products 📦',
      '6️⃣ Get a quote 💬',
      '7️⃣ File a claim 🚨',
      '8️⃣ Health card 🪪',
      '9️⃣ Our branches 📍',
      '🔟 Hours & contact 🕒',
      '',
      'Type a number or a keyword 🙂',
    ].join('\n')
  }
  return [
    '1️⃣ Automobile 🚗',
    '2️⃣ Santé 🏥',
    '3️⃣ Voyage ✈️',
    '4️⃣ MRH habitation 🏠',
    '5️⃣ Autres produits 📦',
    '6️⃣ Demander un devis 💬',
    '7️⃣ Déclarer un sinistre 🚨',
    '8️⃣ Carte santé 🪪',
    '9️⃣ Nos agences 📍',
    '🔟 Horaires & contact 🕒',
    '',
    'Tapez un numéro ou un mot-clé 🙂',
  ].join('\n')
}

/** Full greeting = intro bubble + menu bubble (sent in this order). */
function greetingBundle(lang, hour = doualaHour()) {
  return [greetingText(lang, hour), menuText(lang)]
}

/* ---------------------------------------------------------------------- menu */

const KEYWORDS = [
  { n: 1, words: ['automobile', 'auto', 'voiture', 'vehicule', 'vehicules', 'motor', 'vehicle', 'vehicles'] },
  { n: 2, words: ['sante', 'health', 'medical', 'mutuelle'] },
  { n: 3, words: ['voyage', 'travel', 'travels'] },
  { n: 4, words: ['mrh', 'habitation', 'maison', 'home', 'logement', 'multirisque', 'multirisques'] },
  { n: 5, words: ['autre', 'autres', 'other', 'produit', 'produits', 'product', 'products', 'transport', 'technique', 'techniques', 'risques', 'rc', 'responsabilite'] },
  { n: 6, words: ['devis', 'quote', 'quotation'] },
  { n: 7, words: ['sinistre', 'sinistres', 'claim', 'claims', 'accident', 'declarer', 'declaration'] },
  { n: 8, words: ['carte', 'card'] },
  { n: 9, words: ['agence', 'agences', 'branch', 'branches', 'succursale', 'succursales'] },
  { n: 10, words: ['horaire', 'horaires', 'hours', 'hour', 'contact', 'contacts', 'joindre', 'joignable', 'email', 'telephone', 'telephones', 'coordonnees'] },
]

const INTERROGATIVES = new Set([
  'comment', 'combien', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles', 'qui', 'que',
  'quoi', 'ou', 'estce', 'how', 'much', 'many', 'why', 'when', 'where', 'who', 'what',
  'which', 'is', 'does', 'do', 'can', 'could', 'would', 'should', 'price', 'cost',
])

/**
 * Detect a menu choice: a bare number (1-10) or a short keyword phrase
 * ("devis", "horaires", "santé"…). Questions always go to the brain instead.
 * Returns 1..10 or null.
 */
function detectChoice(text) {
  const raw = String(text || '').trim()
  // bare number, optionally prefixed ("numéro 6", "option 3", "#9")
  const numMatch = raw.match(/^(?:num(?:e|é|éro|ero)?|option|choix|choice|#)?\s*(\d{1,2})[.!?]?$/i)
  if (numMatch) {
    const n = parseInt(numMatch[1], 10)
    if (n >= 1 && n <= 10) return n
    return null
  }

  const clean = norm(raw).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const toks = clean.split(' ').filter(Boolean)
  if (!toks.length || toks.length > 6 || clean.length > 48) return null
  if (clean.includes('?')) return null
  if (toks.some((t) => INTERROGATIVES.has(t))) return null

  // earliest keyword in the message wins
  let best = null
  let bestIdx = Infinity
  for (const entry of KEYWORDS) {
    for (const w of entry.words) {
      const idx = clean.split(w).length > 1 ? clean.indexOf(' ' + w) : -1
      const at = clean === w ? 0 : idx >= 0 ? idx : clean.startsWith(w + ' ') ? 0 : -1
      if (at >= 0 && at < bestIdx) {
        bestIdx = at
        best = entry.n
      }
    }
  }
  return best
}

/* ------------------------------------------------------- deterministic answers */

const PRODUCT_TITLES = {
  1: { fr: 'Assurance Automobile 🚗', en: 'Motor insurance 🚗' },
  2: { fr: 'Assurance Santé 🏥', en: 'Health insurance 🏥' },
  3: { fr: 'Assurance Voyage ✈️', en: 'Travel insurance ✈️' },
  4: { fr: 'Multirisque Habitation 🏠', en: 'Home MRH 🏠' },
  5: { fr: 'Autres produits 📦', en: 'Other products 📦' },
  8: { fr: 'Carte santé AGC 🪪', en: 'AGC health card 🪪' },
}

function clip(text, max = 1100) {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
  return (stop > max * 0.5 ? cut.slice(0, stop) : cut).trim() + '…'
}

/**
 * Compose the menu answer for topics 1-5, 8, 9, 10 from the AGC site memory.
 * Topic 6 (quote) and 7 (claim) are handled by the flows in pipeline.js.
 */
function answerTopic(n, lang) {
  const fr = lang !== 'en'

  if (n === 10) {
    const info = knowledge.hoursAndContact()
    if (fr) {
      return [
        '*Horaires & contact AGC* 🕒',
        '',
        info.hoursFr,
        '',
        `📍 *Siège* : ${info.address}`,
        `📞 ${info.phones.join(' — ')}`,
        `📧 ${info.email}`,
        '',
        'Dites-moi si vous avez besoin d’autre chose 🙂',
      ].join('\n')
    }
    return [
      '*Hours & contact AGC* 🕒',
      '',
      info.hoursEn,
      '',
      `📍 *Head office*: ${info.address}`,
      `📞 ${info.phones.join(' — ')}`,
      `📧 ${info.email}`,
      '',
      'Tell me if you need anything else 🙂',
    ].join('\n')
  }

  if (n === 9) {
    const digest = knowledge.branchesDigest(fr ? 'fr' : 'en')
    if (fr) {
      return [
        '*Nos agences* 📍',
        '',
        digest,
        '',
        'Dans quelle ville êtes-vous ? Je vous oriente vers l’Espace Clients le plus proche 🙂',
      ].join('\n')
    }
    return [
      '*Our branches* 📍',
        '',
        digest,
        '',
        'Which city are you in? I’ll point you to the closest Espace Clients 🙂',
    ].join('\n')
  }

  const title = PRODUCT_TITLES[n]
  const digest = knowledge.topicDigest(n, fr ? 'fr' : 'en')
  const intro = fr
    ? `*${title.fr}* 🛡️`
    : `*${title.en}* 🛡️`
  const cta = fr
    ? 'Souhaitez-vous un devis ? Tapez *6* et je prépare votre demande 💬'
    : 'Would you like a quote? Type *6* and I’ll prepare your request 💬'
  return [intro, '', clip(digest), '', cta].join('\n')
}

module.exports = {
  slotWord,
  greetingText,
  menuText,
  greetingBundle,
  detectChoice,
  answerTopic,
}
