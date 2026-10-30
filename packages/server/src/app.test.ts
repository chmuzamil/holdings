import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, SESSION_COOKIE } from './app'
import { openStore, type Store } from './db'
import { CF_TOKEN, fakeCloudflare } from './cloudflare-fake'
import { fakePorkbun, fakeSpaceship, PORKBUN_KEYS, SPACESHIP_KEYS } from './registrars-fake'
import { CUSTOM_TOKEN, CUSTOM_URL, fakeCustom, fakeHetzner, HETZNER_TOKEN } from './hosts-fake'
import { fakePaddle, fakeRevenueUrl, PADDLE_KEY, REVENUE_TOKEN, REVENUE_URL } from './revenue-fake'
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

describe('access tokens for agents', () => {
  async function createToken(browser: ReturnType<typeof client>, name = 'Claude on laptop') {
    const response = await browser.call('POST', '/api/tokens', { name })
    expect(response.status).toBe(200)
    return response.body as { id: string; name: string; token: string }
  }

  const withToken = (token: string, method = 'GET', path = '/api/data', body?: unknown) => fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'holdings' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })

  it('reads the data with a token, and shows the token only once', async () => {
    const owner = await signedIn()
    await owner.call('PUT', '/api/data', { version: 0, data: { records: { domains: [] } } })
    const created = await createToken(owner)
    expect(created.token).toMatch(/^hld_[\w-]{43}$/)

    const read = await withToken(created.token)
    expect(read.status).toBe(200)
    expect(((await read.json()) as { data: unknown }).data).toEqual({ records: { domains: [] } })

    const list = await owner.call('GET', '/api/tokens')
    expect(list.body.tokens).toEqual([expect.objectContaining({ id: created.id, name: 'Claude on laptop', lastUsedAt: expect.any(String) })])
    expect(JSON.stringify(list.body)).not.toContain(created.token)
  })

  it('can only read: every change and every other endpoint refuses it', async () => {
    const owner = await signedIn()
    const { token } = await createToken(owner)
    expect((await withToken(token, 'PUT', '/api/data', { version: 0, data: {} })).status).toBe(401)
    expect((await withToken(token, 'POST', '/api/tokens', { name: 'more' })).status).toBe(401)
    expect((await withToken(token, 'POST', '/api/password', { currentPassword: 'x', newPassword: 'y' })).status).toBe(401)
    expect((await withToken(token, 'GET', '/api/tokens')).status).toBe(401)
    expect((await withToken(token, 'GET', '/api/integrations/stripe')).status).toBe(401)
    expect((await withToken(token, 'GET', '/api/session')).status).toBe(200)
  })

  it('stops working when deleted, and wrong tokens count as failed attempts', async () => {
    const owner = await signedIn()
    const { id, token } = await createToken(owner)
    expect((await owner.call('DELETE', '/api/tokens', { id })).status).toBe(200)
    expect((await withToken(token)).status).toBe(401)
    for (let attempt = 0; attempt < 9; attempt += 1) await withToken(`hld_guess${attempt}`)
    expect((await withToken('hld_guess-last')).status).toBe(429)
  })

  it('needs a name, and is stored only as a hash', async () => {
    const owner = await signedIn()
    expect((await owner.call('POST', '/api/tokens', { name: '  ' })).status).toBe(400)
    const { token } = await createToken(owner)
    expect(JSON.stringify(store.listTokens())).not.toContain(token)
  })

  it('is removed with the login by --reset-login', async () => {
    const owner = await signedIn()
    const { token } = await createToken(owner)
    store.deleteOwner()
    expect((await withToken(token)).status).toBe(401)
  })
})

