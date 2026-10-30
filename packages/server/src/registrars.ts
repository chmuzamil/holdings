import type { FetchLike } from './stripe'

// Read-only import from domain registrars with an API: Porkbun, Namecheap
// and Spaceship. Each lists the domains in the account with their expiry
// date, auto-renew and transfer lock. Holdings only ever reads.

const TIMEOUT_MS = 15_000
const MAX_DOMAINS = 2000

export type RegistrarId = 'porkbun' | 'namecheap' | 'spaceship'
export type Credentials = Record<string, string>

export interface RegistrarDomain {
  name: string
  expiresAt: string | null
  autoRenew: boolean | null
  locked: boolean | null
  nameservers: string[]
}

export interface RegistrarImport {
  registrar: string
  checkedAt: string
  domains: RegistrarDomain[]
  warnings: string[]
}

export class RegistrarError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface Registrar {
  label: string
  /** Credential fields, in the order the form shows them. */
  fields: string[]
  /** An error message, or '' when the credentials look right. */
  check(credentials: Credentials): string
  /** Throws a RegistrarError (status 400) if the registrar refuses them. */
  verify(credentials: Credentials, fetchImpl: FetchLike): Promise<void>
  list(credentials: Credentials, fetchImpl: FetchLike): Promise<RegistrarDomain[]>
}

const KEY = /^[A-Za-z0-9_-]{16,200}$/
const isoDate = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null)
const flag = (value: unknown) => (value === 1 || value === '1' || value === true ? true : value === 0 || value === '0' || value === false ? false : null)

async function call(label: string, url: string, init: RequestInit, fetchImpl: FetchLike) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new RegistrarError(`Couldn’t reach ${label}. Try again in a minute.`, 502)
  }
}

// --- Porkbun -------------------------------------------------------------

const PORKBUN = 'https://api.porkbun.com/api/json/v3'
const PORKBUN_PAGE = 1000

