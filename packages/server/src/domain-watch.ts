import { addChanges, diffSnapshots, mergeSnapshot, snapshotFromLookup, unsentChanges, type DomainChange, type DomainSnapshot } from '@holdings/core'
import type { Store } from './db'
import { SettingsError, type Notifier } from './notify'

// Scheduled domain change watch (self-hosted, off until turned on). Runs the
// same DNS/registry lookup as the manual check on every domain, keeps its own
// snapshots and change history (so it never edits the owner's saved data),
// and sends new changes once to every notification channel that is on.

export const INTERVAL_HOURS = [6, 12, 24, 72, 168]
const SETTINGS_KEY = 'domain_watch'
const STATE_KEY = 'domain_watch_state'
const SENT_KEY = 'domain_watch_sent'
const HOUR_MS = 60 * 60 * 1000

interface Settings {
  enabled: boolean
  intervalHours: number
}

interface State {
  lastRunAt: string | null
  domains: Record<string, { snapshot: DomainSnapshot; changes: DomainChange[] }>
}

export function createDomainWatch({ store, notifier, lookup, now = () => Date.now() }: {
  store: Store
  notifier: Notifier
  lookup: (domain: string) => Promise<unknown>
  now?: () => number
}) {
  const settings = (): Settings => ({ enabled: false, intervalHours: 24, ...(JSON.parse(store.getSetting(SETTINGS_KEY) ?? '{}') as Partial<Settings>) })
  const state = (): State => ({ lastRunAt: null, domains: {}, ...(JSON.parse(store.getSetting(STATE_KEY) ?? '{}') as Partial<State>) })

  function domainNames(): string[] {
    try {
      const body = JSON.parse(store.getData()?.body ?? '{}') as { records?: { domains?: { name?: unknown; status?: unknown }[] } }
      return [...new Set((body.records?.domains ?? [])
        .filter((domain) => domain.status !== 'Cancelled')
        .map((domain) => String(domain.name ?? '').trim().toLowerCase())
        .filter(Boolean))]
    } catch {
      return []
    }
  }

  function view() {
    const current = state()
    return {
      settings: settings(),
      lastRunAt: current.lastRunAt,
      changes: Object.fromEntries(Object.entries(current.domains).map(([name, entry]) => [name, entry.changes])),
    }
  }

  return {
    view,

    save(input: Record<string, unknown>) {
      const next = settings()
      if (input.enabled !== undefined) next.enabled = Boolean(input.enabled)
      if (input.intervalHours !== undefined) {
        if (!INTERVAL_HOURS.includes(Number(input.intervalHours))) throw new SettingsError('Check every 6, 12 or 24 hours, 3 days or a week.')
        next.intervalHours = Number(input.intervalHours)
      }
      store.setSetting(SETTINGS_KEY, JSON.stringify(next))
      return view()
    },

    /** Checks every domain once and sends what changed. */
    async run() {
      const current = state()
      const found: DomainChange[] = []
      const failed: string[] = []
      for (const name of domainNames()) {
        let snapshot: DomainSnapshot | null = null
        try {
          snapshot = snapshotFromLookup(await lookup(name))
        } catch {
          snapshot = null
        }
        if (!snapshot) {
          failed.push(name)
          continue
        }
        const previous = current.domains[name]?.snapshot ?? null
        const changes = diffSnapshots(name, previous, snapshot)
        current.domains[name] = {
          snapshot: mergeSnapshot(previous, snapshot),
          changes: addChanges(current.domains[name]?.changes ?? [], changes),
        }
        found.push(...changes.map((change) => ({ ...change, message: `${name}: ${change.message}` })))
      }
      current.lastRunAt = new Date(now()).toISOString()
      store.setSetting(STATE_KEY, JSON.stringify(current))

      const sent = new Set<string>(JSON.parse(store.getSetting(SENT_KEY) ?? '[]'))
      const fresh = unsentChanges(found, sent).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
      let failures: string[] = []
      if (fresh.length) {
        const high = fresh.filter((change) => change.severity === 'high').length
        const result = await notifier.broadcast({
          title: high ? `Domain alert: ${high} important ${high === 1 ? 'change' : 'changes'}` : `${fresh.length} domain ${fresh.length === 1 ? 'change' : 'changes'}`,
          lines: fresh.map((change) => `${change.severity === 'high' ? '⚠ ' : '• '}${change.message}`),
        })
        failures = result.failures
        // Mark as handled unless every channel failed (then try again next time).
        // With no channels on, they are kept in the history but not queued up.
        if (result.channels === 0 || failures.length < result.channels) {
          fresh.forEach((change) => sent.add(change.id))
          store.setSetting(SENT_KEY, JSON.stringify([...sent].slice(-2000)))
        }
      }
      return { checked: Object.keys(current.domains).length, changes: found.length, notified: fresh.length && failures.length === 0 ? fresh.length : 0, failed, failures }
    },

    start(tickMs = 15 * 60 * 1000) {
      const tick = () => {
        const current = settings()
        if (!current.enabled) return
        const last = Date.parse(state().lastRunAt ?? '1970-01-01')
        if (now() - last < current.intervalHours * HOUR_MS) return
        this.run().catch((error) => console.error('Domain watch failed:', error))
      }
      tick()
      const timer = setInterval(tick, tickMs)
      timer.unref()
      return () => clearInterval(timer)
    },
  }
}

export type DomainWatch = ReturnType<typeof createDomainWatch>
