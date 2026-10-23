import { describe, expect, it } from 'vitest'
import { getCashForecast, getCostByProvider } from './insights-helpers'
import { percentShares } from './format'

const toUsd = (record) => Number(record.cost || 0)
const records = {
  domains: [
    { id: 'd1', name: 'a.example', cost: 12, renewalDate: '2026-12-05', status: 'Active' },
    { id: 'd2', name: 'b.example', cost: 30, renewalDate: '2025-11-20', status: 'Active' },
    { id: 'd3', name: 'gone.example', cost: 99, renewalDate: '2026-11-01', status: 'Cancelled' },
  ],
  servers: [{ id: 's1', provider: 'Hetzner', cost: 9, status: 'Active' }],
  subscriptions: [
    { id: 'sub1', provider: 'Postmark', cost: 15, status: 'Active' },
    { id: 'sub2', provider: 'Old', cost: 50, status: 'Expired' },
  ],
  accounts: [],
}

describe('getCashForecast', () => {
  const months = getCashForecast(records, toUsd, new Date(2026, 9, 23))

  it('covers 12 consecutive months from the current one, including quiet months', () => {
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ key: '2026-10', label: 'Oct', totalUsd: 24 })
    expect(months.map((month) => month.key).at(-1)).toBe('2027-09')
  })

  it('charges monthly items every month and leaves out cancelled or expired ones', () => {
    expect(months.every((month) => month.recurringUsd === 24)).toBe(true)
  })

  it('charges a yearly domain in full in the month it renews, rolling past dates forward a year', () => {
    expect(months.find((m) => m.key === '2026-12')).toMatchObject({ totalUsd: 36 })
    expect(months.find((m) => m.key === '2026-11')?.renewals.map((r) => r.name)).toEqual(['b.example'])
    expect(months.find((m) => m.key === '2026-11')?.totalUsd).toBe(54)
  })
})

describe('getCostByProvider', () => {
  it('skips inactive items and gives shares that add up to 100', () => {
    const rows = getCostByProvider(records, toUsd)
    expect(rows.map((row) => row.provider)).toEqual(['Postmark', 'Hetzner', 'Unknown'])
    expect(rows.reduce((sum, row) => sum + row.share.percent, 0)).toBe(100)
  })
})

describe('percentShares', () => {
  it('always totals 100', () => {
    const shares = percentShares([1, 1, 1])
    expect(shares.map((s) => s.percent)).toEqual([34, 33, 33])
  })

  it('flags tiny non-zero shares', () => {
    expect(percentShares([1000, 1])).toEqual([{ percent: 100, tiny: false }, { percent: 0, tiny: true }])
  })

  it('handles an empty total', () => {
    expect(percentShares([0, 0])).toEqual([{ percent: 0, tiny: false }, { percent: 0, tiny: false }])
  })
})