describe('dead-man’s switch routes', () => {
  it('needs a login, except for the one-click link page', async () => {
    expect((await client().call('GET', '/api/deadman')).status).toBe(401)
    expect((await client().call('PUT', '/api/deadman', { enabled: true })).status).toBe(401)
    const page = await fetch(`${base}/api/deadman/checkin?token=made-up`)
    expect(page.status).toBe(404)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(await page.text()).toContain('expired or was already used')
  })

  it('stays off and explains what turning it on needs', async () => {
    const browser = await signedIn()
    const view = await browser.call('GET', '/api/deadman')
    expect(view.body).toMatchObject({ enabled: false, hasFile: false, emailReady: false })
    const on = await browser.call('PUT', '/api/deadman', { enabled: true, contactEmail: 'sara@mail.example' })
    expect(on.status).toBe(400)
    expect(on.body.error).toMatch(/email notifications first/)
  })

  it('stores a locked file', async () => {
    const browser = await signedIn()
    const html = '<!doctype html><script>const decryptHandover = 1</script>'
    expect((await browser.call('PUT', '/api/deadman/file', { html })).body.hasFile).toBe(true)
    expect((await browser.call('PUT', '/api/deadman/file', { html: 'plain' })).status).toBe(400)
  })
})

describe('calendar feed', () => {
  async function withData() {
    const owner = await signedIn()
    await owner.call('PUT', '/api/data', {
      version: 0,
      data: { records: { domains: [{ id: 'd1', name: 'shop.example', renewalDate: '2026-11-05', status: 'Active' }], projects: [] } },
    })
    return owner
  }
  const feed = (token: string, query = '') => fetch(`${base}/api/calendar.ics?token=${encodeURIComponent(token)}${query}`)

  it('serves the calendar only with the current calendar token', async () => {
    const owner = await withData()
    expect((await owner.call('GET', '/api/calendar/token')).body).toEqual({ exists: false })
    expect((await feed('hcal_nothing')).status).toBe(404)

    const { token } = (await owner.call('POST', '/api/calendar/token')).body as { token: string }
    expect(token).toMatch(/^hcal_/)
    const response = await feed(token, '&alarm=3')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/calendar')
    const ics = await response.text()
    expect(ics).toContain('UID:d1-renews@holdings.local')
    expect(ics).toContain('TRIGGER:-P3D')
    expect(JSON.stringify((await owner.call('GET', '/api/calendar/token')).body)).not.toContain(token)
  })

  it('gives access to nothing else', async () => {
    const owner = await withData()
    const { token } = (await owner.call('POST', '/api/calendar/token')).body as { token: string }
    const asBearer = await fetch(`${base}/api/data`, { headers: { Authorization: `Bearer ${token}` } })
    expect(asBearer.status).toBe(401)
    expect((await fetch(`${base}/api/data?token=${token}`)).status).toBe(401)
  })

  it('stops the old link when rotated, and every link when revoked', async () => {
    const owner = await withData()
    const first = ((await owner.call('POST', '/api/calendar/token')).body as { token: string }).token
    const second = ((await owner.call('POST', '/api/calendar/token')).body as { token: string }).token
    expect((await feed(first)).status).toBe(404)
    expect((await feed(second)).status).toBe(200)
    await owner.call('DELETE', '/api/calendar/token')
    expect((await feed(second)).status).toBe(404)
  })

  it('needs a login to make, change or check the token', async () => {
    expect((await client().call('POST', '/api/calendar/token')).status).toBe(401)
    expect((await client().call('DELETE', '/api/calendar/token')).status).toBe(401)
    expect((await client().call('GET', '/api/calendar/token')).status).toBe(401)
  })
})

describe('Cloudflare import', () => {
  async function withCloudflare() {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    await start({ cloudflareFetch: fakeCloudflare() })
    return signedIn()
  }

  it('needs a login', async () => {
    expect((await client().call('GET', '/api/integrations/cloudflare')).status).toBe(401)
    expect((await client().call('GET', '/api/import/cloudflare')).status).toBe(401)
  })

  it('refuses the Global API Key and tokens Cloudflare rejects, keeping nothing', async () => {
    const browser = await withCloudflare()
    expect((await browser.call('PUT', '/api/integrations/cloudflare', { token: '0123456789abcdef0123456789abcdef01234' })).body.error).toMatch(/Global API Key/)
    expect((await browser.call('PUT', '/api/integrations/cloudflare', { token: 'z'.repeat(40) })).status).toBe(400)
    expect((await browser.call('GET', '/api/integrations/cloudflare')).body).toEqual({ connected: false })
  })

  it('connects, stores the token encrypted, never returns it, and reads the import', async () => {
    const browser = await withCloudflare()
    const connect = await browser.call('PUT', '/api/integrations/cloudflare', { token: CF_TOKEN })
    expect(connect.body).toEqual({ connected: true, hint: `token ending ${CF_TOKEN.slice(-4)}` })
    expect(store.getIntegration('cloudflare')?.sealedKey).not.toContain(CF_TOKEN)
    expect(JSON.stringify((await browser.call('GET', '/api/integrations/cloudflare')).body)).not.toContain(CF_TOKEN)

    const preview = await browser.call('GET', '/api/import/cloudflare')
    expect((preview.body.domains as { name: string }[]).map((domain) => domain.name)).toEqual(['shop.example', 'news.example', 'old.example'])

    await browser.call('DELETE', '/api/integrations/cloudflare')
    expect((await browser.call('GET', '/api/import/cloudflare')).status).toBe(404)
  })
})

