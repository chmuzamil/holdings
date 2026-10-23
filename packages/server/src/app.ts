import type { IncomingMessage, ServerResponse } from 'node:http'
import { hashPassword, hashToken, newToken, sameString, seal, unseal, verifyPassword } from './crypto'
import type { Store } from './db'
import { serveStatic } from './static'
import { checkStripeKey, fetchStripeRevenue, keyHint, StripeError, type FetchLike, type StripeRevenue } from './stripe'
import { newTotpSecret, otpauthUri, verifyTotp } from './totp'
// Shared with `npm run api`, which serves lookups when there is no server.
import { cleanDomain, createRateLimiter, lookupDomain, validateDomain } from '../../../server/domain-lookup.mjs'

export const SESSION_COOKIE = 'holdings_session'
export const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 1024
const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
const SESSION_TOUCH_MS = 60 * 60 * 1000
const MAX_DATA_BYTES = 5 * 1024 * 1024
const MAX_SMALL_BODY_BYTES = 16 * 1024
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const FAILURES_PER_IP = 10
const REVENUE_CACHE_MS = 10 * 60 * 1000
const TOKEN_PREFIX = 'hld_'
const MAX_TOKENS = 20

export interface AppOptions {
  store: Store
  /** 32-byte key that encrypts TOTP secrets at rest. */
  secretKey: Buffer
  /** One-time code printed to the logs; needed to create the login. */
  setupCode: string | null
  /** Built app to serve (the Vite `dist` folder). */
  staticDir?: string | null
  /** Mark the cookie Secure. Turn on whenever the panel is served over HTTPS. */
  secureCookies?: boolean
  /** Read the client address from X-Forwarded-For (behind a reverse proxy). */
  trustProxy?: boolean
  now?: () => number
  lookup?: (domain: string) => Promise<unknown>
  /** fetch() used for Stripe; replaced in tests. */
  stripeFetch?: FetchLike
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message)
  }
}

type Handler = (context: Context) => Promise<unknown> | unknown

interface Context {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  ip: string
  sessionHash: string | null
  body: () => Promise<Record<string, unknown>>
}

