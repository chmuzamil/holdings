import { addChanges, diffSnapshots, mergeSnapshot, snapshotFromLookup } from '@holdings/core'

const RECENT_DAYS = 14

/**
 * Applies a fresh DNS/registry lookup to a domain record: stores the lookup,
 * updates the watched snapshot and adds any changes to its history. The
 * domain's previous lookup is the starting point, so even the first check
 * after an upgrade can show what changed.
 */
export function applyLookup(domain, lookup) {
  const previous = domain.watch?.snapshot ?? snapshotFromLookup(domain.lookup)
  const next = snapshotFromLookup(lookup)
  if (!next) return { domain: { ...domain, lookup }, changes: [], firstCheck: !previous }
  const changes = diffSnapshots(domain.name, previous, next)
  return {
    domain: {
      ...domain,
      lookup,
      watch: { snapshot: mergeSnapshot(previous, next), changes: addChanges(domain.watch?.changes ?? [], changes) },
    },
    changes,
    firstCheck: !previous,
  }
}

/** A domain's watch data from storage or an import, or undefined if it isn't usable. */
export function normalizeWatch(watch) {
  if (!watch || typeof watch !== 'object' || !watch.snapshot || !Array.isArray(watch.changes)) return undefined
  return { snapshot: watch.snapshot, changes: watch.changes.filter((change) => change && change.id && change.at).slice(0, 20) }
}

/** Every change for a domain: from manual checks here and, self-hosted, from the server's scheduled checks. */
export function domainChanges(domain, serverChanges = {}) {
  const all = [...(domain.watch?.changes ?? []), ...(serverChanges[domain.name] ?? [])]
  const seen = new Set()
  return all
    .filter((change) => (seen.has(change.id) ? false : seen.add(change.id)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)
}

/** High-severity changes in the last two weeks, for the Attention list. */
export function recentHighChanges(domain, serverChanges = {}, now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString()
  return domainChanges(domain, serverChanges).filter((change) => change.severity === 'high' && change.at >= cutoff)
}
