import { describe, expect, it } from 'vitest'
import { cleanDomain, createRateLimiter, summarizeRdap, validateDomain } from './domain-lookup.mjs'

describe('cleanDomain', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['https://www.example.com/path?q=1', 'example.com'],
    ['http://example.com:8080', 'example.com'],
    ['  example.com.  ', 'example.com'],
    ['shop.example.co.uk#top', 'shop.example.co.uk'],
    [undefined, ''],
  ])('%s -> %s', (input, expected) => {
    expect(cleanDomain(input)).toBe(expected)
  })
})

describe('validateDomain', () => {
  it.each(['example.com', 'sub.example.co.uk', 'xn--bcher-kva.example.org', 'a-b.io'])('accepts %s', (domain) => {
    expect(validateDomain(domain)).toBe('')
  })

  it.each([
    ['', 'Enter a domain name.'],
    ['localhost', 'Enter a full domain name, like example.com.'],
    ['printer.local', 'Private network names cannot be looked up.'],
    ['db.internal', 'Private network names cannot be looked up.'],
    ['1.0.0.127.in-addr.arpa', 'Private network names cannot be looked up.'],
    ['-bad.com', 'That is not a valid domain name.'],
    ['bad-.com', 'That is not a valid domain name.'],
    ['a..com', 'That is not a valid domain name.'],
    ['under_score.com', 'That is not a valid domain name.'],
    ['example.c0m', 'That is not a valid domain name.'],
    [`${'a'.repeat(64)}.com`, 'That is not a valid domain name.'],
    [`${'a.'.repeat(127)}com`, 'That domain name is too long.'],
  ])('rejects %s', (domain, message) => {
    expect(validateDomain(domain)).toBe(message)
  })
})

describe('createRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let time = 0
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time })
    expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false])
    expect(allow('b')).toBe(true)
    time = 1000
    expect(allow('a')).toBe(true)
  })
})

describe('summarizeRdap', () => {
  const rdap = {
    status: ['client transfer prohibited', 'active'],
    secureDNS: { delegationSigned: true },
    events: [
      { eventAction: 'registration', eventDate: '2020-01-02T00:00:00Z' },
      { eventAction: 'expiration', eventDate: '2027-01-02T00:00:00Z' },
    ],
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }],
    nameservers: [{ ldhName: 'ns1.dns.example' }, { ldhName: 'ns2.dns.example' }],
  }

  it('keeps what the safety checks need', () => {
    expect(summarizeRdap(rdap)).toEqual({
      registrar: 'Example Registrar',
      created: '2020-01-02T00:00:00Z',
      updated: '',
      expires: '2027-01-02T00:00:00Z',
      status: ['client transfer prohibited', 'active'],
      nameservers: ['ns1.dns.example', 'ns2.dns.example'],
      dnssec: true,
    })
  })

  it('reports DNSSEC as unknown when the registry doesn’t say', () => {
    expect(summarizeRdap({ ...rdap, secureDNS: undefined }).dnssec).toBeNull()
    expect(summarizeRdap({ ...rdap, secureDNS: { delegationSigned: false } }).dnssec).toBe(false)
  })
})
