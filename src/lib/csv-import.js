import { csvCell } from './csv'
import { findSecret } from './secrets'

// CSV import for domains, subscriptions and servers: map columns to fields,
// check every row, and say what will be added, skipped as a duplicate, or
// rejected (and why) before anything changes. Costs are in US dollars, like
// everywhere in Holdings.

const STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Cancelled']

export const IMPORT_TYPES = {
  domains: {
    label: 'Domains',
    one: 'domain',
    fields: [
      { key: 'name', label: 'Domain', required: true, aliases: ['domain', 'domain name', 'name', 'hostname'] },
      { key: 'provider', label: 'Registrar', aliases: ['registrar', 'provider'] },
      { key: 'cost', label: 'Yearly cost (USD)', aliases: ['cost', 'price', 'yearly cost', 'renewal price', 'amount'] },
      { key: 'renewalDate', label: 'Renewal date', aliases: ['renewal date', 'renewal', 'renews', 'renew date', 'next renewal'] },
      { key: 'expiryDate', label: 'Expiry date', aliases: ['expiry date', 'expiry', 'expires', 'expiration', 'expiration date'] },
      { key: 'status', label: 'Status', aliases: ['status', 'state'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
    ],
    example: ['shop.example', 'Porkbun', '12', '2027-03-14', '', 'Active', 'Main domain'],
  },
  subscriptions: {
    label: 'Subscriptions',
    one: 'subscription',
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['name', 'service', 'subscription', 'product'] },
      { key: 'provider', label: 'Provider', aliases: ['provider', 'vendor', 'company'] },
      { key: 'cost', label: 'Monthly cost (USD)', aliases: ['cost', 'price', 'monthly cost', 'amount', 'monthly'] },
      { key: 'renewalDate', label: 'Renewal date', aliases: ['renewal date', 'renewal', 'renews', 'next payment', 'next billing date', 'billing date'] },
      { key: 'status', label: 'Status', aliases: ['status', 'state'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
    ],
    example: ['Postmark', 'Postmark', '15', '2026-11-10', 'Active', 'Transactional email'],
  },
  servers: {
    label: 'Servers',
    one: 'server',
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['name', 'server', 'hostname', 'label'] },
      { key: 'provider', label: 'Provider', aliases: ['provider', 'host', 'hosting', 'company'] },
      { key: 'ipAddress', label: 'IP address', aliases: ['ip', 'ip address', 'ipv4', 'address'] },
      { key: 'cost', label: 'Monthly cost (USD)', aliases: ['cost', 'price', 'monthly cost', 'amount', 'monthly'] },
      { key: 'renewalDate', label: 'Renewal date', aliases: ['renewal date', 'renewal', 'renews', 'next payment'] },
      { key: 'status', label: 'Status', aliases: ['status', 'state'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
    ],
    example: ['Main VPS', 'Hetzner', '203.0.113.10', '10', '2026-12-01', 'Active', 'Runs the shop'],
  },
}

const normal = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Field key → column index, guessed from the header row. -1 means not in the file. */
export function guessMapping(headers, type) {
  const taken = new Set()
  return Object.fromEntries(IMPORT_TYPES[type].fields.map((field) => {
    const index = headers.findIndex((header, column) => !taken.has(column) && [field.key.toLowerCase(), ...field.aliases].includes(normal(header)))
    if (index >= 0) taken.add(index)
    return [field.key, index]
  }))
}

/** "YYYY-MM-DD" from common spellings; null if it can't be read without guessing. */
export function parseDate(value) {
  const text = String(value).trim()
  if (!text) return ''
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(text)
  if (!iso) return null
  const [, year, month, day] = iso
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null
  return date.toISOString().slice(0, 10)
}

export function parseCost(value) {
  const text = String(value).trim().replace(/^(usd|us\$|\$)\s*/i, '').replace(/\s*(usd)$/i, '').replace(/,(?=\d{3}\b)/g, '')
  if (!text) return 0
  const number = Number(text)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null
}

function parseStatus(value) {
  const text = String(value).trim().toLowerCase()
  if (!text) return 'Active'
  return STATUSES.find((status) => status.toLowerCase() === text) ?? null
}

const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/

/** The key two records share when they are the same thing. */
export function duplicateKey(type, record) {
  if (type === 'domains') return String(record.name).toLowerCase().replace(/^www\./, '')
  if (type === 'subscriptions') return [String(record.name).toLowerCase().trim(), Number(record.cost || 0), record.renewalDate || ''].join('|')
  return [String(record.name).toLowerCase().trim(), String(record.ipAddress || '').trim()].join('|')
}

/**
 * Checks every row against the mapping. Returns each row's record (when
 * valid), its problems, and whether it will be added, skipped as a
 * duplicate, or rejected; plus a summary.
 */
export function previewImport(rows, mapping, type, existing = []) {
  const { fields } = IMPORT_TYPES[type]
  const known = new Set(existing.map((record) => duplicateKey(type, record)))
  const seenInFile = new Set()
  const result = rows.map((cells, index) => {
    const errors = []
    const record = {}
    const value = (key) => (mapping[key] >= 0 ? String(cells[mapping[key]] ?? '').trim() : '')

    // Never import anything that looks like a real key, token or card number.
    cells.forEach((cell, column) => {
      const secret = findSecret(String(cell))
      if (secret) {
        const field = fields.find((item) => mapping[item.key] === column)
        errors.push(`${field ? field.label : `Column ${column + 1}`} looks like it contains a ${secret}. Holdings never stores secrets; remove it from the file.`)
      }
    })

    for (const field of fields) {
      const raw = value(field.key)
      if (field.required && !raw) {
        errors.push(`${field.label} is empty.`)
        continue
      }
      if (field.key === 'cost') {
        const cost = parseCost(raw)
        if (cost === null) errors.push(`${field.label} "${raw}" isn't a number.`)
        else record.cost = cost
      } else if (field.key === 'renewalDate' || field.key === 'expiryDate') {
        const date = parseDate(raw)
        if (date === null) errors.push(`${field.label} "${raw}" isn't a date. Use YYYY-MM-DD.`)
        else record[field.key] = date
      } else if (field.key === 'status') {
        const status = parseStatus(raw)
        if (!status) errors.push(`Status "${raw}" should be one of ${STATUSES.join(', ')}.`)
        else record.status = status
      } else {
        record[field.key] = raw
      }
    }
    if (type === 'domains' && record.name) {
      record.name = record.name.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
      if (!DOMAIN.test(record.name)) errors.push(`"${record.name}" isn't a domain name.`)
    }

    let status = errors.length ? 'invalid' : 'add'
    if (status === 'add') {
      const key = duplicateKey(type, record)
      if (known.has(key)) status = 'duplicate'
      else if (seenInFile.has(key)) status = 'duplicate-in-file'
      seenInFile.add(key)
    }
    return { line: index + 2, record: status === 'add' ? record : null, raw: record, errors, status }
  })
  const count = (status) => result.filter((row) => row.status === status).length
  return {
    rows: result,
    summary: { add: count('add'), duplicate: count('duplicate') + count('duplicate-in-file'), invalid: count('invalid') },
  }
}

/** A template with the header row and one made-up example. */
export function templateCsv(type) {
  const { fields, example } = IMPORT_TYPES[type]
  return `${fields.map((field) => csvCell(field.label)).join(',')}\r\n${example.map(csvCell).join(',')}\r\n`
}

/** "1 domain", "3 domains". */
export function countLabel(type, count) {
  const item = IMPORT_TYPES[type]
  return `${count} ${count === 1 ? item.one : item.label.toLowerCase()}`
}
