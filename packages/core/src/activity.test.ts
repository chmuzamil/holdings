import { describe, expect, it } from 'vitest'
import { lastActivity } from './activity'
import { cleanupSuggestions } from './cleanup'
import { buildExitPack, exitPackMarkdown } from './exit'
import { buildHandover, handoverMarkdown } from './handover'
import { fromV1 } from './migrate'
import { stageFromStatus } from './model'

describe('project stage', () => {
  it('derives a stage from the older status, so old exports keep working', () => {
    expect(['Idea', 'Planning', 'Building', 'MVP', 'Beta', 'Production', 'Maintained', 'Archived', 'odd'].map(stageFromStatus))
      .toEqual(['idea', 'idea', 'building', 'launched', 'launched', 'launched', 'maintenance', 'archived', 'idea'])
    const data = fromV1({ projects: [{ id: 'p1', name: 'Old', status: 'Archived' }, { id: 'p2', name: 'New', status: 'Production', stage: 'paused' }] })
    expect(data.projects.map((project) => [project.stage, project.stageChangedAt, project.lastWorkedOn])).toEqual([['archived', '', ''], ['paused', '', '']])
  })

  it('ignores a malformed last-worked-on date', () => {
    expect(fromV1({ projects: [{ id: 'p1', name: 'A', lastWorkedOn: 'yesterday' }] }).projects[0]?.lastWorkedOn).toBe('')
  })
})

describe('lastActivity', () => {
  const data = fromV1({
    projects: [
      { id: 'p1', name: 'Shop', repoIds: ['r1', 'r2'], lastWorkedOn: '2026-05-01' },
      { id: 'p2', name: 'Notes', lastWorkedOn: '2026-09-01', repoIds: ['r3'] },
      { id: 'p3', name: 'Nothing known' },
    ],
    repos: [
      { id: 'r1', name: 'shop', lastCommitAt: '2026-08-20T10:00:00Z' },
      { id: 'r2', name: 'shop-api', lastCommitAt: '2026-07-01T10:00:00Z' },
      { id: 'r3', name: 'notes', lastCommitAt: '2026-01-01T10:00:00Z' },
    ],
  })

  it('uses the newest push to a linked repo when it is later', () => {
    expect(lastActivity(data, 'p1')).toEqual({ date: '2026-08-20', source: 'repo' })
  })

  it('uses the date set by hand when it is later', () => {
    expect(lastActivity(data, 'p2')).toEqual({ date: '2026-09-01', source: 'manual' })
  })

  it('says nothing when nothing is known', () => {
    expect(lastActivity(data, 'p3')).toBeNull()
  })
})

describe('stale projects', () => {
  const data = fromV1({
    projects: [
      { id: 'old', name: 'Old app', status: 'Production', lastWorkedOn: '2026-05-01', serverIds: ['s1'] },
      { id: 'fresh', name: 'Fresh app', status: 'Production', lastWorkedOn: '2026-10-20', serverIds: ['s2'] },
      { id: 'free', name: 'Free app', status: 'Production', lastWorkedOn: '2026-01-01' },
      { id: 'gone', name: 'Archived app', status: 'Archived', lastWorkedOn: '2026-01-01', serverIds: ['s3'] },
      { id: 'paused', name: 'Paused app', stage: 'paused', lastWorkedOn: '2026-06-01', serverIds: ['s4'] },
      { id: 'unknown', name: 'No date', status: 'Production', serverIds: ['s5'] },
    ],
    servers: ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id, name: id, cost: 10, status: 'Active' })),
  })
  const stale = (days?: number) => cleanupSuggestions(data, '2026-10-29', days === undefined ? {} : { staleDays: days })
    .suggestions.filter((item) => item.reason === 'stale-project')

  it('flags projects idle for 90 days that still cost money, with the saving', () => {
    expect(stale().map((item) => [item.project?.name, item.project?.daysIdle, item.savingMonthlyUsd])).toEqual([
      ['Old app', 181, 10],
      ['Paused app', 150, 10],
    ])
    expect(stale()[0]?.project?.lastActivity).toEqual({ date: '2026-05-01', source: 'manual' })
  })

  it('skips archived, free, recent and unknown projects', () => {
    const names = stale().map((item) => item.project?.name)
    for (const name of ['Archived app', 'Free app', 'Fresh app', 'No date']) expect(names).not.toContain(name)
  })

  it('uses the configured number of days', () => {
    expect(stale(160).map((item) => item.project?.name)).toEqual(['Old app'])
    expect(stale(5).map((item) => item.project?.name)).toContain('Fresh app')
  })
})

describe('stage and activity in the packs', () => {
  const data = fromV1({
    projects: [{ id: 'p1', name: 'Shop', stage: 'maintenance', repoIds: ['r1'] }],
    repos: [{ id: 'r1', name: 'shop', lastCommitAt: '2026-08-20T10:00:00Z' }],
  })

  it('shows them in the exit pack', () => {
    const markdown = exitPackMarkdown(buildExitPack(data, 'p1', new Date('2026-10-29T12:00:00Z'))!)
    expect(markdown).toContain('- Stage: Maintenance')
    expect(markdown).toContain('- Last worked on: 2026-08-20 (last push to a linked repo)')
  })

  it('shows them in the handover pack', () => {
    const markdown = handoverMarkdown(buildHandover(data, { owner: 'Sam', recipient: 'Sara', message: '' }, new Date('2026-10-29T12:00:00Z')))
    expect(markdown).toContain('Stage: Maintenance. Last worked on: 2026-08-20 (last push to a linked repo).')
  })
})
