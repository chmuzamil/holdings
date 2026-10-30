// Shared by the Cloudflare, registrar and server-host imports: applies the
// preview rows the owner chose.

/** New records get ids and dates; updates only change what the row's patch says. */
export function applyImport(records, rows, moduleKey, now = new Date()) {
  const stamp = now.toISOString()
  const updates = new Map(rows.filter((row) => row.status === 'update').map((row) => [row.id, row.patch]))
  const updated = records.map((record) => (updates.has(record.id) ? { ...record, ...updates.get(record.id), editedAt: stamp } : record))
  const added = rows
    .filter((row) => row.status === 'add')
    .map((row) => ({ ...row.record, id: `${moduleKey}-${crypto.randomUUID()}`, addedAt: stamp, editedAt: stamp }))
  return [...added, ...updated]
}

export const applyDomainImport = (domains, rows, now) => applyImport(domains, rows, 'domains', now)

/** Domains by name, ignoring case and a leading www. */
export function domainsByName(domains = []) {
  return new Map(domains.map((domain) => [String(domain.name).toLowerCase().replace(/^www\./, ''), domain]))
}

/** What an import did, in one sentence. */
export function importedMessage(rows, noun = 'domain') {
  const added = rows.filter((row) => row.status === 'add').length
  const filled = rows.length - added
  const done = [added && `added ${added} ${added === 1 ? noun : `${noun}s`}`, filled && `updated ${filled}`].filter(Boolean).join(' and ')
  // Domain imports can't know the price, so new domains still need one.
  const costHint = added && noun === 'domain' ? ' Add what each one costs on the Domains page.' : ''
  return `Done: ${done}.${costHint}`
}