describe('Registrar import', () => {
  async function withRegistrars() {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    const porkbun = fakePorkbun()
    const spaceship = fakeSpaceship()
    await start({ registrarFetch: (url, init) => (url.includes('porkbun') ? porkbun(url, init) : spaceship(url, init)) })
    return signedIn()
  }

  it('needs a login and a known registrar', async () => {
    expect((await client().call('GET', '/api/integrations/registrars')).status).toBe(401)
    const browser = await withRegistrars()
    expect((await browser.call('GET', '/api/import/registrar?registrar=godaddy')).body.error).toMatch(/Porkbun, Namecheap or Spaceship/)
    expect((await browser.call('GET', '/api/import/registrar?registrar=porkbun')).status).toBe(404)
  })

  it('refuses keys the registrar rejects, keeping nothing', async () => {
    const browser = await withRegistrars()
    const refused = await browser.call('PUT', '/api/integrations/registrars', { registrar: 'porkbun', credentials: { ...PORKBUN_KEYS, secretKey: 'sk1_wrongwrongwrongwrong' } })
    expect(refused.body.error).toMatch(/Porkbun says/)
    expect((await browser.call('GET', '/api/integrations/registrars')).body).toEqual({ porkbun: { connected: false }, namecheap: { connected: false }, spaceship: { connected: false } })
  })

  it('connects each registrar separately, keeps keys encrypted, and reads the import', async () => {
    const browser = await withRegistrars()
    expect((await browser.call('PUT', '/api/integrations/registrars', { registrar: 'porkbun', credentials: PORKBUN_KEYS })).body).toEqual({ connected: true, hint: `key ending ${PORKBUN_KEYS.apiKey.slice(-4)}` })
    await browser.call('PUT', '/api/integrations/registrars', { registrar: 'spaceship', credentials: SPACESHIP_KEYS })
    expect(store.getIntegration('registrar-porkbun')?.sealedKey).not.toContain(PORKBUN_KEYS.secretKey)
    const status = JSON.stringify((await browser.call('GET', '/api/integrations/registrars')).body)
    expect(status).not.toContain(PORKBUN_KEYS.secretKey)
    expect(status).not.toContain(SPACESHIP_KEYS.apiSecret)

    const preview = await browser.call('GET', '/api/import/registrar?registrar=spaceship')
    expect(preview.body).toMatchObject({ registrar: 'Spaceship' })
    expect((preview.body.domains as { name: string }[]).map((domain) => domain.name)).toEqual(['shop.example', 'app.example'])

    await browser.call('DELETE', '/api/integrations/registrars?registrar=porkbun')
    expect((await browser.call('GET', '/api/import/registrar?registrar=porkbun')).status).toBe(404)
    expect((await browser.call('GET', '/api/import/registrar?registrar=spaceship')).status).toBe(200)
  })
})

