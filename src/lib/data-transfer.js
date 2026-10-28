export const EXPORT_FORMAT = 'holdings-export'
export const EXPORT_VERSION = 1

const MODULE_KEYS = ['domains', 'servers', 'repos', 'projects', 'accounts', 'subscriptions', 'keys']

export function buildExport(records, now = new Date()) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    records: Object.fromEntries(MODULE_KEYS.map((key) => [key, records[key] || []])),
  }
}

export function parseImport(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }

  // Accept our own export envelope, or a bare { domains: [...], ... } object.
  const records = parsed?.format === EXPORT_FORMAT ? parsed.records : parsed
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new Error('No records found in this file.')
  }

  const known = MODULE_KEYS.filter((key) => key in records)
  if (!known.length) {
    throw new Error('No records found in this file.')
  }

  const result = {}
  for (const key of MODULE_KEYS) {
    const items = records[key] ?? []
    if (!Array.isArray(items)) {
      throw new Error(`"${key}" should be a list.`)
    }
    result[key] = items.filter((item) => item && typeof item === 'object' && item.id)
  }
  return result
}

export function exportFileName(now = new Date()) {
  return `holdings-export-${now.toISOString().slice(0, 10)}.json`
}

const MODULE_LABELS = { domains: 'Domain', servers: 'Server', repos: 'Repo', projects: 'Project', accounts: 'Account', subscriptions: 'Subscription', keys: 'Key or card' }

/**
 * Anything in an import that looks like a real key, token or card number.
 * Holdings never stores secrets, so such a file is refused, not cleaned up
 * silently.
 */
export function findImportSecrets(records, findSecretsInRecord) {
  return MODULE_KEYS.flatMap((key) => (records[key] ?? []).flatMap((record) =>
    findSecretsInRecord(record).map((hit) => ({ module: MODULE_LABELS[key], name: String(record.name ?? record.id), field: hit.field, kind: hit.kind }))))
}
