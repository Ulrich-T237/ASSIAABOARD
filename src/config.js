'use strict'

require('dotenv').config()

const path = require('path')

// The assistant's identity is a constant on purpose — it never changes with env.
const DISPLAY_NAME = 'ASSIAA'
const COMPANY = 'Assurances Générales du Cameroun (AGC)'
const SLOGAN = 'Le gage de votre sécurité'

const MODEL_DEFAULT = 'gemini-3.5-flash-lite'
const FALLBACKS_DEFAULT =
  'gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-2.5-flash'

// WhatsApp hand-off: "Continuer vers WhatsApp" → this AGC number (E.164, no +)
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || '237683708003').replace(/[^\d]/g, '')

module.exports = {
  PORT: parseInt(process.env.PORT || '10000', 10),

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || MODEL_DEFAULT,
  GEMINI_MODEL_FALLBACKS: (process.env.GEMINI_MODEL_FALLBACKS || FALLBACKS_DEFAULT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  DISPLAY_NAME,
  COMPANY,
  SLOGAN,
  WHATSAPP_NUMBER,
  /** Pre-filled WhatsApp message shown when someone taps the CTA. */
  WHATSAPP_OPENER: process.env.WHATSAPP_OPENER || 'Bonjour ASSIAA 👋 Je viens du site AGC et je souhaite continuer sur WhatsApp.',

  SITE: 'https://agc-assurances.com/',
  TZ: 'Africa/Douala',

  // conversation memory (server-side, in-process — the web widget needs no database)
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS || String(3 * 60 * 60 * 1000), 10),
  SESSION_MAX: parseInt(process.env.SESSION_MAX || '2000', 10),
  RATE_LIMIT_PER_MIN: parseInt(process.env.RATE_LIMIT_PER_MIN || '30', 10),

  // "AGCGI" style allow-list: who may call the API from a browser (comma separated, "*" = any)
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),

  DATA_DIR: path.join(__dirname, '..', 'data'),
  PAGES_DIR: path.join(__dirname, '..', 'data', 'pages'),
  CACHE_META: path.join(__dirname, '..', 'data', 'site-cache.json'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
}
