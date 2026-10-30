import { vi } from 'vitest'

// Fake server-host APIs for tests. Tokens are built at runtime so the
// source never holds a token-shaped string.

export const HETZNER_TOKEN = 'Hz7Qa2Lp9Wm4'.repeat(6).slice(0, 64)
export const DO_TOKEN = `dop_v1_${'0a1b2c3d'.repeat(8)}`
export const CUSTOM_URL = 'https://inventory.example/servers.json'
export const CUSTOM_TOKEN = 'inv-'.concat('t0k3n'.repeat(4))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const hetznerServer = (id: number, name: string, ip: string | null, type: string, location: string, city: string) => ({
  id,
  name,
  status: 'running',
  public_net: { ipv4: ip ? { ip } : null, ipv6: { ip: '2001:db8:1::/64' } },
  server_type: {
    name: type, cores: 2, memory: 4.0, disk: 40,
    prices: [
      { location: 'fsn1', price_monthly: { net: '4.5100000000', gross: '5.3669000000' } },
      { location: 'hel1', price_monthly: { net: '3.9900000000', gross: '4.9476000000' } },
    ],
  },
  datacenter: { name: `${location}-dc14`, location: { name: location, city, country: 'DE' } },
  image: { name: 'ubuntu-24.04', description: 'Ubuntu 24.04' },
})

/** Hetzner Cloud: one server per page, two pages. */
export function fakeHetzner({ readable = true } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${HETZNER_TOKEN}`) return json({ error: { code: 'unauthorized', message: 'unable to authenticate' } }, 401)
    if (!readable) return json({ error: { code: 'forbidden', message: 'insufficient permissions' } }, 403)
    const page = Number(new URL(url).searchParams.get('page'))
    const servers = page === 1
      ? [hetznerServer(1, 'web-1', '203.0.113.10', 'cx22', 'fsn1', 'Falkenstein')]
      : [hetznerServer(2, 'worker', null, 'cax11', 'hel1', 'Helsinki')]
    return json({ servers, meta: { pagination: { page, per_page: 1, next_page: page === 1 ? 2 : null, last_page: 2, total_entries: 2 } } })
  })
}

/** DigitalOcean: droplets with scoped-token errors. */
export function fakeDigitalOcean({ scope = true } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${DO_TOKEN}`) return json({ id: 'unauthorized', message: 'Unable to authenticate you' }, 401)
    if (!scope) return json({ id: 'forbidden', message: 'You are not authorized to perform this operation' }, 403)
    const page = Number(new URL(url).searchParams.get('page'))
    const droplets = page === 1 ? [{
      id: 3164444, name: 'app-droplet', memory: 2048, vcpus: 1, disk: 50, status: 'active',
      size_slug: 's-1vcpu-2gb', size: { slug: 's-1vcpu-2gb', price_monthly: 12 },
      region: { slug: 'fra1', name: 'Frankfurt 1' },
      image: { distribution: 'Ubuntu', name: '24.04 (LTS) x64' },
      networks: { v4: [{ ip_address: '10.110.0.2', type: 'private' }, { ip_address: '198.51.100.20', type: 'public' }], v6: [] },
    }] : []
    return json({ droplets, links: page === 1 ? { pages: { next: `${url.split('?')[0]}?page=2` } } : {}, meta: { total: 1 } })
  })
}

/** A custom inventory URL answering in Holdings' format. */
export function fakeCustom({ body = undefined as unknown, raw = '' } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== CUSTOM_URL) return new Response('Not found', { status: 404 })
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${CUSTOM_TOKEN}`) return new Response('Unauthorized', { status: 401 })
    if (raw) return new Response(raw)
    return json(body ?? {
      servers: [
        { name: 'vultr-box', ip: '192.0.2.40', provider: 'Vultr', monthlyCost: 6, currency: 'usd', location: 'Amsterdam', cpu: 1, ramGb: 1, storage: '25 GB SSD', os: 'Debian 12' },
        { name: '', ip: '192.0.2.41' },
        { name: 'ovh-dedi', ipAddress: '192.0.2.50', provider: 'OVH', monthlyCost: '39.99', currency: 'EUR', notes: 'Rescue mode off' },
      ],
    })
  })
}
