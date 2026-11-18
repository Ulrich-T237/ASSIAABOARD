'use strict'

// ASSIAA — version WEB (assistante du site agc-assurances.com)
// Indépendante du bot WhatsApp : aucun Baileys, aucune session téléphone, aucun MongoDB.
// Même assistante, même script, même cerveau, même mémoire du site AGC.

require('dotenv').config()

const { startServer } = require('./src/server')

console.log('┌──────────────────────────────────────────────┐')
console.log('│  ASSIAA — version web (AGC)                  │')
console.log('│  « Le gage de votre sécurité »              │')
console.log('└──────────────────────────────────────────────┘')

startServer()

process.on('unhandledRejection', (err) => {
  console.error(`[web] unhandledRejection: ${(err && (err.stack || err.message)) || err}`)
})
process.on('uncaughtException', (err) => {
  console.error(`[web] uncaughtException: ${(err && (err.stack || err.message)) || err}`)
})
