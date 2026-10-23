import { describe, expect, it } from 'vitest'
import { daysLabel, getExpiryRadar } from './expiry'

const now = new Date(2026, 9, 23, 15, 0)
const records = [
  { id: 'd1', moduleKey: 'domains', name: 'shop.example', renewalDate: '2026-10-20', status: 'Active' },
  { id: 'k1', moduleKey: 'keys', name: 'Deploy token', renewalDate: '2027-04-01', expiryDate: '2026-11-04', status: 'Active' },
  { id: 'k2', moduleKey: 'keys', name: 'OAuth app', status: 'Active' },
  { id: 's1', moduleKey: 'subscriptions', name: 'Sentry', renewalDate: '2026-12-15', status: 'Active' },
  { id: 's2', moduleKey: 'subscriptions', name: 'Old tool', renewalDate: '2026-10-25', status: 'Cancelled' },
  { id: 'v1', moduleKey: 'servers', name: 'VPS', renewalDate: '2027-06-01', status: 'Active' },
  { id: 'r1', moduleKey: 'repos', name: 'repo', lastCommitAt: '2026-10-01' },
]

describe('getExpiryRadar', () => {
  const groups = Object.fromEntries(getExpiryRadar(records, now).map((group) => [group.key, group.rows]))

  it('groups items by how soon their nearest date is', () => {
    expect(groups.overdue.map((row) => row.record.id)).toEqual(['d1'])
    expect(groups.month.map((row) => row.record.id)).toEqual(['k1'])
    expect(groups.quarter.map((row) => row.record.id)).toEqual(['s1'])
    expect(groups.later.map((row) => row.record.id)).toEqual(['v1'])
    expect(groups.none.map((row) => row.record.id)).toEqual(['k2'])
  })

  it('uses the earlier of rotate-by and expiry, and says which one it is', () => {
    expect(groups.month[0]).toMatchObject({ days: 12, dateLabel: 'Expires' })
  })

  it('leaves out cancelled items and things that never expire', () => {
    const ids = Object.values(groups).flat().map((row) => row.record.id)
    expect(ids).not.toContain('s2')
    expect(ids).not.toContain('r1')
  })
})

describe('daysLabel', () => {
  it.each([[0, 'today'], [1, 'in 1 day'], [12, 'in 12 days'], [-1, '1 day ago'], [-3, '3 days ago'], [null, '']])('%s -> %s', (days, label) => {
    expect(daysLabel(days)).toBe(label)
  })
})
