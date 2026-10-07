import { describe, expect, it } from 'vitest'
import { cleanDomain, createRateLimiter, validateDomain } from './domain-lookup.mjs'

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
