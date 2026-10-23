import { describe, expect, it } from 'vitest'
import { buildLedger } from './ledger'
import { fromV1 } from './migrate'

const data = fromV1({
  servers: [{ id: 'vps', name: 'VPS', cost: 10 }],
  subscriptions: [
    { id: 'mail', name: 'Mail', cost: 15, connectedProjectIds: ['shop'] },
    { id: 'figma', name: 'Figma', cost: 12 },
  ],
  projects: [
    { id: 'shop', name: 'Shop', serverIds: ['vps'], monthlyRevenueUsd: 400 },
    { id: 'news', name: 'News', serverIds: ['vps'], monthlyRevenueUsd: '0' },
    { id: 'cli', name: 'CLI' },
  ],
})

describe('buildLedger', () => {
  const ledger = buildLedger(data)
  const row = (id: string) => ledger.rows.find((r) => r.projectId === id)

  it('puts each project cost next to its revenue', () => {
    expect(row('shop')).toEqual({ projectId: 'shop', name: 'Shop', costMonthlyUsd: 20, revenueMonthlyUsd: 400, profitMonthlyUsd: 380, margin: 0.95 })
  })

  it('treats zero revenue as tracked and losing money', () => {
    expect(row('news')).toMatchObject({ costMonthlyUsd: 5, revenueMonthlyUsd: 0, profitMonthlyUsd: -5, margin: null })
  })

  it('keeps untracked revenue as null instead of pretending it is zero', () => {
    expect(row('cli')).toMatchObject({ revenueMonthlyUsd: null, profitMonthlyUsd: null, margin: null })
    expect(ledger.projectsWithRevenue).toBe(2)
  })

  it('subtracts every cost, including ones no project carries, from portfolio profit', () => {
    expect(ledger.revenueMonthlyUsd).toBe(400)
    expect(ledger.costMonthlyUsd).toBe(37)
    expect(ledger.unassignedMonthlyUsd).toBe(12)
    expect(ledger.profitMonthlyUsd).toBe(363)
  })

  it('ignores negative or junk revenue', () => {
    const odd = buildLedger(fromV1({ projects: [{ id: 'a', name: 'A', monthlyRevenueUsd: -5 }, { id: 'b', name: 'B', monthlyRevenueUsd: 'lots' }] }))
    expect(odd.rows.map((r) => r.revenueMonthlyUsd)).toEqual([null, null])
  })
})