export function createApp(options: AppOptions) {
  const { store, secretKey, setupCode, staticDir = null, secureCookies = false, trustProxy = false } = options
  const now = options.now ?? Date.now
  const lookup = options.lookup ?? ((domain: string) => lookupDomain(domain))
  const allowLookup = createRateLimiter({ limit: 30, windowMs: 60_000, now })
  const failures = createFailureCounter(now)
  let revenueCache: { at: number; revenue: StripeRevenue } | null = null

  async function stripeRevenue(key: string, refresh: boolean) {
    if (!refresh && revenueCache && now() - revenueCache.at < REVENUE_CACHE_MS) return revenueCache.revenue
    try {
      const revenue = await fetchStripeRevenue(key, options.stripeFetch, now())
      revenueCache = { at: now(), revenue }
      return revenue
    } catch (error) {
      if (error instanceof StripeError) throw new HttpError(error.status, error.message)
      throw error
    }
  }

  // --- helpers -------------------------------------------------------------

  function clientIp(request: IncomingMessage): string {
    if (trustProxy) {
      const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean)
      if (forwarded.length) return forwarded[forwarded.length - 1] as string
    }
    return request.socket.remoteAddress || 'unknown'
  }

  function readSessionHash(request: IncomingMessage): string | null {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE]
    if (!token) return null
    const tokenHash = hashToken(token)
    const session = store.getSession(tokenHash)
    const time = now()
    if (!session) return null
    if (session.expiresAt <= time) {
      store.deleteSession(tokenHash)
      return null
    }
    if (time - session.lastSeenAt > SESSION_TOUCH_MS) store.touchSession(tokenHash, time, time + SESSION_MS)
    return tokenHash
  }

  function startSession(response: ServerResponse) {
    const token = newToken()
    const time = now()
    store.deleteExpiredSessions(time)
    store.addSession(hashToken(token), time, time + SESSION_MS)
    response.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 24 * 60 * 60))
    return hashToken(token)
  }

  function sessionCookie(value: string, maxAge: number) {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`
  }

  /**
   * Browsers drop Secure cookies on plain HTTP (except localhost), so the
   * login would silently fail. Say what to change instead.
   */
  function checkCookieWillStick(request: IncomingMessage) {
    if (!secureCookies) return
    const https = Boolean((request.socket as { encrypted?: boolean }).encrypted)
      || (trustProxy && String(request.headers['x-forwarded-proto'] || '').split(',')[0]?.trim() === 'https')
    let hostname = ''
    try {
      hostname = new URL(`http://${request.headers.host}`).hostname
    } catch {
      hostname = ''
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')
    if (!https && !local) {
      throw new HttpError(400, 'Your browser won’t keep the login over plain HTTP. Open Holdings over HTTPS (behind a proxy, also set HOLDINGS_TRUST_PROXY=true), or set HOLDINGS_SECURE_COOKIES=false if this is a trusted home network.')
    }
  }

  function requireSession(context: Context): string {
    if (!context.sessionHash) throw new HttpError(401, 'Sign in first.')
    return context.sessionHash
  }

  /**
   * Read-only access for agents: a signed-in session, or an access token sent
   * as "Authorization: Bearer hld_…". Tokens work on GET /api/data only.
   */
  function requireReader(context: Context) {
    if (context.sessionHash) return
    const header = String(context.request.headers.authorization || '')
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) throw new HttpError(401, 'Sign in first, or send an access token.')
    checkNotLocked(context.ip)
    if (!token.startsWith(TOKEN_PREFIX) || !store.useToken(hashToken(token))) {
      fail(context.ip, 'token_rejected', 'That access token isn’t valid. It may have been deleted.')
    }
  }

  function requireOwner() {
    const owner = store.getOwner()
    if (!owner) throw new HttpError(409, 'Create your login first.')
    return owner
  }

  function checkNotLocked(ip: string) {
    if (failures.blocked(ip)) {
      throw new HttpError(429, 'Too many wrong attempts. Wait 15 minutes and try again.')
    }
  }

  function fail(ip: string, event: string, message: string, extra: Record<string, unknown> = {}): never {
    failures.add(ip)
    store.audit(event, ip)
    throw new HttpError(401, message, extra)
  }

  function validNewPassword(value: unknown): string {
    const password = typeof value === 'string' ? value : ''
    if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'That password is too long.')
    return password
  }

  async function passwordMatches(value: unknown, passwordHash: string) {
    const password = typeof value === 'string' ? value : ''
    if (!password || password.length > MAX_PASSWORD_LENGTH) return false
    return verifyPassword(password, passwordHash)
  }

  /** Checks a TOTP code and marks it used. */
  function totpMatches(sealed: string, lastStep: number, code: unknown) {
    const step = verifyTotp(unseal(sealed, secretKey), String(code ?? ''), { now: now(), lastUsedStep: lastStep })
    return step !== null && store.useTotpStep(step)
  }

  // --- routes --------------------------------------------------------------

  const routes: Record<string, Handler> = {
    'GET /api/healthz': () => ({ ok: true }),

    'GET /api/session': ({ sessionHash }) => {
      const owner = store.getOwner()
      if (!owner) return { setupNeeded: true, authenticated: false }
      if (!sessionHash) return { setupNeeded: false, authenticated: false }
      return { setupNeeded: false, authenticated: true, totpEnabled: Boolean(owner.totpSealed) }
    },

    'POST /api/setup': async ({ body, ip, request, response }) => {
      checkCookieWillStick(request)
      checkNotLocked(ip)
      const input = await body()
      if (store.getOwner()) throw new HttpError(409, 'A login already exists. Sign in instead.')
      if (!setupCode || typeof input.setupCode !== 'string' || !sameString(input.setupCode.trim().toUpperCase(), setupCode)) {
        fail(ip, 'setup_failed', 'That setup code is not right. Find it in the server logs.')
      }
      const password = validNewPassword(input.password)
      if (!store.createOwner(await hashPassword(password))) throw new HttpError(409, 'A login already exists. Sign in instead.')
      store.audit('setup', ip)
      startSession(response)
      return { authenticated: true, totpEnabled: false }
    },

    'POST /api/login': async ({ body, ip, request, response }) => {
      checkCookieWillStick(request)
      checkNotLocked(ip)
      const input = await body()
      const owner = requireOwner()
      if (!(await passwordMatches(input.password, owner.passwordHash))) {
        fail(ip, 'login_failed', 'Wrong password or code.')
      }
      if (owner.totpSealed) {
        if (input.code === undefined || input.code === '') {
          throw new HttpError(401, 'Enter the 6-digit code from your authenticator app.', { needsCode: true })
        }
        if (!totpMatches(owner.totpSealed, owner.totpLastStep, input.code)) {
          fail(ip, 'login_failed', 'Wrong password or code.', { needsCode: true })
        }
      }
      failures.clear(ip)
      store.audit('login', ip)
      startSession(response)
      return { authenticated: true, totpEnabled: Boolean(owner.totpSealed) }
    },

    'POST /api/logout': ({ sessionHash, response }) => {
      if (sessionHash) store.deleteSession(sessionHash)
      response.setHeader('Set-Cookie', sessionCookie('', 0))
      return { authenticated: false }
    },

    'GET /api/data': (context) => {
      requireReader(context)
      const saved = store.getData()
      if (!saved) return { data: null, version: 0, updatedAt: null }
      return { data: JSON.parse(saved.body), version: saved.version, updatedAt: saved.updatedAt }
    },

    'PUT /api/data': async (context) => {
      requireSession(context)
      const input = await context.body()
      if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
        throw new HttpError(400, 'Send your data as a JSON object.')
      }
      const version = Number(input.version)
      if (!Number.isInteger(version) || version < 0) throw new HttpError(400, 'Send the version you last loaded.')
      const saved = store.putData(JSON.stringify(input.data), version)
      if (!saved) {
        const current = store.getData()
        throw new HttpError(409, 'Your data changed somewhere else. Reload to get the latest copy.', { version: current?.version ?? 0 })
      }
      return { version: saved.version, updatedAt: saved.updatedAt }
    },

    'POST /api/password': async (context) => {
      const sessionHash = requireSession(context)
      checkNotLocked(context.ip)
      const input = await context.body()
      const owner = requireOwner()
      if (!(await passwordMatches(input.currentPassword, owner.passwordHash))) {
        fail(context.ip, 'password_change_failed', 'Your current password is not right.')
      }
      if (owner.totpSealed && !totpMatches(owner.totpSealed, owner.totpLastStep, input.code)) {
        fail(context.ip, 'password_change_failed', 'Enter a fresh code from your authenticator app.')
      }
      store.setPasswordHash(await hashPassword(validNewPassword(input.newPassword)))
      store.deleteOtherSessions(sessionHash)
      store.audit('password_changed', context.ip)
      return { ok: true }
    },

    'POST /api/totp/setup': async (context) => {
      requireSession(context)
      checkNotLocked(context.ip)
      const input = await context.body()
      const owner = requireOwner()
      if (owner.totpSealed) throw new HttpError(409, 'Two-step login is already on.')
      if (!(await passwordMatches(input.password, owner.passwordHash))) {
        fail(context.ip, 'totp_setup_failed', 'Your password is not right.')
      }
      const secret = newTotpSecret()
      store.setPendingTotp(seal(secret, secretKey))
      return { secret, uri: otpauthUri(secret, 'owner') }
    },

    'POST /api/totp/enable': async (context) => {
      requireSession(context)
      const input = await context.body()
      requireOwner()
      const pending = store.getPendingTotp()
      if (!pending) throw new HttpError(409, 'Start two-step setup first.')
      const step = verifyTotp(unseal(pending, secretKey), String(input.code ?? ''), { now: now() })
      if (step === null) throw new HttpError(400, 'That code did not match. Check the time on your phone and try the newest code.')
      store.setTotp(pending, step)
      store.deleteOtherSessions(context.sessionHash)
      store.audit('totp_enabled', context.ip)
      return { totpEnabled: true }
    },

    'POST /api/totp/disable': async (context) => {
      requireSession(context)
      checkNotLocked(context.ip)
      const input = await context.body()
      const owner = requireOwner()
      if (!owner.totpSealed) return { totpEnabled: false }
      if (!(await passwordMatches(input.password, owner.passwordHash)) || !totpMatches(owner.totpSealed, owner.totpLastStep, input.code)) {
        fail(context.ip, 'totp_disable_failed', 'Wrong password or code.')
      }
      store.setTotp(null)
      store.audit('totp_disabled', context.ip)
      return { totpEnabled: false }
    },

    'GET /api/audit': (context) => {
      requireSession(context)
      return { events: store.recentAudit() }
    },

    'GET /api/integrations/stripe': (context) => {
      requireSession(context)
      const stripe = store.getIntegration('stripe')
      return stripe ? { connected: true, hint: stripe.hint, connectedAt: stripe.connectedAt } : { connected: false }
    },

    'PUT /api/integrations/stripe': async (context) => {
      requireSession(context)
      const input = await context.body()
      const key = typeof input.key === 'string' ? input.key.trim() : ''
      const invalid = checkStripeKey(key)
      if (invalid) throw new HttpError(400, invalid)
      // Check the key can read what we need before keeping it.
      const revenue = await stripeRevenue(key, true)
      store.setIntegration('stripe', seal(key, secretKey), keyHint(key))
      store.audit('stripe_connected', context.ip)
      return { connected: true, hint: keyHint(key), revenue }
    },

    'DELETE /api/integrations/stripe': (context) => {
      requireSession(context)
      store.deleteIntegration('stripe')
      revenueCache = null
      store.audit('stripe_disconnected', context.ip)
      return { connected: false }
    },

    'GET /api/revenue/stripe': async (context) => {
      requireSession(context)
      const stripe = store.getIntegration('stripe')
      if (!stripe) throw new HttpError(404, 'Stripe isn’t connected.')
      return stripeRevenue(unseal(stripe.sealedKey, secretKey), context.url.searchParams.get('refresh') === '1')
    },

    'GET /api/tokens': (context) => {
      requireSession(context)
      return { tokens: store.listTokens() }
    },

    'POST /api/tokens': async (context) => {
      requireSession(context)
      const input = await context.body()
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : ''
      if (!name) throw new HttpError(400, 'Give the token a name, like the agent or computer that uses it.')
      if (store.listTokens().length >= MAX_TOKENS) throw new HttpError(409, `You can have up to ${MAX_TOKENS} tokens. Delete one you no longer use.`)
      const token = TOKEN_PREFIX + newToken()
      const id = newToken().slice(0, 12)
      store.addToken(id, name, hashToken(token))
      store.audit('token_created', context.ip)
      // The only time the token is shown.
      return { id, name, token }
    },

    'DELETE /api/tokens': async (context) => {
      requireSession(context)
      const input = await context.body()
      if (!store.deleteToken(String(input.id ?? ''))) throw new HttpError(404, 'No such token.')
      store.audit('token_deleted', context.ip)
      return { ok: true }
    },

    'GET /api/domain-lookup': async (context) => {
      requireSession(context)
      if (!allowLookup(context.ip)) throw new HttpError(429, 'Too many lookups. Wait a minute and try again.')
      const domain = cleanDomain(context.url.searchParams.get('domain'))
      const invalid = validateDomain(domain)
      if (invalid) throw new HttpError(400, invalid)
      return lookup(domain)
    },
  }

  // --- request handling ----------------------------------------------------

  return async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url || '/', 'http://localhost')
    const method = request.method || 'GET'

    if (!url.pathname.startsWith('/api/')) {
      if (staticDir && (method === 'GET' || method === 'HEAD')) return serveStatic(staticDir, url.pathname, request, response)
      return sendJson(response, 404, { error: 'Not found' })
    }

    try {
      const handler = routes[`${method} ${url.pathname}`]
      if (!handler) throw new HttpError(404, 'Not found')
      if (method !== 'GET' && method !== 'HEAD') checkSameOrigin(request, trustProxy)
      const sessionHash = readSessionHash(request)
      const limit = url.pathname === '/api/data' ? MAX_DATA_BYTES : MAX_SMALL_BODY_BYTES
      const result = await handler({ request, response, url, ip: clientIp(request), sessionHash, body: () => readJson(request, limit) })
      sendJson(response, 200, result)
    } catch (error) {
      if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message, ...error.extra })
      console.error(`${method} ${url.pathname} failed:`, error)
      sendJson(response, 500, { error: 'Something went wrong on the server. Check its logs.' })
    }
  }
}

