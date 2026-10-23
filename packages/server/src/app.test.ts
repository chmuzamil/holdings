import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, SESSION_COOKIE } from './app'
import { openStore, type Store } from './db'
import { fakeStripe, TEST_KEY } from './stripe-fake'
import { totpCode } from './totp'

// Password checks are deliberately slow (scrypt); allow for busy machines.
vi.setConfig({ testTimeout: 30_000 })

const SETUP_CODE = 'ABCD-EFGH-JKLM'
const PASSWORD = 'a long test passphrase'

let server: http.Server
let store: Store
let base: string
let clock: number
let staticDir: string

async function start(options: Partial<Parameters<typeof createApp>[0]> = {}) {
  store = openStore(':memory:')
  clock = 1_800_000_000_000
  staticDir = mkdtempSync(join(tmpdir(), 'holdings-static-'))
  mkdirSync(join(staticDir, 'assets'))
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Holdings</title>')
  writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log(1)')
  server = http.createServer(createApp({
    store,
    secretKey: randomBytes(32),
    setupCode: SETUP_CODE,
    staticDir,
    now: () => clock,
    lookup: async (domain) => ({ domain, dns: {} }),
    ...options,
  }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

beforeEach(() => start())
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  store.close()
  rmSync(staticDir, { recursive: true, force: true })
})

/** A tiny browser: keeps the session cookie and sends the request header. */
function client() {
  let cookie = ''
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Requested-With': 'holdings' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0] as string
    const text = await response.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text)
    } catch {
      json = { text }
    }
    return { status: response.status, body: json, headers: response.headers }
  }
  return { call, cookie: () => cookie }
}

async function signedIn() {
  const browser = client()
  const setup = await browser.call('POST', '/api/setup', { setupCode: SETUP_CODE, password: PASSWORD })
  expect(setup.status).toBe(200)
  return browser
}

async function enableTotp(browser: ReturnType<typeof client>) {
  const setup = await browser.call('POST', '/api/totp/setup', { password: PASSWORD })
  expect(setup.status).toBe(200)
  const secret = setup.body.secret as string
  const enable = await browser.call('POST', '/api/totp/enable', { code: totpCode(secret, Math.floor(clock / 30000)) })
  expect(enable.status).toBe(200)
  clock += 30_000
  return secret
}

const codeNow = (secret: string) => totpCode(secret, Math.floor(clock / 30000))

