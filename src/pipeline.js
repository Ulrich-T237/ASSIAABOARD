'use strict'

// The web version of ASSIAA's decision tree — identical behaviour to the WhatsApp
// assistant: greeting script → running flows → menu choices → Espace Clients → brain.
// Only difference: replies can carry a "Continuer vers WhatsApp" hand-off link.

const cfg = require('./config')
const sessions = require('./session')
const { detectLang, isGreeting, isCancel } = require('./lang')
const greeting = require('./greeting')
const flows = require('./flows')
const brain = require('./brain')

/** Build a wa.me link with a pre-filled message. */
function waLink(text) {
  const message = text || cfg.WHATSAPP_OPENER
  return `https://wa.me/${cfg.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

function waPayload(label, text) {
  return {
    url: waLink(text),
    label: label || 'Continuer vers WhatsApp',
    number: cfg.WHATSAPP_NUMBER,
  }
}

const ESACE_RE = [
  /espace\s+clients?/i,
  /(voir|consulter|acceder|recuperer|chercher|check|open|access)[^?.!]{0,25}mon\s+(numero\s+de\s+)?contrat/i,
  /mon\s+(numero\s+de\s+)?contrat/i,
  /\bmy\s+(policy|contract|policies)\b/i,
  /\b(contract|policy)\s+(number|details|status)\b/i,
]

function isEspaceIntent(text) {
  return ESACE_RE.some((re) => re.test(String(text || '')))
}

/** Opening state when the page/panel is opened: the greeting script, straight away. */
function start(sessionId, lang) {
  const session = sessions.getOrCreate(sessionId)
  const useLang = lang === 'en' ? 'en' : useLangOrDetected(session)
  session.flow = null
  const replies = greeting.greetingBundle(useLang)
  sessions.push(session, 'assistant', replies.join('\n'))
  return { sessionId: session.id, replies, lang: useLang, wa: waPayload() }
}

function useLangOrDetected(session) {
  return session.lang === 'en' ? 'en' : 'fr'
}

/**
 * Handle one user message.
 * @returns {{ sessionId:string, replies:string[], lang:'fr'|'en', wa?:object, acted:string }}
 */
async function handle(sessionId, text) {
  const session = sessions.getOrCreate(sessionId)
  const raw = String(text || '').trim()
  if (!raw) return { sessionId: session.id, replies: [], lang: session.lang, acted: 'empty' }

  let lang = detectLang(raw, session.lang)

  /* 1) THE SCRIPT — any greeting → full intro + menu (fresh start) */
  const g = isGreeting(raw)
  if (g.yes) {
    lang = g.lang
    session.flow = null
    const replies = greeting.greetingBundle(lang)
    sessions.push(session, 'user', raw)
    sessions.push(session, 'assistant', replies.join('\n'))
    return { sessionId: session.id, replies, lang, acted: 'greeting', wa: waPayload() }
  }

  /* 2) Cancellation */
  if (isCancel(raw)) {
    const hadFlow = Boolean(session.flow)
    session.flow = null
    const replies = []
    if (hadFlow) {
      replies.push(
        lang === 'en'
          ? 'No problem, we stop right there 🙂 What would you like to do next?'
          : 'Pas de souci, on s’arrête là 🙂 Que souhaitez-vous faire maintenant ?'
      )
    }
    replies.push(greeting.menuText(lang))
    sessions.push(session, 'user', raw)
    sessions.push(session, 'assistant', replies.join('\n'))
    return { sessionId: session.id, replies, lang, acted: 'cancel' }
  }

  /* 3) A running flow collects its next answer */
  if (session.flow && flows.FLOW_DEFS[session.flow.type]) {
    const flow = session.flow
    const result = flows.advance(flow, raw, lang, session.id, null)
    session.flow = result.done ? null : flow
    let wa

    if (result.saved) {
      const rec = result.saved.record
      const fr = lang !== 'en'
      // hand the collected details to WhatsApp so a counsellor can take over instantly
      const summary =
        result.saved.kind === 'devis'
          ? fr
            ? `Bonjour ASSIAA 👋 Je viens du site AGC.\nDemande de devis ${rec.ref}\n• Produit : ${rec.product || '—'}\n• Nom : ${rec.name || '—'}\n• Ville : ${rec.city || '—'}\n• Détail : ${rec.notes || '—'}`
            : `Hello ASSIAA 👋 I'm coming from the AGC website.\nQuote request ${rec.ref}\n• Product: ${rec.product || '—'}\n• Name: ${rec.name || '—'}\n• City: ${rec.city || '—'}\n• Details: ${rec.notes || '—'}`
          : fr
            ? `Bonjour ASSIAA 👋 Je viens du site AGC.\nDéclaration de sinistre ${rec.ref}\n• Description : ${rec.description || '—'}\n• Ville : ${rec.city || '—'}\n• Contrat : ${rec.policy || '—'}`
            : `Hello ASSIAA 👋 I'm coming from the AGC website.\nClaim ${rec.ref}\n• Description: ${rec.description || '—'}\n• City: ${rec.city || '—'}\n• Policy: ${rec.policy || '—'}`
      wa = waPayload(fr ? 'Continuer vers WhatsApp' : 'Continue on WhatsApp', summary)
      result.replies.push(
        fr
          ? 'Un conseiller AGC prend le relais 👍 Et si vous voulez accélérer, continuez directement sur WhatsApp avec le bouton ci-dessous — votre demande y est déjà résumée.'
          : 'An AGC counsellor takes over from here 👍 Want to speed it up? Tap the button below to continue on WhatsApp — your request is already summarised there.'
      )
      // best-effort trace on the server (no database needed)
      console.log(`[web] ${result.saved.kind} ${rec.ref} — ${rec.name || rec.city || 'anon'} — ${rec.product || rec.description || ''}`)
    }

    sessions.push(session, 'user', raw)
    if (result.replies.length) sessions.push(session, 'assistant', result.replies.join('\n'))
    return { sessionId: session.id, replies: result.replies, lang, acted: 'flow', wa: wa || waPayload() }
  }

  /* 4) Menu — number or keyword */
  const choice = greeting.detectChoice(raw)
  if (choice === 6 || choice === 7) {
    const type = choice === 6 ? 'devis' : 'sinistre'
    const opened = flows.startFlow(type, {})
    session.flow = opened.flow
    const replies = [flows.openingPrompt(type, lang)]
    sessions.push(session, 'user', raw)
    sessions.push(session, 'assistant', replies[0])
    return { sessionId: session.id, replies, lang, acted: 'menu', wa: waPayload() }
  }
  if (choice != null) {
    const reply = greeting.answerTopic(choice, lang)
    sessions.push(session, 'user', raw)
    sessions.push(session, 'assistant', reply)
    return { sessionId: session.id, replies: [reply], lang, acted: 'menu', wa: waPayload() }
  }

  /* 5) Private contracts → Espace Clients (she asks the city) */
  if (isEspaceIntent(raw)) {
    const opened = flows.startFlow('espace', {})
    session.flow = opened.flow
    const replies = [flows.openingPrompt('espace', lang)]
    sessions.push(session, 'user', raw)
    sessions.push(session, 'assistant', replies[0])
    return { sessionId: session.id, replies, lang, acted: 'espace', wa: waPayload() }
  }

  /* 6) Everything else → the same Gemini brain, same knowledge, same tool */
  const history = sessions.recent(session, 24)
  const reply = await brain.chat({ history, userText: raw, lang })
  sessions.push(session, 'user', raw)
  sessions.push(session, 'assistant', reply)
  return { sessionId: session.id, replies: [reply], lang, acted: 'brain', wa: waPayload() }
}

module.exports = { start, handle, waLink, waPayload, isEspaceIntent }
