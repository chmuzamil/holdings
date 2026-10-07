import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'
import { computeProjectMonthlyCostUsd } from './project-helpers'

describe('daysUntilRenewal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 15, 30))
  })
  afterEach(() => vi.useRealTimers())

  it('counts whole days from today, ignoring the time of day', () => {
    expect(daysUntilRenewal({ renewalDate: '2026-10-07' })).toBe(0)
    expect(daysUntilRenewal({ renewalDate: '2026-10-08' })).toBe(1)
    expect(daysUntilRenewal({ renewalDate: '2026-10-01' })).toBe(-6)
  })

  it('falls back to the expiry date', () => {
    expect(daysUntilRenewal({ expiryDate: '2026-11-06' })).toBe(30)
  })

  it('returns null without dates', () => {
    expect(daysUntilRenewal({})).toBeNull()
  })
})

describe('isRenewableRecord', () => {
  it.each([
    ['domains', true],
    ['subscriptions', true],
    ['repos', false],
    ['projects', false],
  ])('%s -> %s', (moduleKey, expected) => {
    expect(isRenewableRecord({ moduleKey })).toBe(expected)
  })
})

describe('computeProjectMonthlyCostUsd', () => {
  const toUsd = (record) => Number(record.cost || 0)
  const records = {
    domains: [{ id: 'd1', cost: 24 }],
    servers: [{ id: 's1', cost: 10 }],
    subscriptions: [{ id: 'sub1', cost: 5 }],
  }

  it('adds monthly server and subscription costs and spreads yearly domain cost over 12 months', () => {
    const project = { name: 'Shopfront', domainIds: ['d1'], serverIds: ['s1'], subscriptionIds: ['sub1'] }
    expect(computeProjectMonthlyCostUsd(project, records, toUsd)).toBe(2 + 10 + 5)
  })

  it('ignores links to records that no longer exist', () => {
    const project = { name: 'Ghost', domainIds: ['gone'], serverIds: [], subscriptionIds: [] }
    expect(computeProjectMonthlyCostUsd(project, records, toUsd)).toBe(0)
  })
})
