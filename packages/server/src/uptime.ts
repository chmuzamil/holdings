import type { Store } from './db'
import { SettingsError } from './notify'
import type { FetchLike } from './stripe'

// Optional: shows up/down from your own Uptime Kuma or Gatus next to servers,
// domains and projects. Reads the public status page (no login, no API key)
// from this server, since browsers can't read another site's API. Off until
// turned on.

export type UptimeKind = 'kuma' | 'gatus'
export type MonitorStatus = 'up' | 'down' | 'pending' | 'maintenance' | 'unknown'

export interface Monitor {
  /** Stable across checks: kind plus the monitor's id or key. */
  key: string
  name: string
  group: string
  status: MonitorStatus
  /** When the latest result was recorded. */
  checkedAt: string | null
  /** Share of recent checks that passed (0–1), when the source gives it. */
  uptime: number | null
}

interface Settings {
  enabled: boolean
  kind: UptimeKind
  url: string
  /** Kuma only: the status page's slug. */
  slug: string
  /** Monitor key → Holdings item id. */
  links: Record<string, string>
}

const DEFAULTS: Settings = { enabled: false, kind: 'kuma', url: '', slug: '', links: {} }
const SETTINGS_KEY = 'uptime'
const CACHE_MS = 60_000
const TIMEOUT_MS = 10_000

const KUMA_STATUS: Record<number, MonitorStatus> = { 0: 'down', 1: 'up', 2: 'pending', 3: 'maintenance' }

/** Kuma times are UTC, either "2026-10-29 08:00:00.000" or ISO with a zone. Never throws. */
function kumaTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Uptime Kuma: the status page (groups and monitors) plus its heartbeats. */
export function readKuma(page: any, heartbeat: any): Monitor[] {
  const beats = heartbeat?.heartbeatList ?? {}
  const uptimes = heartbeat?.uptimeList ?? {}
  return (page?.publicGroupList ?? []).flatMap((group: any) =>
    (group.monitorList ?? []).map((monitor: any) => {
      const list = beats[monitor.id] ?? beats[String(monitor.id)] ?? []
      const latest = list[list.length - 1]
      const uptime = uptimes[`${monitor.id}_24`]
      return {
        key: `kuma:${monitor.id}`,
        name: String(monitor.name ?? `Monitor ${monitor.id}`),
        group: String(group.name ?? ''),
        status: latest ? KUMA_STATUS[latest.status] ?? 'unknown' : 'unknown',
        checkedAt: kumaTime(latest?.time),
        uptime: typeof uptime === 'number' ? uptime : null,
      }
    }),
  )
}

/** Gatus: every endpoint with its recent results. */
export function readGatus(statuses: any): Monitor[] {
  return (Array.isArray(statuses) ? statuses : []).map((endpoint: any) => {
    const results = [...(endpoint.results ?? [])].sort((a: any, b: any) => String(a.timestamp).localeCompare(String(b.timestamp)))
    const latest = results[results.length - 1]
    return {
      key: `gatus:${endpoint.key ?? `${endpoint.group ?? ''}_${endpoint.name}`}`,
      name: String(endpoint.name ?? endpoint.key),
      group: String(endpoint.group ?? ''),
      status: latest ? (latest.success ? 'up' : 'down') : 'unknown',
      checkedAt: latest?.timestamp ? new Date(latest.timestamp).toISOString() : null,
      uptime: results.length ? results.filter((result: any) => result.success).length / results.length : null,
    }
  })
}

async function getJson(fetchImpl: FetchLike, url: string) {
  let response: Response
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new SettingsError(`Couldn’t reach ${new URL(url).origin}.`)
  }
  if (response.status === 404) throw new SettingsError('Nothing found there. Check the address and the status page name.')
  if (!response.ok) throw new SettingsError(`It answered ${response.status}.`)
  try {
    return await response.json()
  } catch {
    throw new SettingsError('That address didn’t answer like a status page.')
  }
}

export async function fetchMonitors(settings: Pick<Settings, 'kind' | 'url' | 'slug'>, fetchImpl: FetchLike): Promise<Monitor[]> {
  const base = settings.url.replace(/\/+$/, '')
  if (settings.kind === 'gatus') return readGatus(await getJson(fetchImpl, `${base}/api/v1/endpoints/statuses`))
  const slug = encodeURIComponent(settings.slug)
  const [page, heartbeat] = await Promise.all([
    getJson(fetchImpl, `${base}/api/status-page/${slug}`),
    getJson(fetchImpl, `${base}/api/status-page/heartbeat/${slug}`),
  ])
  return readKuma(page, heartbeat)
}

export function createUptime({ store, fetch: fetchImpl = fetch, now = () => Date.now() }: { store: Store; fetch?: FetchLike; now?: () => number }) {
  const load = (): Settings => ({ ...DEFAULTS, ...(JSON.parse(store.getSetting(SETTINGS_KEY) ?? '{}') as Partial<Settings>) })
  let cache: { at: number; monitors: Monitor[]; error: string } | null = null

  return {
    /** Settings, current monitors and any problem reading them. */
    async status() {
      const settings = load()
      if (!settings.enabled) return { settings, monitors: [], error: '', checkedAt: null }
      if (!cache || now() - cache.at >= CACHE_MS) {
        try {
          cache = { at: now(), monitors: await fetchMonitors(settings, fetchImpl), error: '' }
        } catch (error) {
          // Keep showing the last known monitors, marked unknown, with the problem.
          const monitors = (cache?.monitors ?? []).map((monitor) => ({ ...monitor, status: 'unknown' as const }))
          cache = { at: now(), monitors, error: (error as Error).message }
        }
      }
      return { settings, monitors: cache.monitors, error: cache.error, checkedAt: new Date(cache.at).toISOString() }
    },

    async save(input: Record<string, unknown>) {
      const current = load()
      const next: Settings = { ...current }
      if (input.enabled !== undefined) next.enabled = Boolean(input.enabled)
      if (input.kind === 'kuma' || input.kind === 'gatus') next.kind = input.kind
      if (typeof input.url === 'string') next.url = input.url.trim()
      if (typeof input.slug === 'string') next.slug = input.slug.trim()
      if (input.links && typeof input.links === 'object') {
        const links = Object.entries(input.links as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0 && entry[1].length <= 100)
          .slice(0, 500)
        next.links = Object.fromEntries(links)
      }
      if (next.enabled) {
        let url: URL
        try {
          url = new URL(next.url)
        } catch {
          throw new SettingsError('Enter the full address of your status page, like https://status.example.com.')
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new SettingsError('The address must start with https://')
        next.url = url.origin + url.pathname.replace(/\/+$/, '')
        if (next.kind === 'kuma' && !/^[A-Za-z0-9_-]{1,64}$/.test(next.slug)) {
          throw new SettingsError('Enter the status page name: the last part of its address, after /status/.')
        }
        // Check it answers before keeping it, unless only the links changed.
        if (!current.enabled || next.url !== current.url || next.kind !== current.kind || next.slug !== current.slug) {
          const monitors = await fetchMonitors(next, fetchImpl)
          store.setSetting(SETTINGS_KEY, JSON.stringify(next))
          cache = { at: now(), monitors, error: '' }
          return this.status()
        }
      } else {
        cache = null
      }
      store.setSetting(SETTINGS_KEY, JSON.stringify(next))
      return this.status()
    },
  }
}

export type Uptime = ReturnType<typeof createUptime>
