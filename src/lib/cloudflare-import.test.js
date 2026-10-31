import { describe, expect, it } from 'vitest'
import { dnsDetails, previewCloudflare } from './cloudflare-import'
import { applyDomainImport } from './domain-import'

const cloudflare = {
  checkedAt: '2026-10-30T10:00:00.000Z',
  warnings: [],
  domains: [
    {
      name: 'shop.example', status: 'active', plan: 'Free Website', nameservers: ['ana.ns.cloudflare.com'], registrar: 'Cloudflare',
      expiresAt: '2027-03-14', autoRenew: false, locked: true,
      records: [
        { type: 'A', name: 'shop.example', content: '203.0.113.10', proxied: true },
        { type: 'A', name: 'staging.shop.example', content: '203.0.113.20', proxied: false },
        { type: 'CNAME', name: 'www.shop.example', content: 'shop.example', proxied: true },
        { type: 'A', name: 'other.example', content: '203.0.113.30', proxied: false },
      ],
    },
    { name: 'news.example', status: 'active', plan: 'Pro Website', nameservers: [], registrar: 'Porkbun', expiresAt: null, autoRenew: null, locked: null, records: [
      { type: 'A', name: 'mail.news.example', content: '198.51.100.5', proxied: false },
    ] },
    { name: 'same.example', status: 'active', plan: '', nameservers: [], registrar: null, expiresAt: null, autoRenew: null, locked: null, records: [] },
  ],
}

const records = {
  servers: [{ id: 'srv_main', name: 'Main VPS', ipAddress: '203.0.113.10' }, { id: 'srv_staging', name: 'Staging', ipAddress: '203.0.113.20' }],
  domains: [
    { id: 'd_news', name: 'news.example', provider: 'Namecheap', renewalDate: '', subdomains: [{ id: 's1', name: 'blog' }] },
    { id: 'd_same', name: 'same.example', provider: 'Porkbun', renewalDate: '2027-01-01' },
  ],
}

describe('dnsDetails', () => {
  it('turns records into subdomains, linked to servers by IP', () => {
    expect(dnsDetails(cloudflare.domains[0], records.servers)).toEqual({
      serverIds: ['srv_main'],
      subdomains: [
        { id: 'sub-cf-shop.example-staging', name: 'staging', serverId: 'srv_staging', notes: 'A 203.0.113.20 (Cloudflare)' },
        { id: 'sub-cf-shop.example-www', name: 'www', serverId: '', notes: 'Points to shop.example (Cloudflare)' },
      ],
    })
  })
})

describe('previewCloudflare', () => {
  const rows = previewCloudflare(cloudflare, records)

  it('adds new domains with what Cloudflare knows, leaving cost to the owner', () => {
    expect(rows[0]).toMatchObject({ name: 'shop.example', status: 'add' })
    expect(rows[0].record).toMatchObject({
      provider: 'Cloudflare', cost: 0, renewalDate: '2027-03-14', expiryDate: '2027-03-14', connectedServerIds: ['srv_main'],
      notes: 'DNS on Cloudflare (Free Website).', autoRenew: 'off',
    })
    expect(rows[0].changes).toEqual(['registrar Cloudflare', 'expires 2027-03-14', '2 subdomains', 'linked to a server', 'auto-renew is OFF'])
  })

  it('only fills in what is missing on existing domains, and never overwrites', () => {
    expect(rows[1]).toMatchObject({ status: 'update', id: 'd_news', changes: ['1 new subdomain'] })
    expect(rows[1].patch).not.toHaveProperty('provider')
    expect(rows[1].patch.subdomains.map((sub) => sub.name)).toEqual(['blog', 'mail'])
    expect(rows[2]).toMatchObject({ status: 'same', changes: [] })
  })

  it('leaves out anything that looks like a secret', () => {
    const card = ['4242', '4242', '4242', '4242'].join(' ')
    const risky = { ...cloudflare, domains: [{ ...cloudflare.domains[2], name: 'risky.example', plan: card }] }
    expect(previewCloudflare(risky, records)[0]).toMatchObject({ status: 'invalid' })
  })
})

describe('applyDomainImport', () => {
  it('adds new domains and fills in existing ones, leaving the rest alone', () => {
    const rows = previewCloudflare(cloudflare, records)
    const domains = applyDomainImport(records.domains, rows, new Date('2026-10-30T10:00:00Z'))
    expect(domains.map((domain) => domain.name)).toEqual(['shop.example', 'news.example', 'same.example'])
    expect(domains[0].id).toMatch(/^domains-/)
    expect(domains[1]).toMatchObject({ provider: 'Namecheap', editedAt: '2026-10-30T10:00:00.000Z' })
    expect(domains[2]).toBe(records.domains[1])
  })

  it('applies only the rows that were chosen', () => {
    const rows = previewCloudflare(cloudflare, records).filter((row) => row.name === 'news.example')
    expect(applyDomainImport(records.domains, rows).map((domain) => domain.name)).toEqual(['news.example', 'same.example'])
  })
})
