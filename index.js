'use strict'

// ASSIAA — Messenger channel (Facebook Page)
// Third service, fully independent from the WhatsApp bot and the web assistant.
// Same brain, same greeting, same AGC memory.

const cfg = require('./src/config')
const { startServer } = require('./src/server')
const knowledge = require('./src/knowledge')

knowledge.startAutoRefresh && knowledge.startAutoRefresh()
startServer(cfg.PORT)
