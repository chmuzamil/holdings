import { describe, expect, it } from 'vitest'
import { applyStripeRevenue, missingRates, productMonthlyUsd, projectStripeRevenueUsd, toMajorUnits } from './stripe-revenue'

const revenue = {
  checkedAt: '2026-10-24T08:00:00.000Z',
  products: [
    { id: 'prod_app', name: 'Shopfront Pro', monthly: { USD: 5800 } },
    { id: 'prod_eu', name: 'Shopfront EU', monthly: { EUR: 900 } },
    { id: 'prod_jp', name: 'Shopfront JP', monthly: { JPY: 1500 } },
  ],
}
const rates = { EUR: 0.9, JPY: 150 }

describe('stripe revenue', () => {
  it('reads cents, except for zero-decimal currencies', () => {
    expect(toMajorUnits(5800, 'USD')).toBe(58)
    expect(toMajorUnits(1500, 'JPY')).toBe(1500)
  })

  it('converts each product to USD', () => {
    expect(productMonthlyUsd(revenue.products[0], rates)).toBe(58)
    expect(productMonthlyUsd(revenue.products[1], rates)).toBe(10)
    expect(productMonthlyUsd(revenue.products[2], rates)).toBe(10)
    expect(productMonthlyUsd(revenue.products[1], {})).toBeNull()
  })

  it('lists currencies that still need a rate', () => {
    expect(missingRates(revenue, { EUR: 0.9 })).toEqual(['JPY'])
    expect(missingRates(revenue, rates)).toEqual([])
  })

  it('adds up a project’s linked products', () => {
    expect(projectStripeRevenueUsd({ stripeProductIds: ['prod_app', 'prod_eu'] }, revenue, rates)).toBe(68)
    expect(projectStripeRevenueUsd({ stripeProductIds: ['prod_gone'] }, revenue, rates)).toBe(0)
    expect(projectStripeRevenueUsd({ stripeProductIds: [] }, revenue, rates)).toBeNull()
    expect(projectStripeRevenueUsd({ stripeProductIds: ['prod_eu'] }, revenue, {})).toBeNull()
  })

  it('updates only linked projects, and returns the same array when nothing changed', () => {
    const projects = [
      { id: 'a', stripeProductIds: ['prod_app'], monthlyRevenueUsd: 40 },
      { id: 'b', monthlyRevenueUsd: 12 },
    ]
    const next = applyStripeRevenue(projects, revenue, rates)
    expect(next[0]).toMatchObject({ monthlyRevenueUsd: 58, revenueSyncedAt: revenue.checkedAt })
    expect(next[1]).toBe(projects[1])
    expect(applyStripeRevenue(next, revenue, rates)).toBe(next)
  })

  it('keeps the last known revenue when a rate is missing', () => {
    const projects = [{ id: 'a', stripeProductIds: ['prod_eu'], monthlyRevenueUsd: 9 }]
    expect(applyStripeRevenue(projects, revenue, {})).toBe(projects)
  })
})
