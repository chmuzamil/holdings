import { describe, expect, it } from 'vitest'
import { buildExitPack, exitPackMarkdown } from './exit'
import { fromV1 } from './migrate'

const now = new Date(2026, 9, 24, 12)
const data = fromV1({
  keys: [
    { id: 'card', name: 'Business Visa', keyType: 'Payment card', last4: '4242' },
    { id: 'stripe', name: 'Stripe live key', keyType: 'API key', keptIn: '1Password', connectedProjectIds: ['shop'] },
  ],
  servers: [{ id: 'vps', name: 'Main VPS', provider: 'Hetzner', cost: 10, paidWithId: 'card', renewalDate: '2026-11-04' }],
  domains: [{ id: 'dom', name: 'shop.example', provider: 'Porkbun', cost: 12, renewalDate: '2026-12-01' }],
  repos: [{ id: 'repo', name: 'shop' }],
  subscriptions: [{ id: 'mail', name: 'Postmark', cost: 15, connectedProjectIds: ['shop'], renewalDate: '2027-06-01' }],
  projects: [
    { id: 'shop', name: 'Shop', description: 'A storefront.', liveUrl: 'https://shop.example', domainIds: ['dom'], serverIds: ['vps'], repoIds: ['repo'], monthlyRevenueUsd: 420 },
    { id: 'news', name: 'News', serverIds: ['vps'] },
  ],
})

describe('buildExitPack', () => {
  const pack = buildExitPack(data, 'shop', now)!

  it('lists the project\'s assets plus the card that pays for them, in a sensible order', () => {
    expect(pack.assets.map((item) => item.asset.id)).toEqual(['dom', 'vps', 'repo', 'mail', 'stripe', 'card'])
  })

  it('uses the project\'s share of shared costs and flags what is shared', () => {
    const vps = pack.assets.find((item) => item.asset.id === 'vps')!
    expect(vps.monthlyUsd).toBe(5)
    expect(vps.sharedWith).toEqual(['News'])
    expect(vps.steps[0]).toMatch(/Also used by News/)
    expect(vps.paidWith).toBe('Business Visa')
    expect(pack.monthlyCostUsd).toBe(1 + 5 + 15)
  })

  it('never asks to hand over a key, only to replace it', () => {
    const key = pack.assets.find((item) => item.asset.id === 'stripe')!
    expect(key.steps.join(' ')).toMatch(/Do not send the key/)
  })

  it('lists dates in the next 90 days only', () => {
    expect(pack.upcoming.map((item) => `${item.asset.id} ${item.date}`)).toEqual(['vps 2026-11-04', 'dom 2026-12-01'])
  })

  it('returns null for an unknown project', () => {
    expect(buildExitPack(data, 'nope', now)).toBeNull()
  })
})

describe('exitPackMarkdown', () => {
  const markdown = exitPackMarkdown(buildExitPack(data, 'shop', now)!)

  it('has money, contents and a checklist, and says secrets are left out', () => {
    expect(markdown).toContain('# Shop: asset register and transfer checklist')
    expect(markdown).toContain('Secrets (keys, passwords, card numbers) are not included.')
    expect(markdown).toContain('- Revenue: $420 a month')
    expect(markdown).toContain('- Running costs: $21 a month ($252 a year)')
    expect(markdown).toContain('- Profit: $399 a month')
    expect(markdown).toContain('- **Stripe live key**: kept in 1Password')
    expect(markdown).toContain('- [ ] Unlock the domain at the registrar.')
  })
})
