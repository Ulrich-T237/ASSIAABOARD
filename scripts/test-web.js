'use strict'

// Recette de la version WEB d'ASSIAA (aucun WhatsApp nécessaire).
//   node scripts/test-web.js

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

const pipeline = require('../src/pipeline')
const sessions = require('../src/session')
const cfg = require('../src/config')
const lang = require('../src/lang')
const greeting = require('../src/greeting')
const knowledge = require('../src/knowledge')

let pass = 0
let fail = 0
const lines = []

function check(name, cond, extra = '') {
  if (cond) {
    pass++
    lines.push(`  ✅ ${name}`)
  } else {
    fail++
    lines.push(`  ❌ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

function hr(t) {
  console.log(`\n━━━ ${t} ━━━`)
}

async function main() {
  hr('1. Ouverture directe — le script s’affiche tout seul')
  const boot = pipeline.start(null, 'fr')
  check('session créée', Boolean(boot.sessionId))
  check('2 bulles : intro + menu', boot.replies.length === 2, `got ${boot.replies.length}`)
  check('intro = ASSIAA + nom complet', boot.replies[0].includes('*ASSIAA*') && boot.replies[0].includes('Assurances Générales du Cameroun (AGC)'))
  check('titre conseillère', boot.replies[0].includes('votre conseillère Assurances Générales du Cameroun (AGC)'))
  check('menu 10 entrées', (boot.replies[1].match(/(?:[1-9]️⃣|🔟)/g) || []).length >= 10)
  check('CTA WhatsApp fourni dès l’ouverture', Boolean(boot.wa && boot.wa.url), JSON.stringify(boot.wa))
  check('CTA pointe vers 237683708003', (boot.wa.url || '').startsWith('https://wa.me/237683708003?text='), boot.wa.url)
  check('CTA libellé FR', boot.wa.label === 'Continuer vers WhatsApp', boot.wa.label)
  console.log(boot.replies[0] + '\n\n' + boot.replies[1])
  console.log('\nCTA → ' + boot.wa.url.slice(0, 90) + '…')

  hr('1b. Ouverture en anglais')
  const bootEn = pipeline.start(null, 'en')
  check('intro EN', bootEn.replies[0].includes('your advisor at Assurances Générales du Cameroun (AGC)'))
  check('menu EN', bootEn.replies[1].includes('Get a quote'))

  hr('2. Même assistante — menu déterministe (mémoire du site)')
  let sid = pipeline.start(null, 'fr').sessionId
  let r = await pipeline.handle(sid, '1')
  check('choix 1 → automobile', r.acted === 'menu' && r.replies[0].includes('Assurance Automobile'))
  check('garanties issues du site', /RTI|Responsabilité Civile/.test(r.replies[0]))
  r = await pipeline.handle(sid, '10')
  check('choix 10 → horaires + contact', r.replies[0].includes('08H') && r.replies[0].includes('agc@agc-assurances.com'))
  r = await pipeline.handle(sid, 'agences')
  check('mot-clé agences', r.replies[0].includes('Nos agences'))
  r = await pipeline.handle(sid, 'Une question : combien coûte une assurance auto ?')
  check('question → cerveau (pas le menu)', r.acted === 'brain')

  hr('3. Flow devis → dossier + transfert WhatsApp pré-rempli')
  sid = pipeline.start(null, 'fr').sessionId
  r = await pipeline.handle(sid, '6')
  check('ouverture devis', r.replies[0].includes('type d’assurance'))
  r = await pipeline.handle(sid, 'automobile')
  check('→ nom demandé', r.replies[0].includes('nom'))
  r = await pipeline.handle(sid, 'Jean Mballa')
  check('→ ville demandée', r.replies[0].includes('ville'))
  r = await pipeline.handle(sid, 'Douala')
  check('→ détail/skip demandé', r.replies[0].includes('passer'))
  r = await pipeline.handle(sid, 'Toyota Corolla 2015')
  check('confirmation + référence DEV', r.replies[0].includes('DEV-'))
  check('ligne conseiller ajoutée', r.replies.some((t) => /conseiller AGC prend le relais/i.test(t)))
  check('CTA WhatsApp avec résumé', Boolean(r.wa && /je viens du site AGC/i.test(decodeURIComponent(r.wa.url))))
  check('résumé contient les infos saisies', /Toyota Corolla 2015/.test(decodeURIComponent(r.wa.url)) && /Jean Mballa/.test(decodeURIComponent(r.wa.url)))
  console.log('\nCTA devis →\n' + decodeURIComponent(r.wa.url.split('text=')[1]))

  hr('4. Flow sinistre')
  sid = pipeline.start(null, 'fr').sessionId
  r = await pipeline.handle(sid, '7')
  check('ouverture sinistre', /sinistre/i.test(r.replies[0]))
  r = await pipeline.handle(sid, 'Accident ce matin, pare-chocs cassé')
  check('→ ville', /ville/i.test(r.replies[0]))
  r = await pipeline.handle(sid, 'Douala')
  check('→ contrat', /contrat/i.test(r.replies[0]))
  r = await pipeline.handle(sid, 'passer')
  check('référence SIN', r.replies[0].includes('SIN-'))
  check('CTA WhatsApp sinistre', Boolean(r.wa) && /sinistre/i.test(decodeURIComponent(r.wa.url)))

  hr('5. Espace Clients — demande la ville')
  sid = pipeline.start(null, 'fr').sessionId
  r = await pipeline.handle(sid, 'je veux voir mon contrat')
  check('→ demande la ville', r.acted === 'espace' && r.replies[0].includes('ville'))
  r = await pipeline.handle(sid, 'Yaoundé')
  check('→ agences de Yaoundé', /Capitole|MIMBOMAN|TSINGA/i.test(r.replies[0]))
  console.log(r.replies[0].slice(0, 220) + '…')

  hr('6. Annulation')
  sid = pipeline.start(null, 'fr').sessionId
  await pipeline.handle(sid, '6')
  r = await pipeline.handle(sid, 'annuler')
  check('annuler → menu', r.acted === 'cancel' && r.replies[r.replies.length - 1].includes('1️⃣'))

  hr('7. Le cerveau répond à tout (Gemini live)')
  sid = pipeline.start(null, 'fr').sessionId
  const t0 = Date.now()
  r = await pipeline.handle(sid, 'Combien coûte une assurance auto pour une Toyota Corolla ?')
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  check(`réponse FR (${secs}s, ${r.replies[0].length} car.)`, r.replies[0].length > 20)
  check('langue FR conservée', r.lang === 'fr')
  console.log('\nQ: Combien coûte une assurance auto pour une Toyota Corolla ?\nA: ' + r.replies[0].slice(0, 300) + '…')

  sid = pipeline.start(null, 'en').sessionId
  r = await pipeline.handle(sid, 'What does your travel insurance cover?')
  check('réponse EN', r.lang === 'en' && r.replies[0].length > 20)
  console.log('\nQ: What does your travel insurance cover?\nA: ' + r.replies[0].slice(0, 280) + '…')

  hr('8. Détection de langue + horloge Douala')
  check('detectLang FR', lang.detectLang('Bonjour, j’ai une question') === 'fr')
  check('detectLang EN', lang.detectLang('Hello, I have a question') === 'en')
  const h = lang.doualaHour()
  check(`heure Douala 0-23 (${h})`, h >= 0 && h <= 23)
  check('salutations reconnues', greeting.greetingBundle('fr').length === 2)

  hr('9. Mémoire du site AGC')
  check('11 pages en mémoire', knowledge.pagesInfo().length === 11)
  check('digest non vide', knowledge.digest().length > 500)
  const page = await knowledge.readPage('/contact/')
  check('lecture de page (live ou copie locale)', Boolean(page.text) && page.text.length > 200, page.source)

  hr('10. Configuration du CTA')
  check('numéro WhatsApp = 237683708003', cfg.WHATSAPP_NUMBER === '237683708003', cfg.WHATSAPP_NUMBER)
  check('lien wa.me valide', pipeline.waLink().startsWith('https://wa.me/237683708003?text='))
  check('sessions nettoyées (TTL actif)', typeof sessions.prune === 'function')

  console.log('\n════════ RÉSUMÉ ════════')
  for (const line of lines) console.log(line)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err.stack || err)
  process.exit(1)
})
