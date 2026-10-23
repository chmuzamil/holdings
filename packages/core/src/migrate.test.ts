import { describe, expect, it } from 'vitest'
import { fromV1, isV1Records, type V1Records } from './migrate'
import { summarizeCosts } from './cost'

const v1: V1Records = {
  domains: [{
    id: 'd1', name: 'shopfront.example', provider: 'Porkbun', cost: 12, renewalDate: '2027-01-01', expiryDate: '2027-01-01',
    status: 'Expiring Soon', notes: 'main', addedAt: '2026-01-01T00:00:00.000Z',
    subdomains: [{ id: 's', name: 'app', serverId: 'srv' }, { id: 't', name: 'old', serverId: 'gone' }],
    connectedProjectIds: ['shop'], connectedServerIds: ['srv'], lookup: { checkedAt: 'x' }, health: { dns: 'healthy' },
  }],
  servers: [{ id: 'srv', name: 'Main VPS', provider: 'Hetzner', cost: 9, ipAddress: '203.0.113.10', status: 'Active', paidWithId: 'card' }],
  repos: [{ id: 'r1', name: 'Shopfront', url: 'https://github.com/x/y', connectedServerIds: ['srv'], connectedProjectIds: ['shop'] }],
  accounts: [{ id: 'acc', name: 'Stripe', cost: 0, status: 'Active' }],
  keys: [
    { id: 'card', name: 'Business Visa', keyType: 'Payment card', last4: '4242', expiryDate: '2027-03-31' },
    { id: 'tls', name: 'shop TLS', keyType: 'TLS certificate' },
    { id: 'gh', name: 'Deploy token', keyType: 'Access token', connectedProjectIds: ['shop'] },
  ],
  subscriptions: [
    { id: 'sub1', name: 'Postmark', cost: 15, status: 'Active', connectedProjectIds: ['shop'] },
    { id: 'sub2', name: 'Figma', cost: 15, status: 'Cancelled' },
  ],
  projects: [
    { id: 'shop', name: 'Shop Front', status: 'Production', priority: 'High', domainIds: ['d1'], serverIds: ['srv'], repoIds: ['r1'], subscriptionIds: ['sub1', 'missing'] },
    { id: 'news', name: 'NewsBite', status: 'Weird', serverIds: ['srv'] },
  ],
}

describe('fromV1', () => {
  const data = fromV1(v1)
  const byId = Object.fromEntries(data.assets.map((asset) => [asset.id, asset]))

  it('turns every module record into an asset with the right kind and billing', () => {
    expect(data.assets.map((asset) => [asset.id, asset.kind, asset.billing])).toEqual([
      ['d1', 'domain', 'yearly'],
      ['srv', 'server', 'monthly'],
      ['r1', 'repo', 'free'],
      ['acc', 'account', 'monthly'],
      ['sub1', 'subscription', 'monthly'],
      ['sub2', 'subscription', 'monthly'],
      ['card', 'card', 'free'],
      ['tls', 'certificate', 'free'],
      ['gh', 'credential', 'free'],
    ])
  })

  it('maps common fields and keeps the rest in details, dropping derived health', () => {
    expect(byId.d1).toMatchObject({
      name: 'shopfront.example', provider: 'Porkbun', costUsd: 12, status: 'expiring',
      renewsAt: '2027-01-01', notes: 'main', addedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(byId.d1?.details).toHaveProperty('lookup')
    expect(byId.d1?.details).toHaveProperty('subdomains')
    expect(byId.d1?.details).not.toHaveProperty('health')
    expect(byId.d1?.details).not.toHaveProperty('connectedProjectIds')
    expect(byId.srv?.details).toEqual({ ipAddress: '203.0.113.10' })
    expect(byId.card?.details).toMatchObject({ keyType: 'Payment card', last4: '4242' })
    expect(byId.sub2?.status).toBe('cancelled')
  })

  it('merges project membership from both sides without duplicates, and drops missing ids', () => {
    expect(data.projectAssets).toEqual([
      { projectId: 'shop', assetId: 'd1' },
      { projectId: 'shop', assetId: 'r1' },
      { projectId: 'shop', assetId: 'sub1' },
      { projectId: 'shop', assetId: 'gh' },
      { projectId: 'shop', assetId: 'srv' },
      { projectId: 'news', assetId: 'srv' },
    ])
  })

  it('builds dependency links from domain, subdomain and repo connections, dropping missing servers', () => {
    expect(data.links).toEqual([
      { from: 'd1', to: 'srv', relation: 'points_to' },
      { from: 'd1', to: 'srv', relation: 'points_to', subdomain: 'app' },
      { from: 'srv', to: 'card', relation: 'paid_with' },
      { from: 'r1', to: 'srv', relation: 'deploys_to' },
    ])
  })

  it('normalises projects', () => {
    expect(data.projects.map((project) => [project.id, project.slug, project.status])).toEqual([
      ['shop', 'shop-front', 'production'],
      ['news', 'newsbite', 'idea'],
    ])
    expect(data.projects[0]?.details).toEqual({ priority: 'High' })
  })

  it('uses a custom cost function when given one', () => {
    const zeroed = fromV1(v1, { costUsd: (record) => (record.id === 'srv' ? 0 : Number(record.cost) || 0) })
    expect(zeroed.assets.find((asset) => asset.id === 'srv')?.costUsd).toBe(0)
  })

  it('gives the shared server half to each project', () => {
    const summary = summarizeCosts(data)
    expect(summary.projects.get('shop')?.monthlyUsd).toBe(1 + 4.5 + 15)
    expect(summary.projects.get('news')?.monthlyUsd).toBe(4.5)
  })
})

describe('isV1Records', () => {
  it.each([
    [{ domains: [] }, true],
    [{ version: 2, projects: [] }, false],
    [[], false],
    [null, false],
    [{ hello: 1 }, false],
  ])('%j -> %s', (value, expected) => {
    expect(isV1Records(value)).toBe(expected)
  })
})
