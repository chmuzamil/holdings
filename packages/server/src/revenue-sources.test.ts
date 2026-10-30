import { describe, expect, it } from 'vitest'
import { fetchSourceRevenue, REVENUE_SOURCES } from './revenue-sources'
import { fakeLemonSqueezy, fakePaddle, fakeRevenueUrl, LEMON_KEY, PADDLE_KEY, PADDLE_SANDBOX_KEY, REVENUE_TOKEN, REVENUE_URL } from './revenue-fake'

const NOW = Date.UTC(2026, 9, 30)

describe('credential checks', () => {
  it('checks keys and custom URLs', () => {
    expect(REVENUE_SOURCES.lemonsqueezy.check({ apiKey: LEMON_KEY })).toBe('')
    expect(REVENUE_SOURCES.lemonsqueezy.check({ apiKey: 'short' })).toMatch(/Lemon Squeezy API key/)
    expect(REVENUE_SOURCES.paddle.check({ apiKey: PADDLE_KEY })).toBe('')
    expect(REVENUE_SOURCES.custom.check({ url: REVENUE_URL, token: '' })).toBe('')
    expect(REVENUE_SOURCES.custom.check({ url: 'numbers.example', token: '' })).toMatch(/full URL/)
    expect(REVENUE_SOURCES.custom.hint({ url: REVENUE_URL })).toBe('URL on numbers.example')
  })
})

describe('Lemon Squeezy', () => {
  it('works out monthly revenue per product in the store currency, across pages', async () => {
    const result = await fetchSourceRevenue('lemonsqueezy', { apiKey: LEMON_KEY }, fakeLemonSqueezy(), NOW)
    expect(result).toMatchObject({ source: 'lemonsqueezy', label: 'Lemon Squeezy', mode: 'live', skippedItems: 1, checkedAt: '2026-10-30T00:00:00.000Z' })
    // 10.00 a month + 2 × 120.00 a year = 30.00 a month.
    expect(result.products).toEqual([
      { id: 'lemonsqueezy:11', name: 'Course', source: 'Lemon Squeezy', active: true, monthly: { EUR: 3000 }, subscriptions: 2 },
      { id: 'lemonsqueezy:12', name: 'Templates', source: 'Lemon Squeezy', active: true, monthly: {}, subscriptions: 0 },
    ])
  })

  it('explains a bad key', async () => {
    await expect(fetchSourceRevenue('lemonsqueezy', { apiKey: 'x'.repeat(60) }, fakeLemonSqueezy())).rejects.toMatchObject({ status: 400 })
  })
})

describe('Paddle', () => {
  it('follows pages and adds up items per product, by currency', async () => {
    const result = await fetchSourceRevenue('paddle', { apiKey: PADDLE_KEY }, fakePaddle(), NOW)
    expect(result.mode).toBe('live')
    expect(result.warnings).toEqual([])
    expect(result.products).toEqual([
      { id: 'paddle:pro_app', name: 'App', source: 'Paddle', active: true, monthly: { USD: 1400, GBP: 500 }, subscriptions: 2 },
      { id: 'paddle:pro_free', name: 'Free tier', source: 'Paddle', active: true, monthly: {}, subscriptions: 0 },
    ])
  })

  it('uses the sandbox for sandbox keys, and works without product.read', async () => {
    const fetchImpl = fakePaddle({ productRead: false })
    const result = await fetchSourceRevenue('paddle', { apiKey: PADDLE_SANDBOX_KEY }, fetchImpl, NOW)
    expect(fetchImpl.mock.calls[0]?.[0]).toMatch(/^https:\/\/sandbox-api\.paddle\.com\//)
    expect(result.mode).toBe('test')
    expect(result.products.map((product) => product.id)).toEqual(['paddle:pro_app'])
    expect(result.warnings[0]).toMatch(/product.read/)
  })

  it('says which permission is missing', async () => {
    await expect(fetchSourceRevenue('paddle', { apiKey: PADDLE_KEY }, fakePaddle({ subscriptionRead: false }))).rejects.toThrow(/subscription.read/)
  })
})

describe('Custom URL', () => {
  it('reads products in major units, stored like Stripe, skipping unusable rows', async () => {
    const result = await fetchSourceRevenue('custom', { url: REVENUE_URL, token: REVENUE_TOKEN }, fakeRevenueUrl(), NOW)
    expect(result.products).toEqual([
      { id: 'custom:ios-pro', name: 'Notes Pro (iOS)', source: 'Custom', active: true, monthly: { USD: 12050 }, subscriptions: 40 },
      { id: 'custom:jp', name: 'jp', source: 'Custom', active: true, monthly: { JPY: 5000 }, subscriptions: 0 },
      { id: 'custom:android-pro', name: 'Notes Pro (Android)', source: 'Custom', active: true, monthly: { EUR: 8000 }, subscriptions: 0 },
    ])
  })

  it('explains answers it can’t use', async () => {
    await expect(fetchSourceRevenue('custom', { url: REVENUE_URL, token: '' }, fakeRevenueUrl())).rejects.toThrow(/check the token/)
    await expect(fetchSourceRevenue('custom', { url: REVENUE_URL, token: REVENUE_TOKEN }, fakeRevenueUrl({ raw: 'nope' }))).rejects.toThrow(/JSON/)
    await expect(fetchSourceRevenue('custom', { url: REVENUE_URL, token: REVENUE_TOKEN }, fakeRevenueUrl({ body: { items: [] } }))).rejects.toThrow(/"products"/)
  })
})