describe('first run', () => {
  it('asks for setup, then needs the setup code and a long password', async () => {
    const browser = client()
    expect((await browser.call('GET', '/api/session')).body).toEqual({ setupNeeded: true, authenticated: false })
    expect((await browser.call('POST', '/api/setup', { setupCode: 'WRONG', password: PASSWORD })).status).toBe(401)
    const short = await browser.call('POST', '/api/setup', { setupCode: SETUP_CODE, password: 'short' })
    expect(short.status).toBe(400)
    expect(short.body.error).toMatch(/at least 12/)
    const ok = await browser.call('POST', '/api/setup', { setupCode: ' abcd-efgh-jklm ', password: PASSWORD })
    expect(ok.status).toBe(200)
    expect((await browser.call('GET', '/api/session')).body).toEqual({ setupNeeded: false, authenticated: true, totpEnabled: false })
  })

  it('refuses a second setup', async () => {
    await signedIn()
    expect((await client().call('POST', '/api/setup', { setupCode: SETUP_CODE, password: PASSWORD })).status).toBe(409)
  })

  it('sets a strict, HttpOnly cookie, Secure when asked', async () => {
    const response = await client().call('POST', '/api/setup', { setupCode: SETUP_CODE, password: PASSWORD })
    const cookie = response.headers.get('set-cookie') as string
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[\\w-]{43};`))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).not.toContain('Secure')
  })
})

describe('secure cookies over plain HTTP', () => {
  // fetch() always sets Host from the URL, so use node:http to send another one.
  function setupFrom(host: string, headers: Record<string, string> = {}) {
    const body = JSON.stringify({ setupCode: SETUP_CODE, password: PASSWORD })
    return new Promise<{ status: number; body: Record<string, unknown>; headers: Headers }>((resolve, reject) => {
      const request = http.request(`${base}/api/setup`, {
        method: 'POST',
        headers: { Host: host, 'Content-Type': 'application/json', 'X-Requested-With': 'holdings', ...headers },
      }, (response) => {
        let text = ''
        response.on('data', (chunk) => { text += chunk })
        response.on('end', () => {
          const cookie = response.headers['set-cookie']?.join(', ')
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(text), headers: new Headers(cookie ? { 'set-cookie': cookie } : {}) })
        })
      })
      request.on('error', reject)
      request.end(body)
    })
  }

  it('explains instead of failing silently when the cookie would be dropped', async () => {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    await start({ secureCookies: true })
    const plain = await setupFrom('192.168.1.20:8080')
    expect(plain.status).toBe(400)
    expect(plain.body.error).toMatch(/HTTPS/)
    expect(plain.headers.get('set-cookie')).toBeNull()
  })

  it('allows localhost, and HTTPS behind a trusted proxy', async () => {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    await start({ secureCookies: true, trustProxy: true })
    expect((await setupFrom('holdings.example', { 'X-Forwarded-Proto': 'http' })).status).toBe(400)
    const proxied = await setupFrom('holdings.example', { 'X-Forwarded-Proto': 'https' })
    expect(proxied.status).toBe(200)
    expect(proxied.headers.get('set-cookie')).toContain('Secure')
  })

  it('treats localhost as safe', async () => {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    await start({ secureCookies: true })
    expect((await setupFrom('localhost:8080')).status).toBe(200)
  })
})

describe('signing in', () => {
  it('logs in with the right password only', async () => {
    await signedIn()
    const browser = client()
    expect((await browser.call('POST', '/api/login', { password: 'wrong password!!' })).status).toBe(401)
    expect((await browser.call('GET', '/api/data')).status).toBe(401)
    expect((await browser.call('POST', '/api/login', { password: PASSWORD })).status).toBe(200)
    expect((await browser.call('GET', '/api/data')).status).toBe(200)
  })

  it('locks an address out after 10 wrong passwords', async () => {
    await signedIn()
    const browser = client()
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await browser.call('POST', '/api/login', { password: `wrong password ${attempt}` })).status).toBe(401)
    }
    expect((await browser.call('POST', '/api/login', { password: PASSWORD })).status).toBe(429)
    clock += 15 * 60 * 1000
    expect((await browser.call('POST', '/api/login', { password: PASSWORD })).status).toBe(200)
  })

  it('logs out and forgets the session', async () => {
    const browser = await signedIn()
    const stolen = browser.cookie()
    await browser.call('POST', '/api/logout')
    const reused = await fetch(`${base}/api/data`, { headers: { Cookie: stolen } })
    expect(reused.status).toBe(401)
  })

  it('expires sessions after 30 idle days', async () => {
    const browser = await signedIn()
    clock += 29 * 24 * 60 * 60 * 1000
    expect((await browser.call('GET', '/api/data')).status).toBe(200)
    clock += 29 * 24 * 60 * 60 * 1000
    expect((await browser.call('GET', '/api/data')).status).toBe(200)
    clock += 31 * 24 * 60 * 60 * 1000
    expect((await browser.call('GET', '/api/data')).status).toBe(401)
  })
})

describe('two-step login (TOTP)', () => {
  it('needs a code once turned on, and each code works once', async () => {
    const owner = await signedIn()
    const secret = await enableTotp(owner)
    expect((await owner.call('GET', '/api/session')).body.totpEnabled).toBe(true)

    const browser = client()
    const noCode = await browser.call('POST', '/api/login', { password: PASSWORD })
    expect(noCode.status).toBe(401)
    expect(noCode.body.needsCode).toBe(true)
    expect((await browser.call('POST', '/api/login', { password: PASSWORD, code: '000000' })).status).toBe(401)

    const code = codeNow(secret)
    expect((await browser.call('POST', '/api/login', { password: PASSWORD, code })).status).toBe(200)
    expect((await client().call('POST', '/api/login', { password: PASSWORD, code })).status).toBe(401)
  })

  it('does not reveal whether a code is right when the password is wrong', async () => {
    const owner = await signedIn()
    const secret = await enableTotp(owner)
    const response = await client().call('POST', '/api/login', { password: 'wrong password!!', code: codeNow(secret) })
    expect(response.status).toBe(401)
    expect(response.body.needsCode).toBeUndefined()
  })

  it('refuses to turn on with a wrong code', async () => {
    const owner = await signedIn()
    await owner.call('POST', '/api/totp/setup', { password: PASSWORD })
    expect((await owner.call('POST', '/api/totp/enable', { code: '123456' })).status).toBe(400)
    expect((await owner.call('GET', '/api/session')).body.totpEnabled).toBe(false)
  })

  it('needs the password and a code to turn off', async () => {
    const owner = await signedIn()
    const secret = await enableTotp(owner)
    expect((await owner.call('POST', '/api/totp/disable', { password: PASSWORD, code: '000000' })).status).toBe(401)
    expect((await owner.call('POST', '/api/totp/disable', { password: PASSWORD, code: codeNow(secret) })).status).toBe(200)
    expect((await client().call('POST', '/api/login', { password: PASSWORD })).status).toBe(200)
  })

  it('keeps the secret encrypted at rest', async () => {
    const owner = await signedIn()
    const secret = await enableTotp(owner)
    expect(store.getOwner()?.totpSealed).not.toContain(secret)
  })
})

describe('changing the password', () => {
  it('needs the current password and signs out other sessions', async () => {
    const owner = await signedIn()
    const other = client()
    await other.call('POST', '/api/login', { password: PASSWORD })
    expect((await owner.call('POST', '/api/password', { currentPassword: 'not it at all', newPassword: 'another long passphrase' })).status).toBe(401)
    expect((await owner.call('POST', '/api/password', { currentPassword: PASSWORD, newPassword: 'another long passphrase' })).status).toBe(200)
    expect((await owner.call('GET', '/api/data')).status).toBe(200)
    expect((await other.call('GET', '/api/data')).status).toBe(401)
    expect((await client().call('POST', '/api/login', { password: 'another long passphrase' })).status).toBe(200)
  })
})

describe('saved data', () => {
  it('saves and loads, and refuses a stale version', async () => {
    const browser = await signedIn()
    expect((await browser.call('GET', '/api/data')).body).toEqual({ data: null, version: 0, updatedAt: null })

    const first = await browser.call('PUT', '/api/data', { version: 0, data: { records: { domains: [] } } })
    expect(first.body.version).toBe(1)
    const second = await browser.call('PUT', '/api/data', { version: 1, data: { records: { domains: [{ id: 'a' }] } } })
    expect(second.body.version).toBe(2)

    const stale = await browser.call('PUT', '/api/data', { version: 1, data: { records: {} } })
    expect(stale.status).toBe(409)
    expect(stale.body.version).toBe(2)

    const loaded = await browser.call('GET', '/api/data')
    expect(loaded.body.data).toEqual({ records: { domains: [{ id: 'a' }] } })
    expect(loaded.body.version).toBe(2)
  })

  it('refuses bad bodies', async () => {
    const browser = await signedIn()
    expect((await browser.call('PUT', '/api/data', { version: 0, data: [] })).status).toBe(400)
    expect((await browser.call('PUT', '/api/data', { data: {} })).status).toBe(400)
    const huge = { version: 0, data: { blob: 'x'.repeat(6 * 1024 * 1024) } }
    expect((await browser.call('PUT', '/api/data', huge)).status).toBe(413)
  })
})

describe('cross-site protection', () => {
  it('needs the request header on writes', async () => {
    const response = await fetch(`${base}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: SETUP_CODE, password: PASSWORD }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses writes from another origin', async () => {
    const response = await client().call('POST', '/api/setup', { setupCode: SETUP_CODE, password: PASSWORD }, { Origin: 'https://evil.example' })
    expect(response.status).toBe(403)
  })

  it('refuses form posts', async () => {
    const response = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'holdings' },
      body: 'password=x',
    })
    expect(response.status).toBe(415)
  })
})

