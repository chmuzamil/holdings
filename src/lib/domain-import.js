// Shared by the Cloudflare and registrar imports: applies the preview rows
// the owner chose.

/** New domains get ids and dates; updates only change what the row's patch says. */
export function applyDomainImport(domains, rows, now = new Date()) {
  const stamp = now.toISOString()
  const updates = new Map(rows.filter((row) => row.status === 'update').map((row) => [row.id, row.patch]))
  const updated = domains.map((domain) => (updates.has(domain.id) ? { ...domain, ...updates.get(domain.id), editedAt: stamp } : domain))
  const added = rows
    .filter((row) => row.status === 'add')
    .map((row) => ({ ...row.record, id: `domains-${crypto.randomUUID()}`, addedAt: stamp, editedAt: stamp }))
  return [...added, ...updated]
}

/** Domains by name, ignoring case and a leading www. */
export function domainsByName(domains = []) {
  return new Map(domains.map((domain) => [String(domain.name).toLowerCase().replace(/^www\./, ''), domain]))
}

/** What an import did, in one sentence. */
export function importedMessage(rows) {
  const added = rows.filter((row) => row.status === 'add').length
  const filled = rows.length - added
  const done = [added && `added ${added} ${added === 1 ? 'domain' : 'domains'}`, filled && `updated ${filled}`].filter(Boolean).join(' and ')
  return `Done: ${done}.${added ? ' Add what each one costs on the Domains page.' : ''}`
}
