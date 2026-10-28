import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { join, resolve } from 'node:path'
import { createApp } from './app'
import { openStore } from './db'
import { createDeadman } from './deadman'
import { createNotifier } from './notify'

// Settings come from environment variables; see docs/self-hosting.md.
const env = process.env
const dataDir = resolve(env.HOLDINGS_DATA_DIR || './data')
const port = Number(env.HOLDINGS_PORT || 8080)
const host = env.HOLDINGS_HOST || '127.0.0.1'
const staticDir = env.HOLDINGS_STATIC_DIR ? resolve(env.HOLDINGS_STATIC_DIR) : null
const secureCookies = env.HOLDINGS_SECURE_COOKIES !== 'false'
const trustProxy = env.HOLDINGS_TRUST_PROXY === 'true'

mkdirSync(dataDir, { recursive: true, mode: 0o700 })
const store = openStore(join(dataDir, 'holdings.db'))

if (process.argv.includes('--reset-login')) {
  // For a lost password or authenticator: removes the login, keeps the data.
  store.deleteOwner()
  console.log('Login removed. Your data is kept. Start the server again and create a new login with the setup code.')
  store.close()
  process.exit(0)
}

const secretKey = loadSecretKey()
let setupCode: string | null = null
if (!store.getOwner()) {
  setupCode = env.HOLDINGS_SETUP_CODE?.trim().toUpperCase() || randomSetupCode()
  console.log(`\n  No login yet. Open Holdings and create one with this setup code:\n\n      ${setupCode}\n`)
}

// Notifications are off until turned on in Settings; the daily check then sends what is due.
const notifier = createNotifier({ store, secretKey })
notifier.start()
// The dead-man's switch is off until turned on; its hourly check then sends reminders and, if due, the file.
const deadman = createDeadman({ store, notifier })
deadman.start()
const server = http.createServer(createApp({ store, secretKey, setupCode, staticDir, secureCookies, trustProxy, notifier, deadman }))
server.listen(port, host, () => {
  console.log(`Holdings server listening on http://${host}:${port}${staticDir ? '' : ' (API only)'}`)
  if (!secureCookies) console.log('Warning: HOLDINGS_SECURE_COOKIES=false. Only do this on a trusted network.')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close()
      process.exit(0)
    })
  })
}

/** HOLDINGS_SECRET_KEY (64 hex characters), or a key file kept in the data folder. */
function loadSecretKey(): Buffer {
  if (env.HOLDINGS_SECRET_KEY) {
    const key = Buffer.from(env.HOLDINGS_SECRET_KEY, 'hex')
    if (key.length !== 32) throw new Error('HOLDINGS_SECRET_KEY must be 64 hex characters (32 bytes).')
    return key
  }
  const file = join(dataDir, 'secret.key')
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' })
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
}

function randomSetupCode(): string {
  // No 0/O or 1/I, so it can be read from a log and typed without mistakes.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`
}