// --- plumbing ----------------------------------------------------------------

/**
 * Browsers can't add a custom header to a cross-site form post, and can only
 * add one to a cross-site fetch after a CORS preflight we never approve. So
 * requiring it (plus a matching Origin) stops cross-site request forgery.
 */
function checkSameOrigin(request: IncomingMessage, trustProxy: boolean) {
  if (request.headers['x-requested-with'] !== 'holdings') throw new HttpError(403, 'Missing request header.')
  const origin = request.headers.origin
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = ''
    }
    const host = (trustProxy && request.headers['x-forwarded-host']) || request.headers.host
    if (!originHost || originHost !== host) throw new HttpError(403, 'Request came from another site.')
  }
}

function readJson(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const type = String(request.headers['content-type'] || '')
    if (!type.startsWith('application/json')) return reject(new HttpError(415, 'Send JSON.'))
    const declared = Number(request.headers['content-length'] || 0)
    if (declared > limit) return reject(new HttpError(413, 'That is too much data to save at once.'))
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'That is too much data to save at once.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
        resolve(parsed)
      } catch {
        reject(new HttpError(400, 'That request was not valid JSON.'))
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  if (response.headersSent) return
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim()
  }
  return cookies
}

/**
 * Counts wrong passwords per address. There is deliberately no global cap:
 * it would let anyone lock the owner out, and with scrypt and a 12-character
 * minimum, guessing from many addresses is still hopeless.
 */
function createFailureCounter(now: () => number) {
  const byIp = new Map<string, number[]>()
  const recent = (times: number[]) => times.filter((time) => now() - time < FAILURE_WINDOW_MS)
  return {
    add(ip: string) {
      byIp.set(ip, [...recent(byIp.get(ip) ?? []), now()])
      if (byIp.size > 10_000) byIp.clear()
    },
    blocked(ip: string) {
      return recent(byIp.get(ip) ?? []).length >= FAILURES_PER_IP
    },
    clear(ip: string) {
      byIp.delete(ip)
    },
  }
}
