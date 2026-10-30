import { vi } from 'vitest'

// A fake Cloudflare API for tests.

// Built at runtime so the source never holds a token-shaped string.
export const CF_TOKEN = 'aB3dE5gH7jK9mN1pQ'.repeat(3).slice(0, 40)

const envelope = (result: unknown, page = 1, totalPages = 1) =>
  new Response(JSON.stringify({ success: true, errors: [], result, result_info: { page, total_pages: totalPages } }), { status: 200 })

const zones = [
  { id: 'z1', name: 'shop.example', status: 'active', plan: { name: 'Free Website' }, name_servers: ['Ana.ns.cloudflare.com', 'bob.ns.cloudflare.com'], account: { id: 'acc1' }, original_registrar: null },
  { id: 'z2', name: 'news.example', status: 'active', plan: { name: 'Pro Website' }, name_servers: ['ana.ns.cloudflare.com'], account: { id: 'acc1' }, original_registrar: 'Porkbun' },
  { id: 'z3', name: 'old.example', status: 'pending', plan: { name: 'Free Website' }, name_servers: [], account: { id: 'acc1' }, original_registrar: null },
]

/** A fake Cloudflare API that pages zones two at a time. */
export function fakeCloudflare({ registrar = true, dns = true, token = CF_TOKEN } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'Invalid API Token' }] }), { status: 400 })
    }
    const { pathname, searchParams } = new URL(url)
    const page = Number(searchParams.get('page') ?? 1)
    if (pathname.endsWith('/user/tokens/verify')) return envelope({ id: 't', status: 'active' })
    if (pathname.endsWith('/zones')) return envelope(zones.slice((page - 1) * 2, page * 2), page, 2)
    if (pathname.includes('/registrar/domains')) {
      if (!registrar) return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 })
      return envelope([{ name: 'shop.example', expires_at: '2027-03-14T00:00:00Z', auto_renew: true, locked: true }])
    }
    if (pathname.includes('/dns_records')) {
      if (!dns) return new Response(JSON.stringify({ success: false, errors: [] }), { status: 403 })
      if (pathname.includes('/z1/')) {
        return envelope([
          { type: 'A', name: 'shop.example', content: '203.0.113.10', proxied: true },
          { type: 'A', name: 'staging.shop.example', content: '203.0.113.20', proxied: false },
          { type: 'CNAME', name: 'www.shop.example', content: 'shop.example', proxied: true },
          { type: 'MX', name: 'shop.example', content: 'mx.mail.example', proxied: false },
          { type: 'TXT', name: 'shop.example', content: 'v=spf1 -all', proxied: false },
        ])
      }
      return envelope([])
    }
    return new Response('{}', { status: 404 })
  })
}
