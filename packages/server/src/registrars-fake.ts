import { vi } from 'vitest'

// Fake registrar APIs for tests. Keys are built at runtime so the source
// never holds a key-shaped string.

const make = (prefix: string, seed: string) => `${prefix}${seed.repeat(8).slice(0, 40)}`

export const PORKBUN_KEYS = { apiKey: make('pk1_', 'a1b2c3'), secretKey: make('sk1_', 'd4e5f6') }
export const NAMECHEAP_KEYS = { apiUser: 'indiedev', apiKey: make('', 'f0e1d2c3').slice(0, 32), clientIp: '203.0.113.7' }
export const SPACESHIP_KEYS = { apiKey: make('', 'Kx9Lm2'), apiSecret: make('', 'Qw3Er5') }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Porkbun: POST with keys in the body; listAll pages by 1000 (two pages here when `big`). */
export function fakePorkbun({ big = false } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (body.apikey !== PORKBUN_KEYS.apiKey || body.secretapikey !== PORKBUN_KEYS.secretKey) {
      return json({ status: 'ERROR', code: 'INVALID_API_KEYS', message: 'Invalid API key. (002)' }, 403)
    }
    if (url.endsWith('/ping')) return json({ status: 'SUCCESS', yourIp: '203.0.113.7', credentialsValid: true })
    if (url.endsWith('/domain/listAll')) {
      const domains = [
        { domain: 'Shop.example', status: 'ACTIVE', tld: 'example', expireDate: '2027-01-15 10:00:00', securityLock: 1, whoisPrivacy: 1, autoRenew: 0 },
        { domain: 'news.example', status: 'ACTIVE', tld: 'example', expireDate: '2026-12-01 23:59:59', securityLock: '0', whoisPrivacy: '1', autoRenew: '1' },
      ]
      if (!big) return json({ status: 'SUCCESS', domains })
      const fill = Array.from({ length: 1000 }, (_, index) => ({ domain: `bulk${index}.example`, expireDate: '2027-06-01 00:00:00', securityLock: 1, autoRenew: 1 }))
      return json({ status: 'SUCCESS', domains: body.start === '0' ? fill : domains })
    }
    return json({ status: 'ERROR', message: 'Not found' }, 404)
  })
}

const namecheapXml = (domains: string, total: number, page: number) => `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <Errors />
  <RequestedCommand>namecheap.domains.getList</RequestedCommand>
  <CommandResponse Type="namecheap.domains.getList">
    <DomainGetListResult>
      ${domains}
    </DomainGetListResult>
    <Paging><TotalItems>${total}</TotalItems><CurrentPage>${page}</CurrentPage><PageSize>100</PageSize></Paging>
  </CommandResponse>
</ApiResponse>`

export const namecheapError = (message: string) => `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
  <Errors><Error Number="1011150">${message}</Error></Errors>
</ApiResponse>`

/** Namecheap: XML over GET, credentials in the query; two pages of one domain each. */
export function fakeNamecheap() {
  return vi.fn(async (url: string) => {
    const params = new URL(url).searchParams
    if (params.get('ApiKey') !== NAMECHEAP_KEYS.apiKey) return new Response(namecheapError('API Key is invalid or API access has not been enabled'))
    if (params.get('ClientIp') !== NAMECHEAP_KEYS.clientIp) return new Response(namecheapError('Invalid request IP: 198.51.100.1'))
    const page = Number(params.get('Page'))
    const domain = page === 1
      ? '<Domain ID="127" Name="shop.example" User="indiedev" Created="02/15/2020" Expires="02/15/2027" IsExpired="false" IsLocked="true" AutoRenew="false" WhoisGuard="ENABLED" IsPremium="false" IsOurDNS="true"/>'
      : '<Domain ID="128" Name="blog.example" User="indiedev" Created="04/01/2021" Expires="04/01/2026" IsExpired="false" IsLocked="false" AutoRenew="true" WhoisGuard="NOTPRESENT" IsPremium="false" IsOurDNS="false"/>'
    return new Response(namecheapXml(domain, 2, page))
  })
}

/** Spaceship: GET with key headers; pages with take/skip. */
export function fakeSpaceship({ scope = true } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>
    if (headers['X-Api-Key'] !== SPACESHIP_KEYS.apiKey || headers['X-Api-Secret'] !== SPACESHIP_KEYS.apiSecret) return json({ detail: 'Unauthorized' }, 401)
    if (!scope) return json({ detail: 'Forbidden' }, 403)
    const skip = Number(new URL(url).searchParams.get('skip'))
    const items = [
      { name: 'shop.example', autoRenew: true, expirationDate: '2027-02-01T00:00:00.000Z', eppStatuses: ['clientTransferProhibited'], nameservers: { provider: 'custom', hosts: ['NS1.HOST.example', 'ns2.host.example'] } },
      { name: 'app.example', autoRenew: false, expirationDate: '2026-11-20T00:00:00.000Z', eppStatuses: [], nameservers: { provider: 'basic', hosts: [] } },
    ]
    return json({ items: skip === 0 ? items : [], total: 2 })
  })
}
