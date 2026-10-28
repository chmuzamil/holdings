import { describe, expect, it } from 'vitest'
import { monthlyCostUsd, shareFractions, summarizeCosts } from './cost'
import { emptyData, type Asset, type HoldingsData, type Project } from './model'

function asset(id: string, costUsd: number, billing: Asset['billing'] = 'monthly', extra: Partial<Asset> = {}): Asset {
  return {
    id, kind: 'server', name: id, provider: '', costUsd, billing, status: 'active',
    renewsAt: '', expiresAt: '', notes: '', details: {}, addedAt: '', editedAt: '', ...extra,
  }
}

function project(id: string): Project {
  return { id, name: id, slug: id, status: 'production', description: '', liveUrl: '', notes: '', monthlyRevenueUsd: null, stage: 'launched', stageChangedAt: '', lastWorkedOn: '', runbook: '', details: {}, addedAt: '', editedAt: '' }
}

function data(parts: Partial<HoldingsData>): HoldingsData {
  return { ...emptyData(), ...parts }
}

describe('monthlyCostUsd', () => {
  it.each([
    [asset('a', 12, 'monthly'), 12],
    [asset('a', 120, 'yearly'), 10],
    [asset('a', 50, 'free'), 0],
    [asset('a', 30, 'monthly', { status: 'cancelled' }), 0],
    [asset('a', -5, 'monthly'), 0],
    [asset('a', Number.NaN, 'monthly'), 0],
  ])('%#', (input, expected) => {
    expect(monthlyCostUsd(input)).toBe(expected)
  })

  it('still counts expired assets, since they are usually still being paid for or about to be', () => {
    expect(monthlyCostUsd(asset('a', 9, 'monthly', { status: 'expired' }))).toBe(9)
  })
})

describe('shareFractions', () => {
  it('splits evenly when no shares are set', () => {
    const shares = shareFractions([{ projectId: 'p1', assetId: 'a' }, { projectId: 'p2', assetId: 'a' }, { projectId: 'p3', assetId: 'a' }])
    expect([...shares.values()].map((v) => v.toFixed(4))).toEqual(['0.3333', '0.3333', '0.3333'])
  })

  it('gives explicit shares first and splits the rest evenly', () => {
    const shares = shareFractions([
      { projectId: 'p1', assetId: 'a', sharePct: 50 },
      { projectId: 'p2', assetId: 'a' },
      { projectId: 'p3', assetId: 'a' },
    ])
    expect(Object.fromEntries(shares)).toEqual({ p1: 0.5, p2: 0.25, p3: 0.25 })
  })

  it('never hands out more than 100%', () => {
    const shares = shareFractions([
      { projectId: 'p1', assetId: 'a', sharePct: 80 },
      { projectId: 'p2', assetId: 'a', sharePct: 80 },
      { projectId: 'p3', assetId: 'a' },
    ])
    expect(shares.get('p1')).toBeCloseTo(0.8)
    expect(shares.get('p2')).toBeCloseTo(0.2)
    expect(shares.get('p3')).toBeCloseTo(0)
  })
})

describe('summarizeCosts', () => {
  it('splits a shared server between the projects using it instead of counting it twice', () => {
    const summary = summarizeCosts(data({
      projects: [project('shop'), project('news')],
      assets: [asset('vps', 10), asset('domain', 24, 'yearly')],
      projectAssets: [
        { projectId: 'shop', assetId: 'vps' },
        { projectId: 'news', assetId: 'vps' },
        { projectId: 'shop', assetId: 'domain' },
      ],
    }))

    expect(summary.projects.get('shop')?.monthlyUsd).toBe(5 + 2)
    expect(summary.projects.get('news')?.monthlyUsd).toBe(5)
    expect(summary.totalMonthlyUsd).toBe(12)
    expect(summary.unassignedMonthlyUsd).toBe(0)

    const line = summary.projects.get('news')?.lines[0]
    expect(line).toMatchObject({ assetId: 'vps', assetMonthlyUsd: 10, monthlyUsd: 5, share: 0.5, sharedBy: 2 })
  })

  it('reports assets that belong to no project as unassigned', () => {
    const summary = summarizeCosts(data({
      projects: [project('shop')],
      assets: [asset('figma', 15), asset('vps', 10)],
      projectAssets: [{ projectId: 'shop', assetId: 'vps' }],
    }))
    expect(summary.unassigned.map((line) => line.assetId)).toEqual(['figma'])
    expect(summary.unassignedMonthlyUsd).toBe(15)
  })

  it('leaves the uncovered part of explicit shares unassigned', () => {
    const summary = summarizeCosts(data({
      projects: [project('shop')],
      assets: [asset('vps', 20)],
      projectAssets: [{ projectId: 'shop', assetId: 'vps', sharePct: 25 }],
    }))
    expect(summary.projects.get('shop')?.monthlyUsd).toBe(5)
    expect(summary.unassignedMonthlyUsd).toBe(15)
  })

  it('ignores duplicate rows and rows for projects that no longer exist', () => {
    const summary = summarizeCosts(data({
      projects: [project('shop')],
      assets: [asset('vps', 10)],
      projectAssets: [
        { projectId: 'shop', assetId: 'vps' },
        { projectId: 'shop', assetId: 'vps' },
        { projectId: 'deleted', assetId: 'vps' },
      ],
    }))
    expect(summary.projects.get('shop')?.monthlyUsd).toBe(10)
    expect(summary.unassignedMonthlyUsd).toBe(0)
  })

  it('always balances: projects plus unassigned equals the total', () => {
    const summary = summarizeCosts(data({
      projects: [project('a'), project('b'), project('c')],
      assets: [asset('x', 7), asset('y', 100, 'yearly'), asset('z', 3), asset('w', 11)],
      projectAssets: [
        { projectId: 'a', assetId: 'x' },
        { projectId: 'b', assetId: 'x', sharePct: 10 },
        { projectId: 'b', assetId: 'y' },
        { projectId: 'c', assetId: 'y' },
        { projectId: 'a', assetId: 'y' },
        { projectId: 'c', assetId: 'z', sharePct: 40 },
      ],
    }))
    const carried = [...summary.projects.values()].reduce((sum, cost) => sum + cost.monthlyUsd, 0)
    expect(carried + summary.unassignedMonthlyUsd).toBeCloseTo(summary.totalMonthlyUsd, 10)
  })
})
