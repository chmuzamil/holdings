import { vi } from 'vitest'

// A fake Stripe API for tests.

export const TEST_KEY = 'rk_test_FAKE000001'

export const price = (product: string, unit: number | null, interval = 'month', extra: Record<string, unknown> = {}) => ({
  product,
  unit_amount: unit,
  currency: 'usd',
  recurring: { interval, interval_count: 1, usage_type: 'licensed', ...extra },
})

export const SUBSCRIPTIONS = [
  { id: 'sub_1', items: { data: [{ quantity: 1, price: price('prod_app', 1200) }] } },
  { id: 'sub_2', items: { data: [{ quantity: 3, price: price('prod_app', 1200) }] } },
  { id: 'sub_3', items: { data: [{ quantity: 1, price: price('prod_app', 12000, 'year') }] } },
  { id: 'sub_4', items: { data: [{ quantity: 1, price: { ...price('prod_eu', 900), currency: 'eur' } }, { quantity: 1, price: price('prod_api', null) }] } },
  { id: 'sub_5', items: { data: [{ quantity: 1, price: price('prod_api', 5, 'month', { usage_type: 'metered' }) }] } },
]

export const PRODUCTS = [
  { id: 'prod_app', name: 'Shopfront Pro', active: true },
  { id: 'prod_eu', name: 'Shopfront EU', active: true },
  { id: 'prod_old', name: 'Old plan', active: false },
]

/** A fake Stripe API that pages its lists two items at a time. */
export function fakeStripe({ status = 200 } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${TEST_KEY}`) {
      return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 })
    }
    if (status !== 200) return new Response(JSON.stringify({ error: { message: 'nope' } }), { status })
    const { pathname, searchParams } = new URL(url)
    const all: { id: string }[] = pathname.endsWith('/subscriptions') ? SUBSCRIPTIONS : PRODUCTS
    const after = searchParams.get('starting_after')
    const start = after ? all.findIndex((item) => item.id === after) + 1 : 0
    const data = all.slice(start, start + 2)
    return new Response(JSON.stringify({ data, has_more: start + 2 < all.length }), { status: 200 })
  })
}
