import { describe, expect, it } from 'vitest'
import { cleanHostCredentials, fetchHost, HOSTS, parseCustomServers } from './hosts'
import { CUSTOM_TOKEN, CUSTOM_URL, DO_TOKEN, fakeCustom, fakeDigitalOcean, fakeHetzner, HETZNER_TOKEN } from './hosts-fake'

const NOW = Date.UTC(2026, 9, 30)
const custom = { url: CUSTOM_URL, token: CUSTOM_TOKEN }

describe('credential checks', () => {
  it('checks tokens and custom URLs', () => {
    expect(HOSTS.hetzner.check({ token: HETZNER_TOKEN })).toBe('')
    expect(HOSTS.hetzner.check({ token: 'short' })).toMatch(/Hetzner Cloud API token/)
    expect(HOSTS.digitalocean.check({ token: DO_TOKEN })).toBe('')
    expect(HOSTS.custom.check(custom)).toBe('')
    expect(HOSTS.custom.check({ url: CUSTOM_URL, token: '' })).toBe('')
    expect(HOSTS.custom.check({ url: 'inventory.example', token: '' })).toMatch(/full URL/)
    expect(HOSTS.custom.check({ url: 'ftp://inventory.example/x', token: '' })).toMatch(/https:\/\//)
    expect(HOSTS.custom.check({ url: 'https://me:pw@inventory.example/x', token: '' })).toMatch(/token field/)
    expect(HOSTS.custom.hint(custom)).toBe('URL on inventory.example')
    expect(cleanHostCredentials('custom', { url: ` ${CUSTOM_URL} `, other: 'x' })).toEqual({ url: CUSTOM_URL, token: '' })
  })
})

describe('Hetzner', () => {
  it('reads every page, with specs, location and the price for that location', async () => {
    const result = await fetchHost('hetzner', { token: HETZNER_TOKEN }, fakeHetzner(), NOW)
    expect(result).toMatchObject({ host: 'Hetzner', warnings: [] })
    expect(result.servers[0]).toEqual({
      name: 'web-1', provider: 'Hetzner', ip: '203.0.113.10', ipv6: '2001:db8:1::/64', cpu: 2, ramGb: 4, storage: '40 GB',
      location: 'Falkenstein, DE', plan: 'CX22', os: 'Ubuntu 24.04', status: 'running', monthlyCost: 4.51, currency: 'EUR',
      notes: 'Hetzner Cloud price before VAT.',
    })
    expect(result.servers[1]).toMatchObject({ name: 'worker', ip: '', monthlyCost: 3.99, location: 'Helsinki, DE' })
  })

  it('explains bad tokens', async () => {
    await expect(HOSTS.hetzner.verify({ token: 'x'.repeat(64) }, fakeHetzner())).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/didn’t accept/) })
    await expect(HOSTS.hetzner.verify({ token: HETZNER_TOKEN }, fakeHetzner({ readable: false }))).rejects.toThrow(/can’t read servers/)
  })
})

describe('DigitalOcean', () => {
  it('reads droplets with the public IP, size and price', async () => {
    const fetchImpl = fakeDigitalOcean()
    const result = await fetchHost('digitalocean', { token: DO_TOKEN }, fetchImpl, NOW)
    expect(result.servers).toEqual([{
      name: 'app-droplet', provider: 'DigitalOcean', ip: '198.51.100.20', ipv6: '', cpu: 1, ramGb: 2, storage: '50 GB',
      location: 'Frankfurt 1', plan: 's-1vcpu-2gb', os: 'Ubuntu 24.04 (LTS) x64', status: 'active', monthlyCost: 12, currency: 'USD', notes: '',
    }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('says which scope is missing', async () => {
    await expect(HOSTS.digitalocean.verify({ token: DO_TOKEN }, fakeDigitalOcean({ scope: false }))).rejects.toThrow(/droplet:read/)
  })
})

describe('Custom URL', () => {
  it('reads the documented format, skipping servers without a name', async () => {
    const result = await fetchHost('custom', custom, fakeCustom(), NOW)
    expect(result.host).toBe('Custom URL')
    expect(result.servers.map((server) => [server.name, server.provider, server.ip, server.monthlyCost, server.currency])).toEqual([
      ['vultr-box', 'Vultr', '192.0.2.40', 6, 'USD'],
      ['ovh-dedi', 'OVH', '192.0.2.50', 39.99, 'EUR'],
    ])
    expect(parseCustomServers([{ name: 'bare' }])[0]).toMatchObject({ name: 'bare', currency: 'USD', monthlyCost: null })
  })

  it('explains answers it can’t use', async () => {
    await expect(HOSTS.custom.verify({ url: CUSTOM_URL, token: '' }, fakeCustom())).rejects.toThrow(/check the token/)
    await expect(HOSTS.custom.verify(custom, fakeCustom({ raw: '<html>' }))).rejects.toThrow(/JSON/)
    await expect(HOSTS.custom.verify(custom, fakeCustom({ body: { hosts: [] } }))).rejects.toThrow(/"servers"/)
    await expect(HOSTS.custom.verify(custom, fakeCustom({ raw: `"${'x'.repeat(1_000_001)}"` }))).rejects.toThrow(/1 MB/)
  })
})
