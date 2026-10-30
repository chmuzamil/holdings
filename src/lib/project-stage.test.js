import { describe, expect, it } from 'vitest'
import { normalizeProjectRecord, stageName, withStage } from './project-helpers'

describe('project stage in the app', () => {
  it('gives old projects a stage from their status, so old exports still load', () => {
    expect(normalizeProjectRecord({ id: 'p', name: 'Old', status: 'Archived' })).toMatchObject({ stage: 'archived', stageChangedAt: '', lastWorkedOn: '' })
    expect(normalizeProjectRecord({ id: 'p', name: 'Old', status: 'Beta' }).stage).toBe('launched')
    expect(normalizeProjectRecord({ id: 'p', name: 'New', status: 'Production', stage: 'paused' }).stage).toBe('paused')
    expect(normalizeProjectRecord({ id: 'p', name: 'Bad', stage: 'sleeping', lastWorkedOn: 'soon' })).toMatchObject({ stage: 'idea', lastWorkedOn: '' })
  })

  it('dates a stage change and keeps the older status in step', () => {
    const now = new Date('2026-10-29T10:00:00Z')
    expect(withStage({ stage: 'launched', status: 'Production' }, 'archived', now)).toMatchObject({
      stage: 'archived', status: 'Archived', stageChangedAt: '2026-10-29T10:00:00.000Z',
    })
    // Paused has no older equivalent, so the status stays as it was.
    expect(withStage({ stage: 'launched', status: 'Production' }, 'paused', now).status).toBe('Production')
  })

  it('names stages in plain words', () => {
    expect(['idea', 'maintenance', 'nonsense'].map(stageName)).toEqual(['Idea', 'Maintenance', 'Idea'])
  })
})

describe('revenue links in old data', () => {
  it('moves Stripe product links to revenueProductIds, so old exports keep their revenue', () => {
    const old = normalizeProjectRecord({ id: 'p', name: 'Old', stripeProductIds: ['prod_app'] })
    expect(old.revenueProductIds).toEqual(['prod_app'])
    expect(old).not.toHaveProperty('stripeProductIds')
    expect(normalizeProjectRecord({ id: 'p', name: 'New', revenueProductIds: ['paddle:pro_x'], stripeProductIds: ['prod_old'] }).revenueProductIds).toEqual(['paddle:pro_x'])
    expect(normalizeProjectRecord({ id: 'p', name: 'None' }).revenueProductIds).toEqual([])
  })
})
