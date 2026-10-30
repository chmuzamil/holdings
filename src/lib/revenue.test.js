import { describe, expect, it } from 'vitest'
import { applyRevenue, combineRevenue, missingRates, productMonthlyUsd, projectRevenueUsd, sourceNames, sourceOf, toMajorUnits } from './revenue'

const stripe = {
  checkedAt: '2026-10-24T08:00:00.000Z',
  products: [
    { id: 'prod_app', name: 'Shopfront Pro', monthly: { USD: 5800 } },
    { id: 'prod_eu', name: 'Shopfront EU', monthly: { EUR: 900 } },
    { id: 'prod_jp', name: 'Shopfront JP', monthly: { JPY: 1500 } },
  ],
}
const paddle = {
  source: 'paddle',
  label: 'Paddle',
  checkedAt: '2026-10-24T09:00:00.000Z',
  products: [{ id: 'paddle:pro_app', name: 'App', monthly: { USD: 2000 } }],
}
const revenue = combineRevenue(stripe, [paddle])
const rates = { EUR: 0.9, JPY: 150 }

describe('revenue', () => {
  it('reads cents, except for zero-decimal currencies', () => {
    expect(toMajorUnits(5800, 'USD')).toBe(58)
    expect(toMajorUnits(1500, 'JPY')).toBe(1500)
  })

  it('knows which source a product comes from', () => {
    expect(sourceOf('prod_app')).toBe('stripe')
    expect(sourceOf('paddle:pro_app')).toBe('paddle')
    expect(sourceOf('custom:ios-pro')).toBe('custom')
    expect(sourceNames(['prod_app', 'paddle:pro_app', 'custom:x'])).toBe('Stripe, Paddle and your revenue URL')
    expect(sourceNames(['lemonsqueezy:1'])).toBe('Lemon Squeezy')
  })

  it('combines sources, labelling products and noting which sources answered', () => {
    expect(revenue.loaded).toEqual(['stripe', 'paddle'])
    expect(revenue.checkedAt).toBe('2026-10-24T09:00:00.000Z')
    expect(revenue.products.map((product) => `${product.source}: ${product.name}`)).toEqual(['Stripe: Shopfront Pro', 'Stripe: Shopfront EU', 'Stripe: Shopfront JP', 'Paddle: App'])
    expect(combineRevenue(null, [])).toBeNull()
  })

  it('converts each product to USD', () => {
    expect(productMonthlyUsd(stripe.products[0], rates)).toBe(58)
    expect(productMonthlyUsd(stripe.products[1], rates)).toBe(10)
    expect(productMonthlyUsd(stripe.products[2], rates)).toBe(10)
    expect(productMonthlyUsd(stripe.products[1], {})).toBeNull()
  })

  it('lists currencies that still need a rate', () => {
    expect(missingRates(revenue, { EUR: 0.9 })).toEqual(['JPY'])
    expect(missingRates(revenue, rates)).toEqual([])
  })

  it('adds up a project’s linked products across sources', () => {
    expect(projectRevenueUsd({ revenueProductIds: ['prod_app', 'prod_eu', 'paddle:pro_app'] }, revenue, rates)).toBe(88)
    expect(projectRevenueUsd({ revenueProductIds: ['prod_gone'] }, revenue, rates)).toBe(0)
    expect(projectRevenueUsd({ revenueProductIds: [] }, revenue, rates)).toBeNull()
    expect(projectRevenueUsd({ revenueProductIds: ['prod_eu'] }, revenue, {})).toBeNull()
  })

  it('waits until every linked source has answered', () => {
    const stripeOnly = combineRevenue(stripe, [])
    expect(projectRevenueUsd({ revenueProductIds: ['prod_app', 'paddle:pro_app'] }, stripeOnly, rates)).toBeNull()
  })

  it('updates only linked projects, and returns the same array when nothing changed', () => {
    const projects = [
      { id: 'a', revenueProductIds: ['prod_app'], monthlyRevenueUsd: 40 },
      { id: 'b', monthlyRevenueUsd: 12 },
    ]
    const next = applyRevenue(projects, revenue, rates)
    expect(next[0]).toMatchObject({ monthlyRevenueUsd: 58, revenueSyncedAt: revenue.checkedAt })
    expect(next[1]).toBe(projects[1])
    expect(applyRevenue(next, revenue, rates)).toBe(next)
  })

  it('keeps the last known revenue when a rate is missing', () => {
    const projects = [{ id: 'a', revenueProductIds: ['prod_eu'], monthlyRevenueUsd: 9 }]
    expect(applyRevenue(projects, revenue, {})).toBe(projects)
  })
})
