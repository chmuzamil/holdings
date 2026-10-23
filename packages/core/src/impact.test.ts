import { describe, expect, it } from 'vitest'
import { impactOf, rankByImpact } from './impact'
import { fromV1 } from './migrate'

// A small portfolio: two projects share a server; one domain points at it,
// another at a static host; a repo deploys to the server.
const data = fromV1({
  servers: [
    { id: 'vps', name: 'Main VPS', cost: 9 },
    { id: 'static', name: 'Static host', cost: 0 },
  ],
  domains: [
    { id: 'shop.example', name: 'shop.example', cost: 12, connectedServerIds: ['vps'] },
    { id: 'news.example', name: 'news.example', cost: 10, connectedServerIds: ['vps'], subdomains: [{ id: 's', name: 'app', serverId: 'vps' }] },
    { id: 'guide.example', name: 'guide.example', cost: 14, connectedServerIds: ['static'], subdomains: [{ id: 'st', name: 'staging', serverId: 'vps' }] },
  ],
  repos: [{ id: 'shop-repo', name: 'shop', connectedServerIds: ['vps'] }],
  subscriptions: [{ id: 'figma', name: 'Figma', cost: 15 }],
  projects: [
    { id: 'shop', name: 'Shop', domainIds: ['shop.example'], repoIds: ['shop-repo'], monthlyRevenueUsd: 420 },
    { id: 'news', name: 'News', domainIds: ['news.example'], monthlyRevenueUsd: 38 },
    { id: 'guide', name: 'Guide', domainIds: ['guide.example'] },
  ],
})

describe('impactOf', () => {
  it('follows links back from a server to everything that depends on it', () => {
    const impact = impactOf(data, 'vps')
    expect(impact?.affectedAssets.map((item) => item.asset.id).sort()).toEqual(['news.example', 'shop-repo', 'shop.example'])
    expect(impact?.affectedAssets.find((item) => item.asset.id === 'shop-repo')?.path).toEqual([
      { assetId: 'shop-repo', relation: 'deploys_to' },
    ])
  })

  it('finds the projects that use any affected item, with revenue at risk', () => {
    const impact = impactOf(data, 'vps')
    expect(impact?.affectedProjects.map((item) => item.project.id)).toEqual(['shop', 'news'])
    expect(impact?.revenueAtRiskUsd).toBe(458)
    expect(impact?.projectsWithUnknownRevenue).toBe(0)
  })

  it('counts projects without tracked revenue separately', () => {
    const impact = impactOf(data, 'static')
    expect(impact?.affectedProjects.map((item) => item.project.id)).toEqual(['guide'])
    expect(impact?.revenueAtRiskUsd).toBe(0)
    expect(impact?.projectsWithUnknownRevenue).toBe(1)
  })

  it('handles a domain lapsing: only its own projects are hit', () => {
    const impact = impactOf(data, 'shop.example')
    expect(impact?.affectedAssets).toEqual([])
    expect(impact?.affectedProjects.map((item) => item.project.id)).toEqual(['shop'])
  })

  it('reports nothing for an unused item, and null for an unknown id', () => {
    expect(impactOf(data, 'figma')).toMatchObject({ affectedAssets: [], affectedProjects: [], revenueAtRiskUsd: 0 })
    expect(impactOf(data, 'nope')).toBeNull()
  })

  it('follows chains and survives cycles', () => {
    const chain = {
      ...data,
      links: [
        ...data.links,
        { from: 'vps', to: 'static', relation: 'depends_on' as const },
        { from: 'static', to: 'vps', relation: 'depends_on' as const },
      ],
    }
    const impact = impactOf(chain, 'static')
    const viaVps = impact?.affectedAssets.find((item) => item.asset.id === 'shop.example')
    expect(viaVps?.path.map((step) => step.assetId)).toEqual(['shop.example', 'vps'])
    expect(impact?.affectedProjects.map((item) => item.project.id).sort()).toEqual(['guide', 'news', 'shop'])
  })
})

describe('subdomains', () => {
  it('breaks only the subdomain when its server stops, not the whole domain or its project', () => {
    const impact = impactOf(data, 'vps')
    expect(impact?.affectedSubdomains.map((item) => `${item.subdomain}.${item.asset.name}`)).toEqual(['staging.guide.example'])
    expect(impact?.affectedAssets.map((item) => item.asset.id)).not.toContain('guide.example')
    expect(impact?.affectedProjects.map((item) => item.project.id)).not.toContain('guide')
  })

  it("doesn't list a subdomain separately when its whole domain already stops", () => {
    const impact = impactOf(data, 'vps')
    expect(impact?.affectedSubdomains.map((item) => item.asset.id)).not.toContain('news.example')
  })
})

describe('rankByImpact', () => {
  it('puts the item with the most revenue riding on it first and skips items nothing depends on', () => {
    const ranked = rankByImpact(data).map((impact) => impact.stopped.id)
    expect(ranked[0]).toBe('vps')
    expect(ranked).not.toContain('figma')
  })
})
