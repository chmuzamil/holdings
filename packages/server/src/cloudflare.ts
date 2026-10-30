import type { FetchLike } from './stripe'

// Read-only import from Cloudflare: zones (as domains), their DNS records,
// and registrar details where the token may read them. Uses an API token
// with read access only, so Holdings can't change anything in Cloudflare.

const API = 'https://api.cloudflare.com/client/v4'
const PER_PAGE = 50
const MAX_PAGES = 20
const MAX_ZONES = 200
const TIMEOUT_MS = 15_000
const RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME'])

export interface CloudflareRecord {
  type: string
  /** Full name, e.g. "staging.shop.example". */
  name: string
  content: string
  proxied: boolean
}

export interface CloudflareDomain {
  name: string
  status: string
  plan: string
  nameservers: string[]
  /** "Cloudflare" when registered there, else the registrar Cloudflare knows of, or null. */
  registrar: string | null
  expiresAt: string | null
  autoRenew: boolean | null
  locked: boolean | null
  records: CloudflareRecord[]
}

export interface CloudflareImport {
  checkedAt: string
  domains: CloudflareDomain[]
  /** Things the token couldn't read, in plain words. */
  warnings: string[]
}

export class CloudflareError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** Returns an error message, or '' for something that looks like an API token. */
export function checkCloudflareToken(token: string): string {
  const value = token.trim()
  if (/^[a-f0-9]{37}$/i.test(value)) {
    return 'That looks like the Global API Key, which can change everything in your account. Create an API token with read-only permissions instead.'
  }
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(value)) return 'Paste a Cloudflare API token (My Profile → API Tokens → Create Token).'
  return ''
}

export function tokenHint(token: string): string {
  return `token ending ${token.trim().slice(-4)}`
}

interface Envelope<T> {
  success?: boolean
  result?: T
  errors?: { code?: number; message?: string }[]
  result_info?: { page?: number; total_pages?: number }
}

async function get<T>(token: string, path: string, fetchImpl: FetchLike): Promise<Envelope<T>> {
  let response: Response
  try {
    response = await fetchImpl(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new CloudflareError('Couldn’t reach Cloudflare. Try again in a minute.', 502)
  }
  const body = (await response.json().catch(() => ({}))) as Envelope<T>
  if (response.status === 401 || body.errors?.some((error) => error.code === 1000 || error.code === 6003)) {
    throw new CloudflareError('Cloudflare didn’t accept this token. It may have been deleted, expired or mistyped.', 400)
  }
  if (response.status === 403) throw new CloudflareError('forbidden', 403)
  if (!response.ok || body.success === false) {
    throw new CloudflareError(body.errors?.[0]?.message || `Cloudflare answered ${response.status}.`, 502)
  }
  return body
}

async function listAll<T>(token: string, path: string, fetchImpl: FetchLike, limit = PER_PAGE * MAX_PAGES): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES && items.length < limit; page += 1) {
    const join = path.includes('?') ? '&' : '?'
    const body = await get<T[]>(token, `${path}${join}per_page=${PER_PAGE}&page=${page}`, fetchImpl)
    items.push(...(body.result ?? []))
    if (!body.result?.length || page >= (body.result_info?.total_pages ?? 1)) break
  }
  return items.slice(0, limit)
}

/** Checks the token is active before it is kept. */
export async function verifyToken(token: string, fetchImpl: FetchLike) {
  const body = await get<{ status?: string }>(token, '/user/tokens/verify', fetchImpl)
  if (body.result?.status !== 'active') throw new CloudflareError('This token isn’t active. Check it in Cloudflare.', 400)
}

const date = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null)

/** Reads everything Holdings can use. Parts the token can't read become warnings, not errors. */
export async function fetchCloudflare(token: string, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<CloudflareImport> {
  const warnings: string[] = []
  let zones: any[]
  try {
    zones = await listAll<any>(token, '/zones', fetchImpl, MAX_ZONES)
  } catch (error) {
    if (error instanceof CloudflareError && error.status === 403) {
      throw new CloudflareError('This token can’t list your zones. Give it Zone: Read for the zones you want to import.', 400)
    }
    throw error
  }
  if (zones.length >= MAX_ZONES) warnings.push(`Only the first ${MAX_ZONES} zones were read.`)

  // Registrar details, per account (needs Account → Registrar: Read).
  const registered = new Map<string, any>()
  const accounts = [...new Set(zones.map((zone) => zone.account?.id).filter(Boolean))] as string[]
  let registrarAllowed = true
  for (const account of accounts) {
    try {
      for (const domain of await listAll<any>(token, `/accounts/${account}/registrar/domains`, fetchImpl)) {
        if (domain?.name) registered.set(String(domain.name).toLowerCase(), domain)
      }
    } catch (error) {
      if (error instanceof CloudflareError && (error.status === 403 || error.status === 502)) registrarAllowed = false
      else throw error
    }
  }
  if (accounts.length && !registrarAllowed) {
    warnings.push('Expiry dates and transfer locks need Account → Registrar: Read on the token (only for domains registered at Cloudflare).')
  }

  // DNS records per zone (needs Zone → DNS: Read).
  let dnsAllowed = true
  const domains: CloudflareDomain[] = []
  for (const zone of zones) {
    const name = String(zone.name ?? '').toLowerCase()
    if (!name) continue
    let records: CloudflareRecord[] = []
    if (dnsAllowed) {
      try {
        records = (await listAll<any>(token, `/zones/${encodeURIComponent(zone.id)}/dns_records`, fetchImpl))
          .filter((record) => RECORD_TYPES.has(String(record.type)))
          .map((record) => ({ type: String(record.type), name: String(record.name).toLowerCase(), content: String(record.content), proxied: Boolean(record.proxied) }))
      } catch (error) {
        if (error instanceof CloudflareError && error.status === 403) {
          dnsAllowed = false
          warnings.push('Subdomains need Zone → DNS: Read on the token.')
        } else {
          throw error
        }
      }
    }
    const registration = registered.get(name)
    domains.push({
      name,
      status: String(zone.status ?? ''),
      plan: String(zone.plan?.name ?? ''),
      nameservers: Array.isArray(zone.name_servers) ? zone.name_servers.map((server: unknown) => String(server).toLowerCase()) : [],
      registrar: registration ? 'Cloudflare' : zone.original_registrar ? String(zone.original_registrar) : null,
      expiresAt: date(registration?.expires_at),
      autoRenew: typeof registration?.auto_renew === 'boolean' ? registration.auto_renew : null,
      locked: typeof registration?.locked === 'boolean' ? registration.locked : null,
      records,
    })
  }
  return { checkedAt: new Date(now).toISOString(), domains, warnings }
}
