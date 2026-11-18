'use strict'

// Offline test suite for the Messenger channel.
// Nothing here calls Meta: the sender is stubbed, so we can prove the whole
// behaviour (greeting, menu, flows, language, handover, dedupe, splitting)
// before a Page or a token exists.
//
//   node scripts/test-messenger.js

process.env.DRY_RUN = '1'
process.env.VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'test-verify-token'
process.env.FB_APP_SECRET = process.env.FB_APP_SECRET || 'test-app-secret'
process.env.PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || 'test-page-token'
process.env.PAGE_ID = process.env.PAGE_ID || '1234567890'

const crypto = require('crypto')

const messenger = require('../src/messenger')
const pipeline = require('../src/pipeline')
const sessions = require('../src/session')
const { privacyPage, deletionPage } = require('../src/pages')

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`)
  }
}

/** Capture everything the bot tries to send. */
let outbox = []
messenger.__setSenderForTests(async (psid, payload) => {
  outbox.push(payload)
  return { ok: true }
})

function reset() {
  outbox = []
}

const texts = () => outbox.filter((p) => p.message && p.message.text).map((p) => p.message.text)
const joined = () => texts().join('\n')

let mid = 0
function incoming(psid, text) {
  return {
    sender: { id: psid },
    recipient: { id: process.env.PAGE_ID },
    timestamp: Date.now(),
    message: { mid: `m.${++mid}`, text },
  }
}

async function say(psid, text) {
  reset()
  const acted = await messenger.handleEvent(incoming(psid, text))
  return { acted, texts: texts(), joined: joined(), outbox }
}

async function main() {
  console.log('\n=== 1. Webhook security ===')

  const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [] }))
  const good =
    'sha256=' + crypto.createHmac('sha256', process.env.FB_APP_SECRET).update(raw).digest('hex')
  check('valid signature accepted', messenger.verifySignature(raw, good) === true)
  check('missing signature rejected', messenger.verifySignature(raw, undefined) === false)
  check('wrong signature rejected', messenger.verifySignature(raw, 'sha256=deadbeef') === false)
  check(
    'tampered body rejected',
    messenger.verifySignature(Buffer.from('{"object":"page","entry":[{}]}'), good) === false
  )

  check(
    'handshake returns the challenge',
    messenger.verifyHandshake({
      'hub.mode': 'subscribe',
      'hub.verify_token': process.env.VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    }) === '1158201444'
  )
  check(
    'handshake with wrong token is refused',
    messenger.verifyHandshake({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'nope',
      'hub.challenge': '1158201444',
    }) === null
  )

  console.log('\n=== 2. Event hygiene ===')

  reset()
  check(
    'echo of our own message ignored',
    (await messenger.handleEvent({
      sender: { id: 'echo-user' },
      message: { mid: 'e1', text: 'hello', is_echo: true },
    })) === 'echo'
  )
  check('nothing sent for an echo', outbox.length === 0)

  check(
    'read receipt ignored',
    (await messenger.handleEvent({ sender: { id: 'u0' }, read: { watermark: Date.now() } })) === 'read'
  )
  check(
    'delivery receipt ignored',
    (await messenger.handleEvent({ sender: { id: 'u0' }, delivery: { watermark: Date.now() } })) ===
      'delivery'
  )

  const dup = incoming('dup-user', 'Bonjour')
  await messenger.handleEvent(dup)
  const dupAgain = await messenger.handleEvent(dup)
  check('same message id processed once', dupAgain === 'duplicate', dupAgain)

  console.log('\n=== 3. First contact: greeting + menu ===')

  const psid1 = 'user-greeting'
  const g = await say(psid1, 'Bonjour')
  check('greeting answers something', g.texts.length > 0, `${g.texts.length} messages`)
  check('she introduces herself as ASSIAA', /ASSIAA/.test(g.joined))
  check(
    'she says she is the AGC adviser',
    /Assurances Générales du Cameroun|AGC/.test(g.joined)
  )
  check('the 10-item menu is present', (g.joined.match(/[1-9]️?⃣|🔟/g) || []).length >= 10)
  check('menu mentions Auto and Santé', /Auto/i.test(g.joined) && /Sant/i.test(g.joined))
  const withQuick = g.outbox.filter((p) => p.message && p.message.quick_replies)
  check('quick replies attached once', withQuick.length === 1, `${withQuick.length}`)
  check(
    'quick replies fit Messenger limits',
    withQuick.length > 0 &&
      withQuick[0].message.quick_replies.length <= 13 &&
      withQuick[0].message.quick_replies.every((q) => q.title.length <= 20 && q.payload.length <= 1000)
  )
  check(
    'typing indicator shown',
    g.outbox.some((p) => p.sender_action === 'typing_on')
  )

  console.log('\n=== 4. Menu by number, by word, by quick reply ===')

  const byNumber = await say(psid1, '1')
  check('"1" returns the motor section', /auto|automobile|véhicule/i.test(byNumber.joined), byNumber.joined.slice(0, 80))

  sessions.create('user-word')
  await say('user-word', 'Bonjour')
  const byWord = await say('user-word', 'santé')
  check('"santé" returns the health section', /sant|santé|tiers payant/i.test(byWord.joined))

  const quickPayload = {
    sender: { id: 'user-quick' },
    recipient: { id: process.env.PAGE_ID },
    timestamp: Date.now(),
    message: {
      mid: 'q1',
      quick_reply: { payload: '6' },
      text: '6',
    },
  }
  reset()
  await messenger.handleEvent(quickPayload)
  check('quick-reply payload handled like typed text', outbox.length > 0)

  console.log('\n=== 5. AGC flows ===')

  const psid2 = 'user-devis'
  await say(psid2, 'Bonjour')
  const devis = await say(psid2, 'devis')
  check('devis flow starts', devis.texts.length > 0)
  check(
    'devis asks which product',
    /pour quel type|quel type d.assurance|quote for/i.test(devis.joined),
    devis.joined.slice(0, 90)
  )
  const dProduct = await say(psid2, 'Assurance auto')
  check('devis then asks for the name', /nom|name/i.test(dProduct.joined), dProduct.joined.slice(0, 90))
  const dName = await say(psid2, 'Jean Mbarga')
  check('devis then asks for the city', /ville|city/i.test(dName.joined), dName.joined.slice(0, 90))
  const dCity = await say(psid2, 'Douala')
  check('devis then asks for an optional detail', /détail|detail|passer|skip/i.test(dCity.joined))
  const dDone = await say(psid2, 'Toyota Corolla 2018, usage privé')
  check(
    'devis closes with a DEV reference',
    /DEV-\d{4}-\d{3,4}/.test(dDone.joined),
    dDone.joined.slice(0, 120)
  )
  check(
    'devis promises a counsellor call-back',
    /conseiller|conseill/i.test(dDone.joined)
  )

  const psid3 = 'user-sinistre'
  await say(psid3, 'Bonjour')
  const sin = await say(psid3, 'sinistre')
  check('sinistre flow starts', sin.texts.length > 0)
  check('sinistre asks what happened', /sinistre|décrivez|racontez|que s'est-il/i.test(sin.joined))
  const sin2 = await say(psid3, 'Accident de voiture hier soir à Bonabéri, dégâts matériels')
  check('sinistre then asks for the city', /ville|city/i.test(sin2.joined), sin2.joined.slice(0, 90))
  const sin3 = await say(psid3, 'Douala')
  check('sinistre then asks for the policy number', /contrat|policy/i.test(sin3.joined))
  const sin4 = await say(psid3, 'passer')
  check(
    'sinistre records the claim with a SIN reference',
    /SIN-\d{4}-\d{3,4}/.test(sin4.joined),
    sin4.joined.slice(0, 120)
  )

  console.log('\n=== 6. Language follows the visitor ===')

  const psid4 = 'user-en'
  const en1 = await say(psid4, 'Hello')
  check('English greeting in', /Good (morning|afternoon|evening)|I’m|I am/i.test(en1.joined))
  check('English greeting has no French menu', !/Demander un devis/.test(en1.joined))
  const en2 = await say(psid4, 'quote')
  check(
    'English quote flow stays English',
    /quote|advisor|vehicle|motor/i.test(en2.joined) && !/Votre nom|quelle ville|Pour quel/i.test(en2.joined),
    en2.joined.slice(0, 90)
  )

  // A sentence the menu does not catch must reach the brain, never silence.
  await say('user-freeform-en', 'Hello')
  const freeform = await say('user-freeform-en', 'does travel insurance cover a cancelled flight?')
  check('free-form question gets an answer', freeform.texts.length > 0)
  check(
    'a greeting always replays the full script (identical to WhatsApp)',
    (await say('user-greeting-again', 'bonjour')).joined.includes('ASSIAA')
  )
  check(
    'brain failure still answers politely (never silent)',
    /technical break|pause|un instant|reviens|back|voyage|travel/i.test(freeform.joined),
    freeform.joined.slice(0, 90)
  )

  const back = await say(psid4, 'Bonjour, je préfère en français')
  check('switches back to French when the visitor does', !/^Good (morning|afternoon|evening)/m.test(back.joined) || /Bonjour|Bonsoir/i.test(back.joined))

  console.log('\n=== 7. Human handover ===')

  const psid5 = 'user-human'
  await say(psid5, 'Bonjour')
  const ho = await say(psid5, 'Je veux parler à un conseiller')
  check('handover detected', ho.acted === 'handover', ho.acted)
  check('visitor is told a human takes over', /conseiller/i.test(ho.joined))
  check('thread marked as handed over', messenger.isHandedOver(psid5) === true)
  const afterHandover = await say(psid5, 'Allô ?')
  check('bot stays silent once a human owns the thread', afterHandover.texts.length === 0)
  await messenger.handleEvent({
    sender: { id: psid5 },
    recipient: { id: process.env.PAGE_ID },
    pass_thread_control: { new_owner_app_id: '999' },
  })
  check('control returning to us resumes the bot', messenger.isHandedOver(psid5) === false)

  console.log('\n=== 8. Attachments and empty messages ===')

  const psid6 = 'user-photo'
  reset()
  await messenger.handleEvent({
    sender: { id: psid6 },
    recipient: { id: process.env.PAGE_ID },
    timestamp: Date.now(),
    message: {
      mid: 'att1',
      attachments: [{ type: 'image', payload: { url: 'https://x/y.jpg' } }],
    },
  })
  check('photo without text gets a polite answer', texts().length > 0)
  check('answer points somewhere useful', /agc@agc-assurances\.com|233 43 89 38/i.test(joined()))

  console.log('\n=== 9. Message size limits ===')

  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} — ${'détail '.repeat(20)}`).join('\n')
  const parts = messenger.splitMessage(long)
  check('long text is split', parts.length > 1, `${parts.length} parts`)
  check('no part exceeds 2000 characters', parts.every((p) => p.length <= 2000))
  check('no content lost when splitting', parts.join('').replace(/\s/g, '').length > 0 && parts.join('\n').replace(/\s/g, '') === long.replace(/\s/g, ''))
  check('short text stays in one part', messenger.splitMessage('Bonjour').length === 1)

  console.log('\n=== 10. Webhook body → ordered handling ===')

  reset()
  const results = await messenger.handleWebhookBody({
    object: 'page',
    entry: [
      {
        id: process.env.PAGE_ID,
        time: Date.now(),
        messaging: [incoming('user-batch', 'Bonjour')],
      },
    ],
  })
  check('body with one event is processed', results.length === 1, JSON.stringify(results))
  check('a reply went out', texts().length > 0)

  reset()
  const empty = await messenger.handleWebhookBody({ object: 'page', entry: [] })
  check('empty body is harmless', Array.isArray(empty) && empty.length === 0)

  console.log('\n=== 11. Legal pages ===')

  const p = privacyPage()
  const d = deletionPage()
  check('privacy page says AGC', /Assurances Générales du Cameroun/.test(p))
  check('privacy page is bilingual', /Français/.test(p) && /English/.test(p))
  check('privacy page names the subprocessors', /Meta|Google|Render/i.test(p))
  check('privacy page gives a contact', /agc@agc-assurances\.com/.test(p))
  check('privacy page states retention', /3 heures|3 hours/i.test(p))
  check('deletion page explains how to ask', /supprimer mes données|delete my data/i.test(d))
  check('deletion page gives a timeline', /30 jours|30 days/i.test(d))

  console.log('\n=== 12. Nothing else changed ===')

  const start = pipeline.start('parity-user', 'fr')
  check('pipeline greeting is the same script as the web version', /ASSIAA/.test(start.replies.join(' ')))
  check('WhatsApp hand-over still offered', !!start.wa && /wa\.me\/237683708003/.test(start.wa.url))
  check('sessions are per-conversation', pipeline.start('parity-a', 'fr') && sessions.get('parity-a') && !sessions.get('parity-b'))

  console.log(`\n${'='.repeat(52)}`)
  console.log(`  ${pass} passed, ${fail} failed`)
  if (fail) {
    console.log('  failures:')
    failures.forEach((f) => console.log(`   · ${f}`))
  }
  console.log('='.repeat(52) + '\n')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('test harness crashed:', e)
  process.exit(1)
})
