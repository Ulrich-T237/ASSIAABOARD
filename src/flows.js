'use strict'

// Conversational flows: 6 = devis (quote request for a counsellor to price),
// 7 = sinistre (loss declaration recorded for AGC), Espace Clients (private
// contracts — she asks the city like a person).

const crypto = require('crypto')
const knowledge = require('./knowledge')

function ref(prefix) {
  const year = new Date().getFullYear()
  const n = crypto.randomInt(1000, 10000)
  return `${prefix}-${year}-${n}`
}

const FLOW_DEFS = {
  devis: {
    steps: ['product', 'name', 'city', 'notes'],
    doneRef: 'DEV',
    prompts: {
      product: {
        fr: 'Avec plaisir 🙂 Pour quel type d’assurance souhaitez-vous le devis ? *(auto, santé, voyage, MRH, transport, RC…)*',
        en: 'Happy to help 🙂 Which type of insurance is the quote for? *(motor, health, travel, home MRH, transport, RC…)*',
      },
      name: {
        fr: 'Merci 🙂 Votre nom et prénom, s’il vous plaît ?',
        en: 'Thank you 🙂 Your first and last name, please?',
      },
      city: {
        fr: 'Et dans quelle ville êtes-vous ? 🏙️',
        en: 'And which city are you in? 🏙️',
      },
      notes: {
        fr: 'Un détail utile ? *(véhicule, âges, surface…)* — ou tapez *passer* ⏭️',
        en: 'Any useful detail? *(vehicle, ages, surface…)* — or type *skip* ⏭️',
      },
    },
    done: {
      fr: (r) =>
        `C’est noté ✅\n\nVotre demande de devis est enregistrée sous la référence *${r}* et part vers les conseillers AGC. Un conseiller vous recontacte sur ce numéro pour le tarif exact 🌟`,
      en: (r) =>
        `All set ✅\n\nYour quote request is recorded as *${r}* and sent to the AGC counsellors. A counsellor will call you back on this number for the exact price 🌟`,
    },
  },
  sinistre: {
    steps: ['description', 'city', 'policy'],
    doneRef: 'SIN',
    prompts: {
      description: {
        fr: 'Je suis désolée que cela vous arrive 🙏 Décrivez le sinistre en quelques mots *(quoi, quand, où)* :',
        en: 'I’m sorry this happened to you 🙏 Please describe the loss in a few words *(what, when, where)*:',
      },
      city: {
        fr: 'Dans quelle ville ? 🏙️ *(ou tapez *passer*)*',
        en: 'Which city? 🏙️ *(or type *skip*)*',
      },
      policy: {
        fr: 'Avez-vous un numéro de contrat AGC ? *(sinon tapez *passer*)*',
        en: 'Do you have an AGC policy number? *(otherwise type *skip*)*',
      },
    },
    done: {
      fr: (r) =>
        `C’est enregistré ✅\n\nVotre déclaration est transmise à AGC sous la référence *${r}*. Un conseiller vous contacte pour la suite de la prise en charge. Courage à vous 🤝`,
      en: (r) =>
        `It’s recorded ✅\n\nYour declaration has been forwarded to AGC under reference *${r}*. A counsellor will contact you to take it from there. Hang in there 🤝`,
    },
  },
  espace: {
    steps: ['city'],
    prompts: {
      city: {
        fr: 'Avec plaisir 🙂 Dans quelle ville êtes-vous ? Je vous oriente vers le bon Espace Clients 📍',
        en: 'Of course 🙂 Which city are you in? I’ll point you to the right Espace Clients 📍',
      },
    },
  },
}

const SKIP_WORDS = new Set(['passer', 'skip', 'next', 'suivant', 'rien', 'none', 'non', 'no', 'sans'])

