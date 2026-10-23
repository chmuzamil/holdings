import { describe, expect, it } from 'vitest'
import { findSecret, findSecretsInRecord } from './secrets'

// Test values are built at runtime so the source never contains a string
// that secret scanners would flag.
const repeat = (chars, length) => chars.repeat(Math.ceil(length / chars.length)).slice(0, length)
const mixed = (length) => repeat('aB3dE5gH7jK9mN1pQ', length)

describe('findSecret', () => {
  it.each([
    ['GitHub token', `ghp_${mixed(36)}`],
    ['GitHub token', `github_pat_${mixed(60)}`],
    ['Stripe key', `sk_${'live'}_${mixed(24)}`],
    ['AWS access key', `AKIA${repeat('ABCDEFGHIJ234567', 16)}`],
    ['Slack token', `xoxb-${repeat('1234567890-', 24)}`],
    ['private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc'],
    ['card number', 'card 4242 4242 4242 4242 exp 12/28'],
    ['key or token', `token=${mixed(40)}`],
  ])('spots a %s', (kind, text) => {
    expect(findSecret(text)).toBe(kind)
  })

  it.each([
    '',
    'Main VPS in Germany, backups nightly',
    'Visa ending 4242',
    'Order 12345678',
    'https://dashboard.stripe.com/test/apikeys',
    'renews 2027-01-15',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '1234 5678 9012 3456',
  ])('leaves ordinary text alone: %j', (text) => {
    expect(findSecret(text)).toBe('')
  })
})

describe('findSecretsInRecord', () => {
  it('checks every text field and names the ones with secrets', () => {
    const record = { name: 'Stripe live key', notes: `pasted sk_${'live'}_${mixed(24)} by mistake`, cost: 0 }
    expect(findSecretsInRecord(record)).toEqual([{ field: 'notes', kind: 'Stripe key' }])
  })
})
