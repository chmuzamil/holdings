import { vi } from 'vitest'

// Fake revenue APIs for tests. Keys are built at runtime so the source never
// holds a key-shaped string.

export const LEMON_KEY = 'eyJ0eXAiOiJKV1Qi.'.concat('LsQ4wE8rT2'.repeat(6))
export const PADDLE_KEY = 'pdl_live_apikey_'.concat('01hx7k9m2q'.repeat(4))
export const PADDLE_SANDBOX_KEY = 'pdl_sdbx_apikey_'.concat('01hx7k9m2q'.repeat(4))
export const REVENUE_URL = 'https://numbers.example/revenue.json'
export const REVENUE_TOKEN = 'rev-'.concat('s3cr3t'.repeat(3))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Lemon Squeezy: one EUR store, two products, three active subscriptions on two pages. */
export function fakeLemonSqueezy() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${LEMON_KEY}`) return json({ errors: [{ detail: 'Unauthenticated.' }] }, 401)
    const { pathname, searchParams } = new URL(url)
    const page = Number(searchParams.get('page[number]') ?? 1)
    const meta = (lastPage: number) => ({ page: { currentPage: page, lastPage } })
    if (pathname.endsWith('/stores')) return json({ data: [{ id: '7', attributes: { name: 'Shop', currency: 'EUR' } }], meta: meta(1) })
    if (pathname.endsWith('/products')) {
      return json({ data: [{ id: '11', attributes: { name: 'Course', status: 'published' } }, { id: '12', attributes: { name: 'Templates', status: 'published' } }], meta: meta(1) })
    }
    if (pathname.endsWith('/subscriptions')) {
      const sub = (id: string, productId: number, priceId: number, quantity = 1) => ({
        id, attributes: { store_id: 7, product_id: productId, product_name: productId === 11 ? 'Course' : 'Templates', status: 'active', test_mode: false, first_subscription_item: { price_id: priceId, quantity } },
      })
      const data = page === 1 ? [sub('1', 11, 101), sub('2', 11, 102, 2)] : [sub('3', 12, 103)]
      return json({ data, meta: meta(2) })
    }
    const prices: Record<string, unknown> = {
      101: { unit_price: 1000, scheme: 'standard', renewal_interval_unit: 'month', renewal_interval_quantity: 1 },
      102: { unit_price: 12000, scheme: 'standard', renewal_interval_unit: 'year', renewal_interval_quantity: 1 },
      103: { unit_price: null, scheme: 'graduated', renewal_interval_unit: 'month', renewal_interval_quantity: 1 },
    }
    const priceId = pathname.split('/prices/')[1] ?? ''
    if (prices[priceId]) return json({ data: { id: priceId, attributes: prices[priceId] } })
    return json({ errors: [{ detail: 'Not found' }] }, 404)
  })
}

/** Paddle Billing: subscriptions paged by the "next" link; products need product.read. */
export function fakePaddle({ productRead = true, subscriptionRead = true } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization
    if (auth !== `Bearer ${PADDLE_KEY}` && auth !== `Bearer ${PADDLE_SANDBOX_KEY}`) return json({ error: { detail: 'Authentication header included, but incorrectly formatted' } }, 401)
    const { origin, pathname, searchParams } = new URL(url)
    if (pathname === '/products') {
      if (!productRead) return json({ error: { detail: 'forbidden' } }, 403)
      return json({ data: [{ id: 'pro_app', name: 'App' }, { id: 'pro_free', name: 'Free tier' }], meta: { pagination: { has_more: false } } })
    }
    if (pathname === '/subscriptions') {
      if (!subscriptionRead) return json({ error: { detail: 'forbidden' } }, 403)
      const item = (amount: string, interval: string, quantity = 1, currency = 'USD') => ({
        status: 'active', quantity, recurring: true,
        price: { id: 'pri_x', product_id: 'pro_app', billing_cycle: { interval, frequency: 1 }, unit_price: { amount, currency_code: currency } },
        product: { id: 'pro_app', name: 'App' },
      })
      if (!searchParams.get('after')) {
        return json({ data: [{ id: 'sub_1', status: 'active', currency_code: 'USD', items: [item('900', 'month'), item('500', 'month', 1)] }], meta: { pagination: { has_more: true, next: `${origin}/subscriptions?status=active&per_page=200&after=sub_1` } } })
      }
      return json({ data: [{ id: 'sub_2', status: 'active', currency_code: 'GBP', items: [item('6000', 'year', 1, 'GBP')] }], meta: { pagination: { has_more: false, next: null } } })
    }
    return json({ error: { detail: 'Not found' } }, 404)
  })
}

/** A custom revenue URL, e.g. a script summarising App Store and Google Play. */
export function fakeRevenueUrl({ body = undefined as unknown, raw = '' } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== REVENUE_URL) return new Response('Not found', { status: 404 })
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${REVENUE_TOKEN}`) return new Response('Unauthorized', { status: 401 })
    if (raw) return new Response(raw)
    return json(body ?? {
      products: [
        { id: 'ios-pro', name: 'Notes Pro (iOS)', monthlyRevenue: 120.5, currency: 'USD', subscriptions: 40 },
        { id: 'android-pro', name: 'Notes Pro (Android)', monthlyRevenue: '80', currency: 'eur' },
        { id: 'jp', monthlyRevenue: 5000, currency: 'JPY' },
        { name: 'no id', monthlyRevenue: 1 },
        { id: 'negative', monthlyRevenue: -5 },
      ],
    })
  })
}