describe('Server host import', () => {
  async function withHosts() {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    const hetzner = fakeHetzner()
    const custom = fakeCustom()
    await start({ hostFetch: (url, init) => (url.includes('hetzner') ? hetzner(url, init) : custom(url, init)) })
    return signedIn()
  }

  it('needs a login and a known host', async () => {
    expect((await client().call('GET', '/api/integrations/hosts')).status).toBe(401)
    const browser = await withHosts()
    expect((await browser.call('GET', '/api/import/host?host=linode')).body.error).toMatch(/Hetzner, DigitalOcean or a custom URL/)
    expect((await browser.call('GET', '/api/import/host?host=hetzner')).status).toBe(404)
  })

  it('connects Hetzner and a custom URL, keeps tokens encrypted, and reads the import', async () => {
    const browser = await withHosts()
    expect((await browser.call('PUT', '/api/integrations/hosts', { host: 'hetzner', credentials: { token: 'x'.repeat(64) } })).status).toBe(400)
    expect((await browser.call('PUT', '/api/integrations/hosts', { host: 'hetzner', credentials: { token: HETZNER_TOKEN } })).body).toEqual({ connected: true, hint: `token ending ${HETZNER_TOKEN.slice(-4)}` })
    expect((await browser.call('PUT', '/api/integrations/hosts', { host: 'custom', credentials: { url: CUSTOM_URL, token: CUSTOM_TOKEN } })).body).toEqual({ connected: true, hint: 'URL on inventory.example' })
    expect(store.getIntegration('host-custom')?.sealedKey).not.toContain(CUSTOM_TOKEN)
    const status = JSON.stringify((await browser.call('GET', '/api/integrations/hosts')).body)
    expect(status).not.toContain(HETZNER_TOKEN)
    expect(status).not.toContain(CUSTOM_TOKEN)

    const preview = await browser.call('GET', '/api/import/host?host=hetzner')
    expect((preview.body.servers as { name: string }[]).map((item) => item.name)).toEqual(['web-1', 'worker'])

    await browser.call('DELETE', '/api/integrations/hosts?host=hetzner')
    expect((await browser.call('GET', '/api/import/host?host=hetzner')).status).toBe(404)
    expect((await browser.call('GET', '/api/import/host?host=custom')).status).toBe(200)
  })
})

describe('Revenue sources', () => {
  async function withSources() {
    await new Promise((resolve) => server.close(resolve))
    store.close()
    const paddle = fakePaddle()
    const custom = fakeRevenueUrl()
    await start({ revenueFetch: (url, init) => (url.includes('paddle') ? paddle(url, init) : custom(url, init)) })
    return { browser: await signedIn(), paddle }
  }

  it('needs a login and a known source', async () => {
    expect((await client().call('GET', '/api/integrations/revenue')).status).toBe(401)
    const { browser } = await withSources()
    expect((await browser.call('GET', '/api/revenue/source?source=gumroad')).body.error).toMatch(/Lemon Squeezy, Paddle or a custom URL/)
    expect((await browser.call('GET', '/api/revenue/source?source=paddle')).status).toBe(404)
  })

  it('connects, keeps keys encrypted, returns revenue, and caches it', async () => {
    const { browser, paddle } = await withSources()
    expect((await browser.call('PUT', '/api/integrations/revenue', { source: 'paddle', credentials: { apiKey: 'x'.repeat(40) } })).status).toBe(400)
    const connect = await browser.call('PUT', '/api/integrations/revenue', { source: 'paddle', credentials: { apiKey: PADDLE_KEY } })
    expect(connect.body).toMatchObject({ connected: true, hint: `key ending ${PADDLE_KEY.slice(-4)}`, revenue: { label: 'Paddle' } })
    await browser.call('PUT', '/api/integrations/revenue', { source: 'custom', credentials: { url: REVENUE_URL, token: REVENUE_TOKEN } })
    expect(store.getIntegration('revenue-paddle')?.sealedKey).not.toContain(PADDLE_KEY)
    const status = JSON.stringify((await browser.call('GET', '/api/integrations/revenue')).body)
    expect(status).not.toContain(PADDLE_KEY)
    expect(status).not.toContain(REVENUE_TOKEN)

    const calls = paddle.mock.calls.length
    expect(((await browser.call('GET', '/api/revenue/source?source=paddle')).body.products as { id: string }[])[0]?.id).toBe('paddle:pro_app')
    expect(paddle.mock.calls.length).toBe(calls)
    await browser.call('GET', '/api/revenue/source?source=paddle&refresh=1')
    expect(paddle.mock.calls.length).toBeGreaterThan(calls)

    await browser.call('DELETE', '/api/integrations/revenue?source=paddle')
    expect((await browser.call('GET', '/api/revenue/source?source=paddle')).status).toBe(404)
    expect((await browser.call('GET', '/api/revenue/source?source=custom')).body.products).toHaveLength(3)
  })
})
