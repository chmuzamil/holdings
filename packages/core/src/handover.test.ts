import { describe, expect, it } from 'vitest'
import { buildHandover, handoverHtml, handoverMarkdown } from './handover'
import { fromV1 } from './migrate'

const now = new Date(2026, 9, 24, 12)
const data = fromV1({
  keys: [
    { id: 'card', name: 'Business Visa', keyType: 'Payment card', expiryDate: '2026-11-30' },
    { id: 'gh', name: 'Deploy token', keyType: 'Access token', keptIn: 'Server .env', expiryDate: '2026-11-05', connectedProjectIds: ['shop'] },
  ],
  servers: [{ id: 'vps', name: 'Main VPS', provider: 'Hetzner', cost: 10, paidWithId: 'card', renewalDate: '2026-10-30' }],
  subscriptions: [{ id: 'old', name: 'Old tool', cost: 5, status: 'Cancelled', renewalDate: '2026-10-28' }],
  projects: [{ id: 'shop', name: 'Shop <b>', description: 'A storefront.', serverIds: ['vps'], monthlyRevenueUsd: 420 }],
})

describe('buildHandover', () => {
  const doc = buildHandover(data, { recipient: 'Sara', owner: 'Sam', message: '' }, now)
  const section = (heading: string) => doc.sections.find((item) => item.heading.startsWith(heading))

  it('opens with a note for the recipient and says no secrets are inside', () => {
    expect(doc.title).toBe('If Sam is unavailable')
    expect(doc.sections[0]?.heading).toBe('For Sara')
    expect(doc.sections[0]?.paragraphs.join(' ')).toContain('does not contain passwords, keys or card numbers')
  })

  it('lists what is due in the next 30 days first, with who pays and where keys are kept', () => {
    expect(section('Do this first')?.items).toEqual([
      'Main VPS: 2026-10-30 (in 6 days). Hetzner, paid with Business Visa.',
      'Deploy token: 2026-11-05 (in 12 days). Kept in Server .env.',
    ])
  })

  it('leaves cancelled things out', () => {
    expect(JSON.stringify(doc)).not.toContain('Old tool')
  })

  it('describes each project and which bills each card pays', () => {
    expect(section('Project: Shop')?.paragraphs).toContain('Earns $420 a month, costs $10 a month.')
    expect(section('Bills and cards')?.items).toEqual(['Business Visa: Main VPS'])
    expect(section('Where keys')?.items).toEqual(['Deploy token: Server .env'])
  })
})

describe('rendering', () => {
  const doc = buildHandover(data, { recipient: 'Sara', owner: 'Sam', message: 'Call Alex <first>' }, now)

  it('escapes every piece of user text in HTML', () => {
    const html = handoverHtml(doc)
    expect(html).toContain('Shop &lt;b&gt;')
    expect(html).toContain('Call Alex &lt;first&gt;')
    expect(html).not.toContain('<b>')
  })

  it('renders Markdown', () => {
    expect(handoverMarkdown(doc)).toContain('## For Sara')
  })
})
