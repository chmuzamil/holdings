import { describe, expect, it } from 'vitest'
import { cleanCredentials, credentialsHint, fetchRegistrar, parseNamecheap, REGISTRARS } from './registrars'
import { fakeNamecheap, fakePorkbun, fakeSpaceship, namecheapError, NAMECHEAP_KEYS, PORKBUN_KEYS, SPACESHIP_KEYS } from './registrars-fake'

const NOW = Date.UTC(2026, 9, 30)

describe('credential checks', () => {
  it('keeps only the fields a registrar uses and checks their shape', () => {
    expect(cleanCredentials('porkbun', { ...PORKBUN_KEYS, extra: 'x', apiKey: ` ${PORKBUN_KEYS.apiKey} ` })).toEqual(PORKBUN_KEYS)
    expect(REGISTRARS.porkbun.check(PORKBUN_KEYS)).toBe('')
    expect(REGISTRARS.porkbun.check({ apiKey: PORKBUN_KEYS.secretKey, secretKey: PORKBUN_KEYS.apiKey })).toMatch(/wrong way round/)
    expect(REGISTRARS.namecheap.check(NAMECHEAP_KEYS)).toBe('')
    expect(REGISTRARS.namecheap.check({ ...NAMECHEAP_KEYS, clientIp: 'my server' })).toMatch(/public IPv4/)
    expect(REGISTRARS.spaceship.check({ apiKey: SPACESHIP_KEYS.apiKey, apiSecret: '' })).toMatch(/both/)
    expect(credentialsHint(SPACESHIP_KEYS)).toBe(`key ending ${SPACESHIP_KEYS.apiKey.slice(-4)}`)
  })
})

describe('Porkbun', () => {
  it('lists domains with expiry, auto-renew and lock, whether flags are numbers or strings', async () => {
    const result = await fetchRegistrar('porkbun', PORKBUN_KEYS, fakePorkbun(), NOW)
    expect(result).toMatchObject({ registrar: 'Porkbun', checkedAt: '2026-10-30T00:00:00.000Z', warnings: [] })
    expect(result.domains).toEqual([
      { name: 'shop.example', expiresAt: '2027-01-15', autoRenew: false, locked: true, nameservers: [] },
      { name: 'news.example', expiresAt: '2026-12-01', autoRenew: true, locked: false, nameservers: [] },
    ])
  })

  it('reads the next page when a page is full', async () => {
    const fetchImpl = fakePorkbun({ big: true })
    const result = await fetchRegistrar('porkbun', PORKBUN_KEYS, fetchImpl, NOW)
    expect(result.domains).toHaveLength(1002)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('passes on what Porkbun says about bad keys', async () => {
    await expect(REGISTRARS.porkbun.verify({ ...PORKBUN_KEYS, secretKey: 'sk1_wrongwrongwrongwrong' }, fakePorkbun())).rejects.toMatchObject({ status: 400, message: 'Porkbun says: Invalid API key. (002)' })
  })
})

describe('Namecheap', () => {
  it('reads every page of the XML list', async () => {
    const result = await fetchRegistrar('namecheap', NAMECHEAP_KEYS, fakeNamecheap(), NOW)
    expect(result.domains).toEqual([
      { name: 'shop.example', expiresAt: '2027-02-15', autoRenew: false, locked: true, nameservers: [] },
      { name: 'blog.example', expiresAt: '2026-04-01', autoRenew: true, locked: false, nameservers: [] },
    ])
  })

  it('turns Namecheap errors, like an IP that isn’t whitelisted, into a message', async () => {
    await expect(REGISTRARS.namecheap.verify({ ...NAMECHEAP_KEYS, clientIp: '198.51.100.1' }, fakeNamecheap())).rejects.toMatchObject({ status: 400, message: 'Namecheap says: Invalid request IP: 198.51.100.1' })
    expect(() => parseNamecheap(namecheapError('Parameter &quot;ApiKey&quot; is missing'))).toThrow('Namecheap says: Parameter "ApiKey" is missing')
  })
})

describe('Spaceship', () => {
  it('lists domains with nameservers and the transfer lock from EPP statuses', async () => {
    const result = await fetchRegistrar('spaceship', SPACESHIP_KEYS, fakeSpaceship(), NOW)
    expect(result.domains).toEqual([
      { name: 'shop.example', expiresAt: '2027-02-01', autoRenew: true, locked: true, nameservers: ['ns1.host.example', 'ns2.host.example'] },
      { name: 'app.example', expiresAt: '2026-11-20', autoRenew: false, locked: false, nameservers: [] },
    ])
  })

  it('says which scope is missing', async () => {
    await expect(REGISTRARS.spaceship.verify(SPACESHIP_KEYS, fakeSpaceship({ scope: false }))).rejects.toThrow(/domains:read/)
    await expect(REGISTRARS.spaceship.verify({ ...SPACESHIP_KEYS, apiSecret: 'nope' }, fakeSpaceship())).rejects.toThrow(/didn’t accept/)
  })
})
