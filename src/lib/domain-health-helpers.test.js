import { describe, expect, it } from 'vitest'
import { deriveDomainHealth } from './domain-health-helpers'

const lookup = (dns, whois = {}) => ({ checkedAt: '2026-10-07T10:00:00.000Z', dns, whois })

describe('deriveDomainHealth', () => {
  it('is unknown when the domain was never checked', () => {
    const health = deriveDomainHealth({ name: 'shopfront.example', health: { dns: 'healthy' } })
    expect(health).toMatchObject({ dns: 'unknown', nameservers: 'unknown', email: 'unknown', lastChecked: '' })
  })

  it('reports a fully set-up domain as healthy', () => {
    const health = deriveDomainHealth({
      name: 'shopfront.example',
      lookup: lookup({
        a: { value: ['203.0.113.10'] },
        ns: { value: ['ns1.dns.example', 'ns2.dns.example'] },
        mx: { value: [{ exchange: 'mail.shopfront.example', priority: 10 }] },
        txt: { value: [['v=spf1 include:mail.example ', '-all']] },
      }),
    })
    expect(health).toMatchObject({
      dns: 'healthy',
      nameservers: 'healthy',
      email: 'healthy',
      aRecord: '203.0.113.10',
      mxRecords: ['mail.shopfront.example'],
      hasSpf: true,
      lastChecked: '2026-10-07',
    })
  })

  it('flags mail without SPF and a single nameserver', () => {
    const health = deriveDomainHealth({
      name: 'x.example',
      lookup: lookup({ a: { value: ['203.0.113.1'] }, ns: { value: ['ns1.example'] }, mx: { value: [{ exchange: 'mx.example' }] } }),
    })
    expect(health.email).toBe('warning')
    expect(health.nameservers).toBe('warning')
  })

  it('treats a domain with no MX as not set up for email, not broken', () => {
    const health = deriveDomainHealth({ name: 'x.example', lookup: lookup({ a: { value: ['203.0.113.1'] } }) })
    expect(health.email).toBe('none')
  })

  it('falls back to registry nameservers and reports a domain that does not resolve', () => {
    const health = deriveDomainHealth({
      name: 'parked.example',
      lookup: lookup({ a: { error: 'ENODATA', value: [] } }, { nameservers: ['NS1.DNS.EXAMPLE', 'NS2.DNS.EXAMPLE'] }),
    })
    expect(health.dns).toBe('missing')
    expect(health.nameserverList).toEqual(['ns1.dns.example', 'ns2.dns.example'])
    expect(health.nameservers).toBe('healthy')
  })
})
