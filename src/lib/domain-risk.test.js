import { describe, expect, it } from 'vitest'
import { getDomainRisks } from './domain-risk'

const now = new Date('2026-10-24T12:00:00Z')

function domain({ txt = [], dmarc = ['v=DMARC1; p=reject'], mx = [], ns = ['ns1.dns.example', 'ns2.dns.example'], whois = {} } = {}) {
  return {
    name: 'shop.example',
    provider: 'Porkbun',
    lookup: {
      checkedAt: '2026-10-20T09:00:00.000Z',
      dns: {
        txt: { value: txt.map((record) => [record]) },
        mx: { value: mx.map((exchange) => ({ exchange, priority: 10 })) },
        ns: { value: ns },
        ...(dmarc === null ? {} : { dmarc: { value: dmarc.map((record) => [record]) } }),
      },
      whois: { registrar: 'Example Registrar', status: ['client transfer prohibited'], expires: '2027-06-01T00:00:00Z', dnssec: true, ...whois },
    },
  }
}

const check = (record, key) => getDomainRisks(record, now).checks.find((item) => item.key === key)

describe('getDomainRisks', () => {
  it('passes a well set up domain that doesn’t send mail', () => {
    const risks = getDomainRisks(domain({ txt: ['v=spf1 -all'] }), now)
    expect(risks.problems).toBe(0)
    expect(risks.checks.map((item) => item.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass'])
    expect(risks.checkedAt).toBe('2026-10-20')
  })

  it('says nothing is known before a lookup', () => {
    const risks = getDomainRisks({ name: 'new.example' }, now)
    expect(risks.problems).toBe(0)
    expect(risks.checks.every((item) => item.status === 'unknown')).toBe(true)
  })

  it('flags a missing transfer lock and names the registrar', () => {
    const result = check(domain({ whois: { status: ['active'] } }), 'transfer-lock')
    expect(result.status).toBe('warn')
    expect(result.action).toContain('at Example Registrar.')
    expect(check(domain({ whois: { status: [], registrar: 'NameCheap, Inc.' } }), 'transfer-lock').action).toContain('at NameCheap, Inc. It stops')
  })

  it('treats DNSSEC as a tip, and unknown when the registry is silent', () => {
    expect(check(domain({ whois: { dnssec: false } }), 'dnssec').status).toBe('tip')
    expect(check(domain({ whois: { dnssec: null } }), 'dnssec').status).toBe('unknown')
    expect(getDomainRisks(domain({ txt: ['v=spf1 -all'], whois: { dnssec: false } }), now).problems).toBe(0)
  })

  it('suggests SPF without assuming a domain with no MX never sends mail', () => {
    expect(check(domain(), 'spf').action).toMatch(/If shop\.example never sends mail.*v=spf1 -all.*If it does/)
    expect(check(domain({ mx: ['mail.shop.example'] }), 'spf').action).toContain('who may send')
    expect(check(domain({ txt: ['v=spf1 +all'] }), 'spf').status).toBe('fail')
    expect(check(domain({ txt: ['v=spf1 ?all'] }), 'spf').status).toBe('warn')
    expect(check(domain({ txt: ['v=spf1 -all', 'v=spf1 include:_spf.mail.example ~all'] }), 'spf').detail).toMatch(/more than one/i)
    expect(check(domain({ txt: ['google-site-verification=abc', 'v=spf1 include:_spf.mail.example ~all'] }), 'spf').status).toBe('pass')
  })

  it('wants a DMARC policy that does something', () => {
    expect(check(domain({ dmarc: [] }), 'dmarc')).toMatchObject({
      status: 'warn',
      action: 'Add a TXT record on _dmarc.shop.example: v=DMARC1; p=quarantine (or p=reject if it never sends mail)',
    })
    expect(check(domain({ dmarc: [], mx: ['mx.example'] }), 'dmarc').action).toBe('Add a TXT record on _dmarc.shop.example: v=DMARC1; p=quarantine')
    expect(check(domain({ dmarc: ['v=DMARC1; p=none; rua=mailto:x'] }), 'dmarc').status).toBe('warn')
    expect(check(domain({ dmarc: ['v=DMARC1;p=quarantine'] }), 'dmarc').status).toBe('pass')
    expect(check(domain({ dmarc: null }), 'dmarc').status).toBe('unknown')
  })

  it('warns before the registration ends', () => {
    expect(check(domain({ whois: { expires: '2026-11-10T00:00:00Z' } }), 'registration')).toMatchObject({ status: 'warn', detail: expect.stringContaining('16 days') })
    expect(check(domain({ whois: { expires: '2026-10-01T00:00:00Z' } }), 'registration').status).toBe('fail')
  })

  it('needs two nameservers', () => {
    expect(check(domain({ ns: ['ns1.dns.example'] }), 'nameservers').status).toBe('warn')
    expect(check(domain({ ns: [], whois: { nameservers: [] } }), 'nameservers').status).toBe('fail')
  })

  it('counts warnings and failures as problems', () => {
    expect(getDomainRisks(domain({ whois: { status: [] }, dmarc: [] }), now).problems).toBe(3)
  })
})