function startFlow(type, data = {}) {
  const def = FLOW_DEFS[type]
  if (!def) return null
  const flow = { type, step: 0, data: { ...data } }
  // skip steps already prefilled
  while (flow.step < def.steps.length && flow.data[def.steps[flow.step]] != null) flow.step++
  return { flow, firstPrompt: currentPrompt(flow, 'fr') }
}

function currentPrompt(flow, lang) {
  const def = FLOW_DEFS[flow.type]
  if (flow.step >= def.steps.length) return null
  const step = def.steps[flow.step]
  return def.prompts[step][lang !== 'en' ? 'fr' : 'en']
}

/**
 * Advance the running flow with the user's message.
 * Returns { replies, done, saved? } — the caller persists state and records.
 */
function advance(flow, text, lang, chatId, phone) {
  const fr = lang !== 'en'
  const def = FLOW_DEFS[flow.type]
  const raw = String(text || '').trim()

  if (flow.step >= def.steps.length) {
    return { replies: [], done: true }
  }

  const step = def.steps[flow.step]
  const value = SKIP_WORDS.has(raw.toLowerCase().replace(/[.!?]/g, '')) ? null : raw

  if (value != null) flow.data[step] = value.slice(0, 300)
  flow.step++

  // next prompt?
  if (flow.step < def.steps.length) {
    const next = def.steps[flow.step]
    // notes/skip-friendly steps: still ask (with skip hint inside the prompt)
    const prompt = def.prompts[next][fr ? 'fr' : 'en']
    return { replies: [prompt], done: false }
  }

  // finished → record it
  if (flow.type === 'devis' || flow.type === 'sinistre') {
    const r = ref(def.doneRef)
    const record = {
      ref: r,
      chatId,
      phone: phone || null,
      lang,
      product: flow.data.product || (flow.type === 'sinistre' ? '' : ''),
      name: flow.data.name || '',
      city: flow.data.city || '',
      notes: flow.data.notes || '',
      description: flow.data.description || '',
      policy: flow.data.policy || '',
      status: 'new',
      createdAt: new Date().toISOString(),
    }
    const done = def.done[fr ? 'fr' : 'en'](r)
    return { replies: [done], done: true, saved: { kind: flow.type, record } }
  }

  if (flow.type === 'espace') {
    const city = flow.data.city || ''
    const found = knowledge.branchesFor(city)
    let reply
    if (found.length) {
      const list = found.slice(0, 4).map((b) => `• ${b}`).join('\n')
      reply = fr
        ? `Voilà nos *Espace Clients* autour de *${city}* 📍\n\n${list}\n\nVos contrats et vos documents personnels y sont accessibles en toute sécurité 🙂 Besoin d’autre chose ?`
        : `Here are the *Espace Clients* around *${city}* 📍\n\n${list}\n\nYour policies and personal documents are safely accessible there 🙂 Anything else I can help with?`
    } else {
      reply = fr
        ? `Je n’ai pas encore d’Espace Clients listé pour *${city}* dans mes notes 🤔 — mais rassurez-vous, le réseau AGC couvre tout le Cameroun 🇨🇲. Le siège à Akwa (Immeuble le Cauris, Rue Alfred Saker, Douala) ou le +237 694 13 38 76 vous orienteront exactement 🙂 Dites-moi si je peux aider autrement !`
        : `I don’t have an Espace Clients listed for *${city}* in my notes yet 🤍 — but don’t worry, the AGC network covers all of Cameroon 🇨🇲. The head office in Akwa (Immeuble le Cauris, Rue Alfred Saker, Douala) or +237 694 13 38 76 will point you exactly 🙂 Anything else I can help with?`
    }
    return { replies: [reply], done: true }
  }

  return { replies: [], done: true }
}

/** First message that opens a given flow. */
function openingPrompt(type, lang) {
  const def = FLOW_DEFS[type]
  if (!def) return null
  const step = def.steps[0]
  return def.prompts[step][lang !== 'en' ? 'fr' : 'en']
}

module.exports = { FLOW_DEFS, startFlow, advance, openingPrompt }
