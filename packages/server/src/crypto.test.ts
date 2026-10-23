import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPassword, hashToken, newToken, sameString, seal, unseal, verifyPassword } from './crypto'
import { base32Decode, base32Encode, otpauthUri, totpCode, verifyTotp } from './totp'

describe('passwords', () => {
  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('a long passphrase here')
    expect(stored.startsWith('scrypt$65536$8$1$')).toBe(true)
    expect(await verifyPassword('a long passphrase here', stored)).toBe(true)
    expect(await verifyPassword('a long passphrase herE', stored)).toBe(false)
    expect(await verifyPassword('anything', 'garbage')).toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashPassword('same password!')).not.toBe(await hashPassword('same password!'))
  })
})

describe('tokens and sealing', () => {
  it('makes unguessable tokens and stores only their hash', () => {
    const token = newToken()
    expect(token).toHaveLength(43)
    expect(hashToken(token)).not.toContain(token)
  })

  it('seals and unseals, and refuses a tampered or wrongly keyed value', () => {
    const key = randomBytes(32)
    const sealed = seal('JBSWY3DPEHPK3PXP', key)
    expect(unseal(sealed, key)).toBe('JBSWY3DPEHPK3PXP')
    expect(() => unseal(sealed, randomBytes(32))).toThrow()
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => unseal(parts.join('.'), key)).toThrow()
  })

  it('compares strings safely', () => {
    expect(sameString('ABCD-1234', 'ABCD-1234')).toBe(true)
    expect(sameString('ABCD-1234', 'ABCD-1235')).toBe(false)
  })
})

describe('TOTP', () => {
  // RFC 6238 test vector: the ASCII secret "12345678901234567890", SHA-1.
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890'))

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 vector at %i seconds', (seconds, code) => {
    expect(totpCode(rfcSecret, Math.floor(seconds / 30))).toBe(code)
  })

  it('round-trips base32', () => {
    const bytes = randomBytes(20)
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true)
  })

  it('accepts the previous, current and next code, and nothing older', () => {
    const now = 1_800_000_000_000
    const step = Math.floor(now / 30000)
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step), { now })).toBe(step)
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 1), { now })).toBe(step - 1)
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step + 1), { now })).toBe(step + 1)
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 2), { now })).toBeNull()
  })

  it('refuses a code that was already used', () => {
    const now = 1_800_000_000_000
    const step = Math.floor(now / 30000)
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step), { now, lastUsedStep: step })).toBeNull()
  })

  it('ignores junk', () => {
    expect(verifyTotp(rfcSecret, 'abc123')).toBeNull()
    expect(verifyTotp(rfcSecret, '1234567')).toBeNull()
  })

  it('builds an otpauth link for authenticator apps', () => {
    expect(otpauthUri('ABC', 'owner')).toBe('otpauth://totp/Holdings%3Aowner?secret=ABC&issuer=Holdings&algorithm=SHA1&digits=6&period=30')
  })
})
