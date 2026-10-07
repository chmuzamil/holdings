import { describe, expect, it } from 'vitest'
import { getAssetTimeline, getTimelineEvents } from './timeline'

describe('getTimelineEvents', () => {
  it('returns nothing when no real dates are known', () => {
    const records = {
      domains: [{ id: 'd1', name: 'shopfront.example', renewalDate: '2027-01-01' }],
      projects: [{ id: 'p1', name: 'Shopfront' }],
      repos: [],
    }
    expect(getTimelineEvents(records)).toEqual([])
  })

  it('uses addedAt, GitHub creation and registry registration dates, newest first', () => {
    const records = {
      projects: [{ id: 'p1', name: 'Shopfront', addedAt: '2026-10-01T09:00:00.000Z' }],
      repos: [{ id: 'r1', name: 'shopfront-web', createdAt: '2025-02-03' }],
      domains: [{ id: 'd1', name: 'shopfront.example', lookup: { whois: { created: '2021-05-06T00:00:00Z' } } }],
    }
    expect(getTimelineEvents(records).map((event) => event.label)).toEqual([
      'Started tracking project Shopfront',
      'Created shopfront-web on GitHub',
      'Registered shopfront.example',
    ])
  })

  it('skips unparseable dates', () => {
    expect(getTimelineEvents({ repos: [{ id: 'r', name: 'x', createdAt: 'soon' }] })).toEqual([])
  })
})

describe('getAssetTimeline', () => {
  it('groups by year, newest year first', () => {
    const records = {
      repos: [
        { id: 'a', name: 'a', createdAt: '2024-01-10' },
        { id: 'b', name: 'b', createdAt: '2026-03-01' },
        { id: 'c', name: 'c', createdAt: '2026-01-01' },
      ],
    }
    const timeline = getAssetTimeline(records)
    expect(timeline.map((block) => block.year)).toEqual([2026, 2024])
    expect(timeline[0].events.map((event) => event.recordId)).toEqual(['b', 'c'])
  })
})
