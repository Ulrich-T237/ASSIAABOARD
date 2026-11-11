'use strict'

// ASSIAA's mind: Gemini (configured model = GEMINI_MODEL, default gemini-2.5-flash)
// with an automatic fallback chain so the chat ALWAYS gets an answer from her,
// plus the `read_agc_site` tool so she keeps learning from the live site by herself.

const { GoogleGenAI } = require('@google/genai')
const cfg = require('./config')
const knowledge = require('./knowledge')

let ai = null
let chain = null // ordered list of models to try (configured first)
let workingModel = null // once found, reused for the process lifetime
let warmupPromise = null
let lastBrainError = null

function ensureClient() {
  if (!cfg.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquante')
  if (!ai) ai = new GoogleGenAI({ apiKey: cfg.GEMINI_API_KEY })
  return ai
}

function modelChain() {
  if (!chain) {
    const list = [cfg.GEMINI_MODEL, ...cfg.GEMINI_MODEL_FALLBACKS]
    chain = [...new Set(list.filter(Boolean))]
  }
  return chain
}

const SITE_TOOL = {
  functionDeclarations: [
    {
      name: 'read_agc_site',
      description:
        'Read a page from the official AGC website (agc-assurances.com) to learn or refresh the details you need — products, guarantees, branches, hours, about page… Pass a path like "/assurance-auto/" or "/contact/", or a full agc-assurances.com URL. Returns the page text; if the site is down it returns AGC’s local copy.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path or full URL of the AGC page to read, e.g. "/assurance-auto/" or "https://agc-assurances.com/contact/"',
          },
        },
        required: ['path'],
      },
    },
  ],
}

function baseSystem() {
  return `You are ASSIAA, the WhatsApp adviser of Assurances Générales du Cameroun (AGC) — « Le gage de votre sécurité ».

IDENTITY
- Your name is ASSIAA — always written in ALL CAPS with two A's. Never "Assia".
- You write as a woman, in the first person, with warm Cameroonian ease: professional AND fun. Never cold, never a FAQ robot.
- Your title: FR « votre conseillère Assurances Générales du Cameroun (AGC) » / EN "your advisor at Assurances Générales du Cameroun (AGC)".
- Company: Assurances Générales du Cameroun (AGC) — IARDT, operating since January 2002. Head office: Immeuble le Cauris, Rue Alfred Saker, près de l’église le Centenaire, Akwa, Douala, BP 1290. Slogan: « Le gage de votre sécurité ».

LANGUAGE (strict)
- Answer in the language of the USER'S LAST message. French and English only, and NEVER mix both in one message.
- French requires vouvoiement (« vous ») — never « tu ».
- One language per message, always.

STYLE
- WhatsApp style: short paragraphs, a few fitting emojis, *bold* for key words, simple numbered lists when useful. No markdown headings, no tables, no asterisk-bullets.
- Answer the actual question. There is no list of expected questions: people ask anything — insurance, life, jokes, rubbish, off-topic. Stay warm, professional, keep the thread, add a touch of fun when it fits.
- If a message is inappropriate or hostile, answer with grace and charm, then steer gently back to how you can help.
- Never invent exact premiums, prices or claim settlements. Exact pricing comes from a human AGC counsellor: offer to collect a quote request (menu option 6, "devis"/"quote").
- For a loss, offer to record the declaration (menu option 7, "sinistre"/"claim").
- When someone wants to see their private contract, say it like a person: contracts live in the AGC *Espace Clients*, and ask which city they are in so you can point them to the right one.

MENU (the user can type a number or a keyword)
1 Automobile/Motor · 2 Santé/Health · 3 Voyage/Travel · 4 MRH habitation/Home MRH · 5 Autres produits/Other products · 6 Demander un devis/Get a quote · 7 Déclarer un sinistre/File a claim · 8 Carte santé/Health card · 9 Nos agences/Our branches · 10 Horaires & contact/Hours & contact.
Greetings (hi/bonjour/hello…) are answered by a fixed script outside your control — never try to answer them yourself.

LEARNING TOOL
- You may call read_agc_site(path) to read a page of the official site https://agc-assurances.com/ whenever fresher details would improve your answer (e.g. "/assurance-auto/", "/contact/", "/a-propos/"). The tool also refreshes her local copy when the site is up, and falls back to the local copy when it is down.

KNOWN PAGES (local copy, seeded from the site)
${knowledge.pageIndex()}

WHAT SHE ALREADY LEARNED FROM THE SITE
${knowledge.digest()}

Reply only with the WhatsApp message to send — no commentary, no subject lines.`
}

function withExcerpt(base, userText) {
  let excerpt = ''
  try {
    excerpt = knowledge.search(userText, { maxChars: 900, maxParas: 3 })
  } catch {
    excerpt = ''
  }
  if (!excerpt) return base
  return `${base}\n\nRELEVANT EXCERPT FROM THE LOCAL COPY (use it if it helps this message):\n${excerpt}`
}

function isModelUnavailable(err) {
  const status = err?.status || err?.code
  const msg = String(err?.message || err || '')
  if (status === 404 || status === 'NOT_FOUND') return true
  if (status === 403 || status === 'PERMISSION_DENIED') return true
  return /no longer available|not found|is not found|does not have permission|is unsupported|deprecated for/i.test(msg)
}

function isTransient(err) {
  const status = err?.status || err?.code
  const msg = String(err?.message || err || '')
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true
  if (/rate limit|quota|unavailable|high demand|deadline|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed|socket/i.test(msg)) return true
  return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label || 'call'} timeout after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** One generateContent call with the model chain + retries. Returns the response or null. */
