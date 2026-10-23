import { describe, expect, it } from 'vitest'
import { getDomainCheck, getProjectGaps } from './health-score'

describe('getProjectGaps', () => {
  it('lists a missing domain and repo, not a missing server', () => {
    expect(getProjectGaps({ domainIds: [], repoIds: [], serverIds: [] }).map((gap) => gap.label)).toEqual([
      'No domain linked',
      'No repo linked',
    ])
    expect(getProjectGaps({ domainIds: ['d'], repoIds: ['r'], serverIds: [] })).toEqual([])
  })
})

describe('getDomainCheck', () => {
  it.each([
    [undefined, true, 'DNS not checked yet'],
    [{ lastChecked: '2026-10-01', dns: 'healthy', nameservers: 'healthy', email: 'none' }, false, 'DNS OK'],
    [{ lastChecked: '2026-10-01', dns: 'healthy', nameservers: 'warning', email: 'healthy' }, true, 'DNS needs a look'],
    [{ lastChecked: '2026-10-01', dns: 'missing', nameservers: 'healthy', email: 'none' }, true, 'DNS problem'],
    [{ lastChecked: '2026-10-01', dns: 'none', nameservers: 'none', email: 'none' }, false, 'DNS OK'],
  ])('%j', (health, show, label) => {
    expect(getDomainCheck(health)).toMatchObject({ show, label })
  })
})
