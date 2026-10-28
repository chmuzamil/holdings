// Domain change watch. Each DNS/registry check is reduced to a snapshot of
// the things that matter if someone tampers with a domain; comparing it with
// the previous snapshot gives the changes. Used by the app (manual checks)
// and the self-hosted server (scheduled checks).

export interface DomainSnapshot {
  nameservers: string[]
  /** Registry status flags, e.g. "client transfer prohibited". */
  status: string[]
  /** Registry expiry date (YYYY-MM-DD), or '' when unknown. */
  expires: string
  dnssec: boolean | null
  transferLock: boolean | null
  checkedAt: string
}

export type ChangeField = 'nameservers' | 'status' | 'expires' | 'dnssec' | 'transferLock'

export interface DomainChange {
  /** Stable for the same change, so it is never recorded or sent twice. */
  id: string
  field: ChangeField
  before: string
  after: string
  severity: 'high' | 'normal'
  /** When the check that found it ran. */
  at: string
  /** Plain-language summary. */
  message: string
}

export const MAX_CHANGES = 20

const clean = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\.$/, '')
const list = (values: unknown): string[] => (Array.isArray(values) ? [...new Set(values.map(clean).filter(Boolean))].sort() : [])

/**
 * The parts of a lookup (as returned by the lookup API) worth watching.
 * Fields the registry didn't answer are left unknown (empty or null).
 */
export function snapshotFromLookup(lookup: any): DomainSnapshot | null {
  if (!lookup?.checkedAt) return null
  const whois = lookup.whois && !lookup.whois.error ? lookup.whois : null
  const dnsNameservers = list(lookup.dns?.ns?.value)
  const status = whois ? list(whois.status) : []
  return {
    nameservers: dnsNameservers.length ? dnsNameservers : list(whois?.nameservers),
    status,
    expires: whois?.expires ? String(whois.expires).slice(0, 10) : '',
    dnssec: typeof whois?.dnssec === 'boolean' ? whois.dnssec : null,
    transferLock: whois ? status.some((flag) => flag.includes('transfer prohibited')) : null,
    checkedAt: String(lookup.checkedAt),
  }
}

/**
 * Keeps the last known value of anything this check couldn't see (a
 * registry that didn't answer must not look like "lock removed").
 */
export function mergeSnapshot(previous: DomainSnapshot | null, next: DomainSnapshot): DomainSnapshot {
  if (!previous) return next
  return {
    nameservers: next.nameservers.length ? next.nameservers : previous.nameservers,
    status: next.status.length ? next.status : previous.status,
    expires: next.expires || previous.expires,
    dnssec: next.dnssec ?? previous.dnssec,
    transferLock: next.transferLock ?? previous.transferLock,
    checkedAt: next.checkedAt,
  }
}

const show = (values: string[]) => values.join(', ') || 'none'
const onOff = (value: boolean | null) => (value === null ? 'unknown' : value ? 'on' : 'off')

/** What changed between two snapshots. Nothing is reported on the first check. */
export function diffSnapshots(domain: string, previous: DomainSnapshot | null, next: DomainSnapshot): DomainChange[] {
  if (!previous) return []
  const merged = mergeSnapshot(previous, next)
  const changes: DomainChange[] = []
  const add = (field: ChangeField, before: string, after: string, severity: DomainChange['severity'], message: string) => {
    changes.push({ id: `${domain}|${field}|${before}|${after}|${merged.checkedAt}`, field, before, after, severity, at: merged.checkedAt, message })
  }

  if (previous.nameservers.length && show(previous.nameservers) !== show(merged.nameservers)) {
    add('nameservers', show(previous.nameservers), show(merged.nameservers), 'high', `Nameservers changed from ${show(previous.nameservers)} to ${show(merged.nameservers)}.`)
  }
  if (previous.transferLock === true && merged.transferLock === false) {
    add('transferLock', 'on', 'off', 'high', 'Transfer lock was removed. Someone could move the domain away.')
  } else if (previous.transferLock === false && merged.transferLock === true) {
    add('transferLock', 'off', 'on', 'normal', 'Transfer lock was turned on.')
  }
  // Other registry flags. The lock is reported above on its own, and "active"
  // or "ok" only mean nothing unusual, so they don't count as a change.
  const flags = (values: string[]) => values.filter((flag) => !flag.includes('transfer prohibited') && flag !== 'active' && flag !== 'ok')
  if (previous.status.length && show(flags(previous.status)) !== show(flags(merged.status))) {
    add('status', show(flags(previous.status)), show(flags(merged.status)), 'high', `Registry status changed from ${show(flags(previous.status))} to ${show(flags(merged.status))}.`)
  }
  if (previous.expires && merged.expires && previous.expires !== merged.expires) {
    const later = merged.expires > previous.expires
    add('expires', previous.expires, merged.expires, later ? 'normal' : 'high', later ? `Renewed: now expires ${merged.expires} (was ${previous.expires}).` : `Expiry date moved earlier, to ${merged.expires} (was ${previous.expires}).`)
  }
  if (previous.dnssec !== null && merged.dnssec !== null && previous.dnssec !== merged.dnssec) {
    add('dnssec', onOff(previous.dnssec), onOff(merged.dnssec), 'normal', `DNSSEC turned ${onOff(merged.dnssec)}.`)
  }
  return changes
}

/** Adds new changes to a history (newest first), without repeats, keeping the last 20. */
export function addChanges(history: DomainChange[], changes: DomainChange[]): DomainChange[] {
  const seen = new Set(history.map((change) => change.id))
  return [...changes.filter((change) => !seen.has(change.id)), ...history]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_CHANGES)
}

/** Changes not yet sent, given the ids already sent. */
export function unsentChanges(changes: DomainChange[], sent: Set<string>): DomainChange[] {
  return changes.filter((change) => !sent.has(change.id))
}
