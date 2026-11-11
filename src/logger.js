'use strict'

// Minimal zero-dependency logger that satisfies both our code and Baileys' logger interface.
// trace/debug/info are silent by default (set LOG_LEVEL=debug to see Baileys chatter).

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }
const ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

function level() {
  const raw = (process.env.LOG_LEVEL || 'warn').toLowerCase()
  return LEVELS[raw] != null ? LEVELS[raw] : LEVELS.warn
}

function fmt(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}

function makeLogger(tag = '') {
  const prefix = tag ? `[${tag}]` : ''
  const log = (name) => (...args) => {
    const want = name === 'fatal' ? LEVELS.error : LEVELS[name]
    if (want == null) return
    if (want > level()) return
    const line = `${new Date().toISOString()} ${prefix} ${name.toUpperCase()} ${fmt(args)}`
    if (name === 'error' || name === 'fatal') console.error(line)
    else console.log(line)
  }
  const logger = {}
  for (const name of ORDER) logger[name] = log(name)
  logger.silent = false
  logger.child = (suffix) => makeLogger(tag ? `${tag}:${suffix}` : String(suffix))
  return logger
}

module.exports = { makeLogger, logger: makeLogger('assiaa') }
