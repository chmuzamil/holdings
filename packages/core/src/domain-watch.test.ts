import { describe, expect, it } from 'vitest'
import { addChanges, diffSnapshots, MAX_CHANGES, mergeSnapshot, snapshotFromLookup, unsentChanges, type DomainChange, type DomainSnapshot } from './domain-watch'

function lookup({ ns = ['ns1.dns.example.', 'NS2.dns.example'], status = ['client transfer prohibited', 'active'], expires = '2027-06-01T00:00:00Z', dnssec = true as boolean | null, at = '2026-10-01T09:00:00.000Z', whoisError = false } = {}) {
  return {
    checkedAt: at,
    dns: { ns: { value: ns } },
    whois: whoisError ? { error: 'The registry could not be reached.' } : { status, expires, dnssec, nameservers: ns },
  }
}
const base = snapshotFromLookup(lookup()) as DomainSnapshot
const later = (overrides: Parameters<typeof lookup>[0]) => snapshotFromLookup(lookup({ at: '2026-10-08T09:00:00.000Z', ...overrides })) as DomainSnapshot

describe('snapshotFromLookup', () => {
  it('keeps what matters, normalised', () => {
    expect(base).toEqual({
      nameservers: ['ns1.dns.example', 'ns2.dns.example'],
      status: ['active', 'client transfer prohibited'],
      expires: '2027-06-01',
      dnssec: true,
      transferLock: true,
      checkedAt: '2026-10-01T09:00:00.000Z',
    })
  })

  it('leaves registry fields unknown when the registry did not answer', () => {
    expect(snapshotFromLookup(lookup({ whoisError: true }))).toMatchObject({ status: [], expires: '', dnssec: null, transferLock: null })
    expect(snapshotFromLookup({})).toBeNull()
  })
})

describe('diffSnapshots', () => {
  const fields = (changes: DomainChange[]) => changes.map((change) => [change.field, change.severity])

  it('reports nothing on the first check, or when nothing changed', () => {
    expect(diffSnapshots('shop.example', null, base)).toEqual([])
    expect(diffSnapshots('shop.example', base, later({}))).toEqual([])
  })

  it('treats nameserver changes, status changes and lock removal as high severity', () => {
    expect(fields(diffSnapshots('shop.example', base, later({ ns: ['ns1.evil.example', 'ns2.evil.example'] })))).toEqual([['nameservers', 'high']])
    expect(fields(diffSnapshots('shop.example', base, later({ status: ['client transfer prohibited', 'client hold'] })))).toEqual([['status', 'high']])
    const unlocked = diffSnapshots('shop.example', base, later({ status: ['active'] }))
    expect(fields(unlocked)).toEqual([['transferLock', 'high']])
    expect(unlocked[0]?.message).toMatch(/Transfer lock was removed/)
  })

  it('treats renewals and DNSSEC as normal, but an earlier expiry as high', () => {
    expect(fields(diffSnapshots('shop.example', base, later({ expires: '2028-06-01T00:00:00Z' })))).toEqual([['expires', 'normal']])
    expect(fields(diffSnapshots('shop.example', base, later({ expires: '2026-12-01T00:00:00Z' })))).toEqual([['expires', 'high']])
    expect(fields(diffSnapshots('shop.example', base, later({ dnssec: false })))).toEqual([['dnssec', 'normal']])
  })

  it('does not mistake a registry that did not answer for a removed lock', () => {
    expect(diffSnapshots('shop.example', base, later({ whoisError: true }))).toEqual([])
    expect(mergeSnapshot(base, later({ whoisError: true }))).toMatchObject({ transferLock: true, expires: '2027-06-01', status: base.status })
  })

  it('gives the same change the same id', () => {
    const next = later({ ns: ['ns1.evil.example'] })
    expect(diffSnapshots('shop.example', base, next)[0]?.id).toBe(diffSnapshots('shop.example', base, next)[0]?.id)
    expect(diffSnapshots('shop.example', base, next)[0]?.id).not.toBe(diffSnapshots('other.example', base, next)[0]?.id)
  })
})

describe('history and dedupe', () => {
  const change = (n: number): DomainChange => ({
    id: `c${n}`, field: 'nameservers', before: 'a', after: 'b', severity: 'high', message: '', at: `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z`,
  })

  it('keeps the newest 20, newest first, and never adds a change twice', () => {
    let history: DomainChange[] = []
    for (let n = 1; n <= 25; n += 1) history = addChanges(history, [change(n)])
    history = addChanges(history, [change(25)])
    expect(history).toHaveLength(MAX_CHANGES)
    expect(history[0]?.id).toBe('c25')
    expect(history.at(-1)?.id).toBe('c6')
  })

  it('finds what has not been sent yet', () => {
    expect(unsentChanges([change(1), change(2)], new Set(['c1'])).map((item) => item.id)).toEqual(['c2'])
  })
})

describe('status flags that mean nothing unusual', () => {
  it('does not report a lock removal twice, or "active" appearing as a status change', () => {
    const changes = diffSnapshots('shop.example', base, later({ status: ['active'] }))
    expect(changes.map((change) => change.field)).toEqual(['transferLock'])
  })
})
