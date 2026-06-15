import { normalizeDomainHealth } from './domain-health-helpers'

export function normalizeSubdomains(record) {
  if (Array.isArray(record.subdomains)) {
    return record.subdomains.map((sub) => ({
      id: sub.id || `sub-${crypto.randomUUID()}`,
      name: sub.name || '',
      serverId: sub.serverId || '',
      notes: sub.notes || '',
    }))
  }

  const legacyServerId = record.serverId || ''
  const names = String(record.subdomains || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!names.length) return []

  return names.map((name) => ({
    id: `sub-${crypto.randomUUID()}`,
    name,
    serverId: legacyServerId,
    notes: '',
  }))
}

export function daysUntil(value) {
  if (!value) return null
  const today = new Date()
  const target = new Date(`${value}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

export function getCountdownLabel(record) {
  const days = daysUntil(record.expiryDate || record.renewalDate)
  if (days === null) return 'No date set'
  if (days < 0) return `${Math.abs(days)} days overdue`
  return `${days} days left`
}

export function getCountdownVariant(record) {
  const days = daysUntil(record.expiryDate || record.renewalDate)
  if (record.status === 'Expired' || (days !== null && days < 0)) return 'expired'
  if (days === null) return 'outline'
  if (days < 30) return 'danger'
  if (days <= 90) return 'warning'
  return 'success'
}

export function countDnsRecords(lookup) {
  if (!lookup?.dns) return 0
  return Object.values(lookup.dns).reduce((sum, entry) => {
    if (!entry?.value) return sum
    if (Array.isArray(entry.value)) return sum + entry.value.length
    return sum + 1
  }, 0)
}

export function flattenDnsRecords(lookup) {
  if (!lookup?.dns) return []

  const rows = []
  const pushRows = (type, host, values, ttl = '—') => {
    values.forEach((value) => {
      rows.push({ type, host, value: String(value), ttl })
    })
  }

  const dns = lookup.dns

  if (dns.a?.value?.length) pushRows('A', '@', dns.a.value)
  if (dns.aaaa?.value?.length) pushRows('AAAA', '@', dns.aaaa.value)
  if (dns.cname?.value?.length) pushRows('CNAME', '@', dns.cname.value)
  if (dns.ns?.value?.length) pushRows('NS', '@', dns.ns.value)
  if (dns.txt?.value?.length) pushRows('TXT', '@', dns.txt.value)

  if (dns.mx?.value?.length) {
    dns.mx.value.forEach((mx) => {
      rows.push({
        type: 'MX',
        host: '@',
        value: mx.exchange,
        ttl: String(mx.priority ?? '—'),
      })
    })
  }

  if (dns.soa?.value) {
    const soa = dns.soa.value
    rows.push({
      type: 'SOA',
      host: '@',
      value: `${soa.nsname} ${soa.hostmaster}`,
      ttl: String(soa.minttl ?? '—'),
    })
  }

  return rows
}

export function normalizeDomainHost(name) {
  const raw = String(name || '').trim().toLowerCase()
  if (!raw) return ''

  try {
    const withProtocol = raw.includes('://') ? raw : `https://${raw}`
    return new URL(withProtocol).hostname.replace(/^www\./, '')
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0]
  }
}

export function getDomainFaviconUrl(name) {
  const host = normalizeDomainHost(name)
  if (!host) return null
  return `https://favicone.com/${encodeURIComponent(host)}`
}

export function normalizeDomainRecord(record) {
  const { serverId, subdomains, ...rest } = record
  return {
    connectedProjectIds: [],
    connectedServerIds: [],
    connectedRepoIds: [],
    ...rest,
    subdomains: normalizeSubdomains(record),
    health: normalizeDomainHealth(record),
    connectedProjectIds: Array.isArray(record.connectedProjectIds) ? record.connectedProjectIds : [],
    connectedServerIds: Array.isArray(record.connectedServerIds)
      ? record.connectedServerIds
      : serverId
        ? [serverId]
        : [],
    connectedRepoIds: Array.isArray(record.connectedRepoIds) ? record.connectedRepoIds : [],
  }
}

export function getDomainInitials(name) {
  const parts = String(name || '').split('.').filter(Boolean)
  if (!parts.length) return 'D'
  return parts[0].slice(0, 2).toUpperCase()
}
