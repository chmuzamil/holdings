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
