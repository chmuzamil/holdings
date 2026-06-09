import dns from 'node:dns/promises'
import http from 'node:http'
import { URL } from 'node:url'

const port = Number(process.env.FOUNDER_OS_API_PORT || 4180)
const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA']

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': process.env.FOUNDER_OS_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/[^a-z0-9.-]/g, '')
}

async function resolveType(domain, type) {
  try {
    const value = type === 'SOA' ? await dns.resolveSoa(domain) : await dns.resolve(domain, type)
    return { type, value }
  } catch (error) {
    return { type, error: error.code || error.message }
  }
}

async function getRdapBootstrap(domain) {
  const tld = domain.split('.').pop()
  const response = await fetch('https://data.iana.org/rdap/dns.json')
  if (!response.ok) return null

  const bootstrap = await response.json()
  const service = bootstrap.services.find(([tlds]) => tlds.includes(tld))
  return service?.[1]?.[0] || null
}

function firstEvent(rdap, action) {
  return rdap?.events?.find((event) => event.eventAction === action)?.eventDate || ''
}

function entityName(entity) {
  const vcard = entity?.vcardArray?.[1] || []
  return vcard.find(([name]) => name === 'fn')?.[3] || ''
}

async function lookupRdap(domain) {
  const base = await getRdapBootstrap(domain)
  if (!base) return { error: 'RDAP bootstrap not found for this TLD' }

  const response = await fetch(new URL(`domain/${domain}`, base).toString(), {
    headers: { Accept: 'application/rdap+json, application/json' },
  })

  if (!response.ok) {
    return { error: `RDAP returned ${response.status}` }
  }

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
}

async function lookupDomain(domain) {
  const dnsResults = await Promise.all(recordTypes.map((type) => resolveType(domain, type)))
  const dnsRecords = Object.fromEntries(dnsResults.map((result) => [
    result.type.toLowerCase(),
    result.error ? { error: result.error, value: [] } : { value: result.value },
  ]))

  return {
    domain,
    checkedAt: new Date().toISOString(),
    dns: dnsRecords,
    whois: await lookupRdap(domain),
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url, `http://${request.headers.host}`)
  if (request.method !== 'GET' || url.pathname !== '/domain-lookup') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  const domain = cleanDomain(url.searchParams.get('domain'))
  if (!domain || !domain.includes('.')) {
    sendJson(response, 400, { error: 'Valid domain is required' })
    return
  }

  try {
    sendJson(response, 200, await lookupDomain(domain))
  } catch (error) {
    sendJson(response, 500, { error: error.message })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Founder OS domain API listening on http://127.0.0.1:${port}`)
})
