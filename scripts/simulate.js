'use strict'

// Talk to ASSIAA through the Messenger code path — no Meta, no Page, no token.
//
//   node scripts/simulate.js "Bonjour"
//   node scripts/simulate.js --psid client-42 "devis"
//   node scripts/simulate.js --new "sinistre"      (fresh conversation)
//
// The conversation is kept between calls for the same psid, exactly like a real
// Messenger thread. Replies are printed instead of sent.

process.env.DRY_RUN = '1'

const messenger = require('../src/messenger')

const args = process.argv.slice(2)
let psid = 'simulation-client'
let reset = false
const words = []

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--psid' && args[i + 1]) psid = args[++i]
  else if (args[i] === '--new') reset = true
  else words.push(args[i])
}

const text = words.join(' ').trim()
if (!text) {
  console.log('usage: node scripts/simulate.js [--new] [--psid ID] "votre message"')
  process.exit(1)
}

if (reset) psid = `${psid}-${Date.now().toString(36)}`

messenger.__setSenderForTests(async (to, payload) => {
  if (payload.sender_action === 'typing_on') return { ok: true }
  if (payload.message) {
    const quick = payload.message.quick_replies
    console.log('\nASSIAA:')
    console.log(payload.message.text)
    if (quick) console.log(`   [${quick.map((q) => q.title).join('] [')}]`)
    return { ok: true }
  }
  return { ok: true }
})

messenger
  .handleEvent({
    sender: { id: psid },
    recipient: { id: 'simulated-page' },
    timestamp: Date.now(),
    message: { mid: `sim-${Date.now()}`, text },
  })
  .then((acted) => {
    console.log(`\n   (handled as: ${acted} · conversation: ${psid})`)
  })
  .catch((e) => {
    console.error('error:', e.message)
    process.exit(1)
  })