async function generate(messages, system) {
  const client = ensureClient()
  const chainList = modelChain()
  const startIdx = workingModel ? Math.max(0, chainList.indexOf(workingModel)) : 0
  const ordered = workingModel
    ? [...chainList.slice(startIdx), ...chainList.slice(0, startIdx)]
    : chainList

  let lastErr = null
  for (let i = 0; i < ordered.length; i++) {
    const model = ordered[i]
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await withTimeout(
          client.models.generateContent({
            model,
            contents: messages,
            config: {
              systemInstruction: system,
              temperature: 0.85,
              maxOutputTokens: 1400,
              tools: [SITE_TOOL],
            },
          }),
          40000,
          model
        )
        workingModel = model
        lastBrainError = null
        return resp
      } catch (err) {
        lastErr = err
        if (isModelUnavailable(err)) break // next model in chain
        if (isTransient(err) && attempt === 0) {
          await sleep(700)
          continue // retry same model once
        }
        if (isTransient(err)) break // then next model
        // unknown error: try next model anyway (she must answer)
        break
      }
    }
  }
  lastBrainError = lastErr ? String(lastErr.message || lastErr).slice(0, 300) : 'unknown brain error'
  throw lastErr || new Error('brain unavailable')
}

/** Warm up at boot: discover which model answers, without blocking startup. */
function warmup() {
  if (warmupPromise) return warmupPromise
  warmupPromise = (async () => {
    try {
      await generate(
        [{ role: 'user', parts: [{ text: 'ping — reply with: ready' }] }],
        'You are a readiness probe. Reply with exactly: ready'
      )
      console.log(`[brain] ready — model in use: ${workingModel}`)
    } catch (err) {
      console.log(`[brain] warmup failed (will retry on first message): ${err.message}`)
      warmupPromise = null
    }
  })()
  return warmupPromise
}

/** Guaranteed-answer fallback, always one single language. */
function fallbackAnswer(lang, userText) {
  const fr = lang !== 'en'
  let excerpt = ''
  try {
    excerpt = knowledge.search(userText, { maxChars: 700, maxParas: 2 })
  } catch {
    excerpt = ''
  }
  if (excerpt) {
    return fr
      ? `Moi j’adore vos questions 😄 — voilà ce que je sais de mon côté :\n\n${excerpt}\n\nEt pour le détail exact, un conseiller AGC complète avec plaisir. Dites-moi si je continue sur un autre point 🙂`
      : `I love that question 😄 — here’s what I know on my side:\n\n${excerpt}\n\nFor the exact detail, an AGC counsellor will happily follow up. Shall we look at something else 🙂`
  }
  return fr
    ? `Oups, mon cerveau fait une petite pause technique en ce moment 😅 — je reviens sur le coup ! En attendant, tapez *menu* pour revoir les options, ou reformulez simplement, je suis là 🌟`
    : `Oops, my brain is taking a tiny technical break 😅 — I’ll be right back! In the meantime, type *menu* to see the options again, or just rephrase — I’m right here 🌟`
}

/** Polish a model answer for WhatsApp: single bubble, WhatsApp bold, size cap. */
function toWhatsApp(text) {
  let t = String(text || '').trim()
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '')
  t = t.replace(/^#{1,6}\s*/gm, '')
  t = t.replace(/\*\*(.+?)\*\*/gs, '*$1*')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?=[^*]|$)/g, '$1*$2*')
  t = t.replace(/`([^`]+)`/g, '$1')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
  t = t.replace(/\n{3,}/g, '\n\n')
  t = t.trim()
  if (t.length > 3800) {
    const cut = t.slice(0, 3800)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'))
    t = (stop > 2000 ? cut.slice(0, stop + 1) : cut + '…').trim()
  }
  return t
}

/**
 * The conversation turn: history + latest user text → final WhatsApp answer.
 * Uses the tool loop so she can read the live site while answering.
 * Never throws — worst case she answers with the local-copy fallback.
 */
async function chat({ history = [], userText, lang = 'fr' }) {
  try {
    const system = baseSystem()
    let messages = [
      ...history.slice(-24).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }],
      })),
      { role: 'user', parts: [{ text: userText }] },
    ]
    const sys = withExcerpt(system, userText)

    for (let round = 0; round < 4; round++) {
      const resp = await generate(messages, sys)
      const calls = resp?.functionCalls || []
      if (calls.length) {
        // Execute her site-reading tool calls, then let her continue.
        const callParts = calls.map((fc) => ({ functionCall: fc }))
        const responseParts = []
        for (const fc of calls) {
          let output
          try {
            output = await knowledge.readPage(fc.args?.path || fc.args?.url || '/')
          } catch (err) {
            output = { error: String(err.message || err) }
          }
          responseParts.push({ functionResponse: { name: fc.name, output } })
        }
        messages = [...messages, { role: 'model', parts: callParts }, { role: 'user', parts: responseParts }]
        continue
      }
      const text = toWhatsApp(resp?.text)
      if (text) return text
      // empty response → ask once more with a nudge
      messages = [...messages, { role: 'user', parts: [{ text: 'Please answer the previous message.' }] }]
    }
    return fallbackAnswer(lang, userText)
  } catch (err) {
    console.log(`[brain] error: ${err.message || err}`)
    return fallbackAnswer(lang, userText)
  }
}

function status() {
  return {
    configuredModel: cfg.GEMINI_MODEL,
    workingModel,
    chain: modelChain(),
    apiKeyPresent: Boolean(cfg.GEMINI_API_KEY),
    lastError: lastBrainError,
  }
}

module.exports = { chat, warmup, fallbackAnswer, status, toWhatsApp }