async function porkbun(path: string, credentials: Credentials, extra: Record<string, string>, fetchImpl: FetchLike) {
  const response = await call('Porkbun', `${PORKBUN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apikey: credentials.apiKey, secretapikey: credentials.secretKey, ...extra }),
  }, fetchImpl)
  const body = (await response.json().catch(() => ({}))) as { status?: string; message?: string; domains?: any[] }
  if (body.status !== 'SUCCESS') {
    const message = body.message || `Porkbun answered ${response.status}.`
    // Porkbun answers bad keys with an ERROR status (and 400 or 403).
    throw new RegistrarError(`Porkbun says: ${message}`, response.status >= 500 ? 502 : 400)
  }
  return body
}

const porkbunRegistrar: Registrar = {
  label: 'Porkbun',
  fields: ['apiKey', 'secretKey'],
  check({ apiKey = '', secretKey = '' }) {
    if (apiKey.startsWith('sk1_') && secretKey.startsWith('pk1_')) return 'The API key and secret key are the wrong way round.'
    if (!KEY.test(apiKey) || !KEY.test(secretKey)) return 'Paste both the API key (pk1_…) and the secret API key (sk1_…).'
    return ''
  },
  async verify(credentials, fetchImpl) {
    await porkbun('/ping', credentials, {}, fetchImpl)
  },
  async list(credentials, fetchImpl) {
    const domains: RegistrarDomain[] = []
    for (let start = 0; start < MAX_DOMAINS; start += PORKBUN_PAGE) {
      const body = await porkbun('/domain/listAll', credentials, { start: String(start), includeLabels: 'no' }, fetchImpl)
      const page = Array.isArray(body.domains) ? body.domains : []
      for (const domain of page) {
        if (!domain?.domain) continue
        domains.push({
          name: String(domain.domain).toLowerCase(),
          expiresAt: isoDate(domain.expireDate),
          autoRenew: flag(domain.autoRenew),
          locked: flag(domain.securityLock),
          nameservers: [],
        })
      }
      if (page.length < PORKBUN_PAGE) break
    }
    return domains
  },
}

// --- Namecheap -----------------------------------------------------------

const NAMECHEAP = 'https://api.namecheap.com/xml.response'
const NAMECHEAP_PAGE = 100
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

const attributes = (text: string) => Object.fromEntries([...text.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]))
const unescapeXml = (text: string) => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Namecheap dates are MM/DD/YYYY. */
function usDate(value: string | undefined) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '')
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null
}

/** Reads one page of namecheap.domains.getList (XML). */
export function parseNamecheap(xml: string) {
  const status = /<ApiResponse[^>]*\sStatus="(\w+)"/.exec(xml)?.[1]
  if (status !== 'OK') {
    const error = /<Error\b[^>]*>([\s\S]*?)<\/Error>/.exec(xml)?.[1]
    throw new RegistrarError(`Namecheap says: ${error ? unescapeXml(error.trim()) : 'the request was refused.'}`, 400)
  }
  // "<Domain " with a space, so <DomainGetListResult> doesn't match.
  const domains = [...xml.matchAll(/<Domain\s([^>]*?)\/?>/g)].map((match) => attributes(match[1] ?? ''))
  const total = Number(/<TotalItems>(\d+)<\/TotalItems>/.exec(xml)?.[1] ?? domains.length)
  return {
    total,
    domains: domains.filter((domain) => domain.Name).map((domain): RegistrarDomain => ({
      name: String(domain.Name).toLowerCase(),
      expiresAt: usDate(domain.Expires),
      autoRenew: domain.AutoRenew === 'true' ? true : domain.AutoRenew === 'false' ? false : null,
      locked: domain.IsLocked === 'true' ? true : domain.IsLocked === 'false' ? false : null,
      nameservers: [],
    })),
  }
}

async function namecheapPage(credentials: Credentials, page: number, pageSize: number, fetchImpl: FetchLike) {
  const params = new URLSearchParams({
    ApiUser: credentials.apiUser ?? '',
    ApiKey: credentials.apiKey ?? '',
    UserName: credentials.apiUser ?? '',
    ClientIp: credentials.clientIp ?? '',
    Command: 'namecheap.domains.getList',
    PageSize: String(pageSize),
    Page: String(page),
  })
  const response = await call('Namecheap', `${NAMECHEAP}?${params}`, { headers: { Accept: 'application/xml' } }, fetchImpl)
  if (response.status >= 500) throw new RegistrarError(`Namecheap answered ${response.status}.`, 502)
  return parseNamecheap(await response.text())
}

const namecheapRegistrar: Registrar = {
  label: 'Namecheap',
  fields: ['apiUser', 'apiKey', 'clientIp'],
  check({ apiUser = '', apiKey = '', clientIp = '' }) {
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(apiUser)) return 'Enter your Namecheap username.'
    if (!/^[A-Za-z0-9]{16,64}$/.test(apiKey)) return 'Paste the API key from Profile → Tools → Namecheap API Access.'
    if (!IPV4.test(clientIp)) return 'Enter this server’s public IPv4 address, the one you whitelisted at Namecheap.'
    return ''
  },
  async verify(credentials, fetchImpl) {
    await namecheapPage(credentials, 1, 10, fetchImpl)
  },
  async list(credentials, fetchImpl) {
    const domains: RegistrarDomain[] = []
    for (let page = 1; domains.length < MAX_DOMAINS; page += 1) {
      const result = await namecheapPage(credentials, page, NAMECHEAP_PAGE, fetchImpl)
      domains.push(...result.domains)
      if (!result.domains.length || domains.length >= result.total) break
    }
    return domains
  },
}

// --- Spaceship -----------------------------------------------------------

const SPACESHIP = 'https://spaceship.dev/api/v1'
const SPACESHIP_PAGE = 100

async function spaceshipPage(credentials: Credentials, skip: number, take: number, fetchImpl: FetchLike) {
  const response = await call('Spaceship', `${SPACESHIP}/domains?take=${take}&skip=${skip}`, {
    headers: { 'X-Api-Key': credentials.apiKey ?? '', 'X-Api-Secret': credentials.apiSecret ?? '', Accept: 'application/json' },
  }, fetchImpl)
  const body = (await response.json().catch(() => ({}))) as { items?: any[]; total?: number; detail?: string }
  if (response.status === 401) throw new RegistrarError('Spaceship didn’t accept this API key and secret.', 400)
  if (response.status === 403) throw new RegistrarError('This API key can’t read domains. Give it the domains:read scope in Spaceship’s API Manager.', 400)
  if (response.status === 429) throw new RegistrarError('Spaceship says too many requests. Try again in five minutes.', 502)
  if (!response.ok) throw new RegistrarError(body.detail ? `Spaceship says: ${body.detail}` : `Spaceship answered ${response.status}.`, 502)
  return { items: Array.isArray(body.items) ? body.items : [], total: Number(body.total ?? 0) }
}

const spaceshipRegistrar: Registrar = {
  label: 'Spaceship',
  fields: ['apiKey', 'apiSecret'],
  check({ apiKey = '', apiSecret = '' }) {
    if (!KEY.test(apiKey) || !KEY.test(apiSecret)) return 'Paste both the API key and the API secret from Spaceship’s API Manager.'
    return ''
  },
  async verify(credentials, fetchImpl) {
    await spaceshipPage(credentials, 0, 1, fetchImpl)
  },
  async list(credentials, fetchImpl) {
    const domains: RegistrarDomain[] = []
    for (let skip = 0; skip < MAX_DOMAINS; skip += SPACESHIP_PAGE) {
      const { items, total } = await spaceshipPage(credentials, skip, SPACESHIP_PAGE, fetchImpl)
      for (const domain of items) {
        if (!domain?.name) continue
        domains.push({
          name: String(domain.name).toLowerCase(),
          expiresAt: isoDate(domain.expirationDate),
          autoRenew: typeof domain.autoRenew === 'boolean' ? domain.autoRenew : null,
          locked: Array.isArray(domain.eppStatuses) ? domain.eppStatuses.includes('clientTransferProhibited') : null,
          nameservers: Array.isArray(domain.nameservers?.hosts) ? domain.nameservers.hosts.map((host: unknown) => String(host).toLowerCase()) : [],
        })
      }
      if (!items.length || skip + items.length >= total) break
    }
    return domains
  },
}

export const REGISTRARS: Record<RegistrarId, Registrar> = {
  porkbun: porkbunRegistrar,
  namecheap: namecheapRegistrar,
  spaceship: spaceshipRegistrar,
}

export function isRegistrar(value: unknown): value is RegistrarId {
  return typeof value === 'string' && Object.hasOwn(REGISTRARS, value)
}

/** Keeps only the fields this registrar uses, trimmed. */
export function cleanCredentials(id: RegistrarId, input: unknown): Credentials {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return Object.fromEntries(REGISTRARS[id].fields.map((field) => [field, typeof source[field] === 'string' ? (source[field] as string).trim() : '']))
}

export function credentialsHint(credentials: Credentials): string {
  return `key ending ${(credentials.apiKey ?? '').slice(-4)}`
}

/** Reads every domain in the account. */
export async function fetchRegistrar(id: RegistrarId, credentials: Credentials, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<RegistrarImport> {
  const registrar = REGISTRARS[id]
  const seen = new Set<string>()
  const domains = (await registrar.list(credentials, fetchImpl)).filter((domain) => !seen.has(domain.name) && seen.add(domain.name))
  const warnings = domains.length >= MAX_DOMAINS ? [`Only the first ${MAX_DOMAINS} domains were read.`] : []
  return { registrar: registrar.label, checkedAt: new Date(now).toISOString(), domains: domains.slice(0, MAX_DOMAINS), warnings }
}
