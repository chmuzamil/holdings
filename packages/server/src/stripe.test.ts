import { describe, expect, it } from 'vitest'
import { checkStripeKey, fetchStripeRevenue, keyHint, monthlyAmount } from './stripe'
import { fakeStripe, price, TEST_KEY } from './stripe-fake'

describe('checkStripeKey', () => {
  it('only accepts restricted keys', () => {
    expect(checkStripeKey(TEST_KEY)).toBe('')
    expect(checkStripeKey('rk_live_abcdefghij')).toBe('')
    expect(checkStripeKey('sk_live_abcdefghij')).toMatch(/secret key/)
    expect(checkStripeKey('pk_test_abcdefghij')).toMatch(/publishable/)
    expect(checkStripeKey('hello')).toMatch(/rk_live_/)
  })

  it('describes a key without revealing it', () => {
    expect(keyHint(TEST_KEY)).toBe('test key ending 0001')
  })
})

describe('monthlyAmount', () => {
  it('turns any billing period into a monthly amount', () => {
    expect(monthlyAmount({ quantity: 2, price: price('p', 1000) })).toEqual({ currency: 'USD', amount: 2000 })
    expect(monthlyAmount({ price: price('p', 12000, 'year') })?.amount).toBe(1000)
    expect(monthlyAmount({ price: price('p', 1000, 'week') })?.amount).toBeCloseTo(4333.33, 1)
    expect(monthlyAmount({ price: price('p', 3000, 'month', { interval_count: 3 }) })?.amount).toBe(1000)
  })

  it('skips prices whose amount depends on usage or tiers', () => {
    expect(monthlyAmount({ price: price('p', 5, 'month', { usage_type: 'metered' }) })).toBeNull()
    expect(monthlyAmount({ price: price('p', null) })).toBeNull()
    expect(monthlyAmount({ price: { product: 'p', unit_amount: 500, currency: 'usd' } })).toBeNull()
  })
})

describe('fetchStripeRevenue', () => {
  it('adds up monthly revenue per product across every page', async () => {
    const stripe = fakeStripe()
    const revenue = await fetchStripeRevenue(TEST_KEY, stripe, Date.UTC(2026, 9, 24))
    expect(revenue.mode).toBe('test')
    expect(revenue.skippedItems).toBe(2)
    const app = revenue.products.find((product) => product.id === 'prod_app')
    // 12 + 3 × 12 + 120 / 12 = 58 dollars a month, from 3 subscriptions.
    expect(app).toEqual({ id: 'prod_app', name: 'Shopfront Pro', active: true, monthly: { USD: 5800 }, subscriptions: 3 })
    expect(revenue.products.find((product) => product.id === 'prod_eu')?.monthly).toEqual({ EUR: 900 })
    expect(revenue.products.find((product) => product.id === 'prod_old')).toMatchObject({ active: false, subscriptions: 0 })
    expect(stripe.mock.calls.every(([url]) => String(url).startsWith('https://api.stripe.com/v1/'))).toBe(true)
    expect(stripe.mock.calls.some(([url]) => String(url).includes('starting_after=sub_2'))).toBe(true)
  })

  it('explains a rejected key or missing permissions', async () => {
    await expect(fetchStripeRevenue('rk_test_OTHER00000', fakeStripe())).rejects.toThrow(/didn’t accept/)
    await expect(fetchStripeRevenue(TEST_KEY, fakeStripe({ status: 403 }))).rejects.toThrow(/read access/)
  })

  it('explains when Stripe can’t be reached', async () => {
    await expect(fetchStripeRevenue(TEST_KEY, async () => { throw new TypeError('offline') })).rejects.toThrow(/reach Stripe/)
  })
})
