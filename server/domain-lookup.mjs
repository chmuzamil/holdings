import { Resolver } from 'node:dns/promises'

const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA']
const fetchTimeoutMs = 8000
const bootstrapTtlMs = 24 * 60 * 60 * 1000
const resultTtlMs = 5 * 60 * 1000
const maxCachedResults = 500

// Names that only make sense on a private network. Looking them up from the
// server would reveal internal DNS, so they are refused.
const privateSuffixes = ['local', 'localhost', 'internal', 'lan', 'home', 'corp', 'intranet', 'private', 'arpa', 'test', 'invalid']

const resolver = new Resolver({ timeout: 3000, tries: 2 })

export function cleanDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0]
    .replace(/\.$/, '')
}

// Returns an error message, or '' when the name is a valid public domain.
export function validateDomain(domain) {
  if (!domain) return 'Enter a domain name.'
  if (domain.length > 253) return 'That domain name is too long.'
  const labels = domain.split('.')
  if (labels.length < 2) return 'Enter a full domain name, like example.com.'
  const labelPattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
  if (!labels.every((label) => labelPattern.test(label))) return 'That is not a valid domain name.'
  const tld = labels.at(-1)
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return 'That is not a valid domain name.'
  if (privateSuffixes.includes(tld)) return 'Private network names cannot be looked up.'
  return ''
}

async function resolveType(domain, type) {
  try {
    const value = type === 'SOA' ? await resolver.resolveSoa(domain) : await resolver.resolve(domain, type)
    return { type, value }
  } catch (error) {
    return { type, error: error.code || 'LOOKUP_FAILED' }
  }
}

let bootstrapCache = { at: 0, services: null }

async function getRdapBase(domain, fetchImpl) {
  if (!bootstrapCache.services || Date.now() - bootstrapCache.at > bootstrapTtlMs) {
    const response = await fetchImpl('https://data.iana.org/rdap/dns.json', {
      signal: AbortSignal.timeout(fetchTimeoutMs),
    })
    if (!response.ok) return null
    const bootstrap = await response.json()
    bootstrapCache = { at: Date.now(), services: bootstrap.services || [] }
  }

  const tld = domain.split('.').pop()
  const service = bootstrapCache.services.find(([tlds]) => tlds.includes(tld))
  const base = service?.[1]?.find((url) => url.startsWith('https://'))
  return base || null
}

function firstEvent(rdap, action) {
  return rdap?.events?.find((event) => event.eventAction === action)?.eventDate || ''
}

function entityName(entity) {
  const vcard = entity?.vcardArray?.[1] || []
  return vcard.find(([name]) => name === 'fn')?.[3] || ''
}

async function lookupRdap(domain, fetchImpl) {
  try {
    const base = await getRdapBase(domain, fetchImpl)
    if (!base) return { error: 'No RDAP service is listed for this domain ending.' }

    const response = await fetchImpl(new URL(`domain/${domain}`, base).toString(), {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    })
    if (!response.ok) return { error: `The registry answered with status ${response.status}.` }

    const rdap = await response.json()
    const registrar = rdap.entities?.find((entity) => entity.roles?.includes('registrar'))
    return {
      registrar: entityName(registrar),
      created: firstEvent(rdap, 'registration'),
      updated: firstEvent(rdap, 'last changed'),
      expires: firstEvent(rdap, 'expiration'),
      status: rdap.status || [],
      nameservers: rdap.nameservers?.map((server) => server.ldhName).filter(Boolean) || [],
      rdapUrl: response.url,
    }
  } catch {
    return { error: 'The registry could not be reached.' }
  }
}

const resultCache = new Map()

export async function lookupDomain(domain, { fetchImpl = fetch } = {}) {
  const cached = resultCache.get(domain)
  if (cached && Date.now() - cached.at < resultTtlMs) return cached.result

  const dnsResults = await Promise.all(recordTypes.map((type) => resolveType(domain, type)))
  const result = {
    domain,
    checkedAt: new Date().toISOString(),
    dns: Object.fromEntries(dnsResults.map((entry) => [
      entry.type.toLowerCase(),
      entry.error ? { error: entry.error, value: [] } : { value: entry.value },
    ])),
    whois: await lookupRdap(domain, fetchImpl),
  }

  resultCache.set(domain, { at: Date.now(), result })
  if (resultCache.size > maxCachedResults) {
    resultCache.delete(resultCache.keys().next().value)
  }
  return result
}

// Fixed-window limiter keyed by client address.
export function createRateLimiter({ limit = 30, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map()
  return function allow(key) {
    const time = now()
    const entry = hits.get(key)
    if (!entry || time - entry.start >= windowMs) {
      hits.set(key, { start: time, count: 1 })
      if (hits.size > 10_000) hits.clear()
      return true
    }
    entry.count += 1
    return entry.count <= limit
  }
}
