import { describe, expect, it } from 'vitest'
import { applyLookup, domainChanges, normalizeWatch, recentHighChanges } from './domain-watch'

const lookup = (ns, at, status = ['client transfer prohibited']) => ({
  checkedAt: at,
  dns: { ns: { value: ns } },
  whois: { status, expires: '2027-06-01T00:00:00Z', dnssec: true },
})

describe('applyLookup', () => {
  it('uses the stored lookup as the starting point, then records changes', () => {
    const domain = { id: 'd1', name: 'shop.example', lookup: lookup(['ns1.a.example', 'ns2.a.example'], '2026-10-01T00:00:00.000Z') }
    const first = applyLookup(domain, lookup(['ns1.b.example', 'ns2.b.example'], '2026-10-20T00:00:00.000Z'))
    expect(first.firstCheck).toBe(false)
    expect(first.changes.map((change) => change.field)).toEqual(['nameservers'])
    expect(first.domain.watch.changes).toHaveLength(1)
    expect(first.domain.lookup.checkedAt).toBe('2026-10-20T00:00:00.000Z')

    const again = applyLookup(first.domain, lookup(['ns1.b.example', 'ns2.b.example'], '2026-10-21T00:00:00.000Z'))
    expect(again.changes).toEqual([])
    expect(again.domain.watch.changes).toHaveLength(1)
  })

  it('records nothing on the very first check', () => {
    const result = applyLookup({ id: 'd1', name: 'new.example' }, lookup(['ns1.a.example'], '2026-10-20T00:00:00.000Z'))
    expect(result).toMatchObject({ firstCheck: true, changes: [] })
    expect(result.domain.watch.snapshot.nameservers).toEqual(['ns1.a.example'])
  })
})

describe('normalizeWatch', () => {
  it('drops unusable watch data from old or edited files', () => {
    expect(normalizeWatch(undefined)).toBeUndefined()
    expect(normalizeWatch({ snapshot: {}, changes: 'no' })).toBeUndefined()
    expect(normalizeWatch({ snapshot: {}, changes: [{ id: 'a', at: '2026' }, null, { id: 'b' }] }).changes).toEqual([{ id: 'a', at: '2026' }])
  })
})

describe('changes from here and from the server', () => {
  const local = { id: 'x', at: '2026-10-20T00:00:00.000Z', severity: 'high' }
  const remote = { id: 'y', at: '2026-10-25T00:00:00.000Z', severity: 'normal' }
  const domain = { name: 'shop.example', watch: { snapshot: {}, changes: [local] } }

  it('merges both, newest first, without repeats', () => {
    expect(domainChanges(domain, { 'shop.example': [remote, local] }).map((change) => change.id)).toEqual(['y', 'x'])
  })

  it('lists only recent high-severity changes for Attention', () => {
    expect(recentHighChanges(domain, {}, new Date('2026-10-29T00:00:00Z')).map((change) => change.id)).toEqual(['x'])
    expect(recentHighChanges(domain, {}, new Date('2026-12-01T00:00:00Z'))).toEqual([])
  })
})
