import { readFile, stat } from 'node:fs/promises'
import { DATA_VERSION, fromV1, isV1Records, type HoldingsData, type V1Records } from '@holdings/core'

const EXPORT_FORMAT = 'holdings-export'

/**
 * Turns the contents of a Holdings export (Settings → Export JSON) into the
 * data model. Also accepts bare v1 records or v2 data.
 */
export function parseHoldings(text: string): HoldingsData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }
  return toHoldings(parsed)
}

function toHoldings(parsed: unknown): HoldingsData {
  const value = parsed as { format?: unknown; records?: unknown; version?: unknown }
  if (value && value.version === DATA_VERSION && Array.isArray((value as HoldingsData).assets)) return value as HoldingsData
  const records = value?.format === EXPORT_FORMAT ? value.records : parsed
  if (!isV1Records(records)) throw new Error('No Holdings records found. Export them from Settings → Export JSON.')
  // Same rule as the app: a cost still in another currency is left out of totals.
  return fromV1(records as V1Records, {
    costUsd: (record) => (record.currency && record.currency !== 'USD' ? 0 : Number(record.cost) || 0),
  })
}

/** Reads the export file, re-reading it only when it changes on disk. */
export function fileSource(path: string) {
  let cached: { mtimeMs: number; size: number; data: HoldingsData } | null = null
  return async function load(): Promise<HoldingsData> {
    const info = await stat(path).catch(() => {
      throw new Error(`Can't find ${path}. Export your data from Settings → Export JSON and point --file at it.`)
    })
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.data
    const data = parseHoldings(await readFile(path, 'utf8'))
    cached = { mtimeMs: info.mtimeMs, size: info.size, data }
    return data
  }
}

const SERVER_CACHE_MS = 30_000

/** Returns an error message, or '' if the URL is fine to send a token to. */
export function checkServerUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `"${value}" is not a URL. Use the address you open Holdings at, like https://holdings.example.com.`
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return 'Use an https:// address, so the access token isn’t sent in the clear.'
  }
  return ''
}

/**
 * Reads live data from a self-hosted Holdings server with a read-only access
 * token (Settings → Access tokens). Cached briefly so a burst of tool calls
 * makes one request.
 */
export function serverSource(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch, now = () => Date.now()) {
  const endpoint = new URL('/api/data', baseUrl).toString()
  let cached: { at: number; data: HoldingsData } | null = null
  return async function load(): Promise<HoldingsData> {
    if (cached && now() - cached.at < SERVER_CACHE_MS) return cached.data
    let response: Response
    try {
      response = await fetchImpl(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
    } catch {
      throw new Error(`Can't reach ${baseUrl}. Is the server running?`)
    }
    if (response.status === 401) throw new Error('The server didn’t accept the access token. Create a new one in Settings → Access tokens.')
    if (!response.ok) throw new Error(`The server answered ${response.status}.`)
    const body = (await response.json()) as { data?: { records?: unknown } | null }
    if (!body.data?.records) throw new Error('Nothing is saved on the server yet.')
    const data = toHoldings(body.data.records)
    cached = { at: now(), data }
    return data
  }
}