describe('domain lookups and static files', () => {
  it('only looks up domains for a signed-in owner', async () => {
    expect((await client().call('GET', '/api/domain-lookup?domain=example.com')).status).toBe(401)
    const browser = await signedIn()
    expect((await browser.call('GET', '/api/domain-lookup?domain=https://Example.com/x')).body).toEqual({ domain: 'example.com', dns: {} })
    expect((await browser.call('GET', '/api/domain-lookup?domain=router.local')).status).toBe(400)
  })

  it('serves the app with security headers and nothing outside it', async () => {
    const index = await fetch(`${base}/`)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(index.headers.get('cache-control')).toBe('no-cache')
    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect((await fetch(`${base}/missing`)).status).toBe(404)
    expect((await fetch(`${base}/%2e%2e/%2e%2e/package.json`)).status).toBe(404)
    expect((await fetch(`${base}/api/nope`)).status).toBe(404)
    expect((await fetch(`${base}/api/healthz`)).status).toBe(200)
  })
})

describe('Stripe revenue', () => {
  async function withStripe(stripeFetch = fakeStripe()) {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    await start({ stripeFetch })
    return { browser: await signedIn(), stripeFetch }
  }

  it('needs a login', async () => {
    expect((await client().call('GET', '/api/integrations/stripe')).status).toBe(401)
    expect((await client().call('GET', '/api/revenue/stripe')).status).toBe(401)
  })

  it('refuses secret keys and keeps nothing', async () => {
    const { browser } = await withStripe()
    const response = await browser.call('PUT', '/api/integrations/stripe', { key: 'sk_live_abcdefghij' })
    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/secret key/)
    expect((await browser.call('GET', '/api/integrations/stripe')).body).toEqual({ connected: false })
  })

  it('refuses a key Stripe rejects', async () => {
    const { browser } = await withStripe()
    expect((await browser.call('PUT', '/api/integrations/stripe', { key: 'rk_test_OTHER00000' })).status).toBe(400)
    expect((await browser.call('GET', '/api/integrations/stripe')).body).toEqual({ connected: false })
  })

  it('connects, stores the key encrypted and never sends it back', async () => {
    const { browser } = await withStripe()
    const connect = await browser.call('PUT', '/api/integrations/stripe', { key: TEST_KEY })
    expect(connect.status).toBe(200)
    expect(connect.body.hint).toBe('test key ending 0001')
    expect(JSON.stringify(connect.body)).not.toContain(TEST_KEY)
    expect(store.getIntegration('stripe')?.sealedKey).not.toContain(TEST_KEY)

    const status = await browser.call('GET', '/api/integrations/stripe')
    expect(status.body).toMatchObject({ connected: true, hint: 'test key ending 0001' })
    expect(JSON.stringify(status.body)).not.toContain(TEST_KEY)
  })

  it('serves revenue from a short cache unless asked to refresh', async () => {
    const { browser, stripeFetch } = await withStripe()
    await browser.call('PUT', '/api/integrations/stripe', { key: TEST_KEY })
    const calls = stripeFetch.mock.calls.length
    const revenue = await browser.call('GET', '/api/revenue/stripe')
    expect((revenue.body.products as { id: string }[])[0]?.id).toBe('prod_app')
    expect(stripeFetch.mock.calls.length).toBe(calls)
    await browser.call('GET', '/api/revenue/stripe?refresh=1')
    expect(stripeFetch.mock.calls.length).toBeGreaterThan(calls)
    clock += 11 * 60 * 1000
    const before = stripeFetch.mock.calls.length
    await browser.call('GET', '/api/revenue/stripe')
    expect(stripeFetch.mock.calls.length).toBeGreaterThan(before)
  })

  it('disconnects', async () => {
    const { browser } = await withStripe()
    await browser.call('PUT', '/api/integrations/stripe', { key: TEST_KEY })
    expect((await browser.call('DELETE', '/api/integrations/stripe')).body).toEqual({ connected: false })
    expect(store.getIntegration('stripe')).toBeNull()
    expect((await browser.call('GET', '/api/revenue/stripe')).status).toBe(404)
  })
})
