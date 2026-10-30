import { describe, expect, it } from 'vitest'
import { checkCloudflareToken, fetchCloudflare, tokenHint, verifyToken } from './cloudflare'
import { CF_TOKEN, fakeCloudflare } from './cloudflare-fake'

describe('checkCloudflareToken', () => {
  it('accepts API tokens and refuses the Global API Key', () => {
    expect(checkCloudflareToken(CF_TOKEN)).toBe('')
    expect(checkCloudflareToken('0123456789abcdef0123456789abcdef01234')).toMatch(/Global API Key/)
    expect(checkCloudflareToken('short')).toMatch(/Paste a Cloudflare API token/)
    expect(tokenHint(CF_TOKEN)).toBe(`token ending ${CF_TOKEN.slice(-4)}`)
  })
})

describe('fetchCloudflare', () => {
  it('reads every zone across pages, with registrar details and DNS records', async () => {
    const result = await fetchCloudflare(CF_TOKEN, fakeCloudflare(), Date.UTC(2026, 9, 30))
    expect(result.warnings).toEqual([])
    expect(result.domains.map((domain) => domain.name)).toEqual(['shop.example', 'news.example', 'old.example'])
    expect(result.domains[0]).toMatchObject({
      registrar: 'Cloudflare',
      expiresAt: '2027-03-14',
      autoRenew: true,
      locked: true,
      plan: 'Free Website',
      nameservers: ['ana.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    })
    // Only A, AAAA and CNAME records are kept.
    expect(result.domains[0]?.records.map((record) => `${record.type} ${record.name}`)).toEqual(['A shop.example', 'A staging.shop.example', 'CNAME www.shop.example'])
    expect(result.domains[1]).toMatchObject({ registrar: 'Porkbun', expiresAt: null, locked: null })
  })

  it('still imports zones when the token cannot read registrar or DNS, and says what to add', async () => {
    const result = await fetchCloudflare(CF_TOKEN, fakeCloudflare({ registrar: false, dns: false }))
    expect(result.domains).toHaveLength(3)
    expect(result.domains[0]).toMatchObject({ expiresAt: null, records: [] })
    expect(result.warnings).toEqual([
      'Expiry dates and transfer locks need Account → Registrar: Read on the token (only for domains registered at Cloudflare).',
      'Subdomains need Zone → DNS: Read on the token.',
    ])
  })

  it('explains a rejected token or Cloudflare being unreachable', async () => {
    await expect(fetchCloudflare('x'.repeat(40), fakeCloudflare())).rejects.toThrow(/didn’t accept this token/)
    await expect(verifyToken('x'.repeat(40), fakeCloudflare())).rejects.toThrow(/didn’t accept/)
    await expect(fetchCloudflare(CF_TOKEN, async () => { throw new TypeError('offline') })).rejects.toThrow(/reach Cloudflare/)
  })

  it('only ever reads (GET) from the Cloudflare API', async () => {
    const fetch = fakeCloudflare()
    await fetchCloudflare(CF_TOKEN, fetch)
    expect(fetch.mock.calls.every(([url, init]) => String(url).startsWith('https://api.cloudflare.com/client/v4/') && !init?.method)).toBe(true)
  })
})
