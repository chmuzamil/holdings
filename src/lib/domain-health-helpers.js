// Domain health is derived only from the last real DNS/RDAP lookup stored on
// the record (`record.lookup`). A domain that was never looked up is
// "unknown" — nothing is guessed.
export const HEALTH_STATUSES = ['healthy', 'warning', 'missing', 'none', 'unknown']

function values(lookup, type) {
  const value = lookup?.dns?.[type]?.value
  return Array.isArray(value) ? value : []
}

function txtStrings(lookup) {
  // TXT answers come back as arrays of chunks per record.
  return values(lookup, 'txt').map((record) => (Array.isArray(record) ? record.join('') : String(record)))
}

export function deriveDomainHealth(record) {
  const lookup = record?.lookup
  const websiteUrl = record?.name ? `https://${record.name}` : ''
  if (!lookup?.checkedAt) {
    return {
      dns: 'unknown',
      nameservers: 'unknown',
      email: 'unknown',
      aRecord: '',
      nameserverList: [],
      mxRecords: [],
      hasSpf: false,
      websiteUrl,
      lastChecked: '',
    }
  }

  const aRecords = values(lookup, 'a')
  const resolves = aRecords.length + values(lookup, 'aaaa').length + values(lookup, 'cname').length > 0
  const nameserverList = values(lookup, 'ns').length
    ? values(lookup, 'ns')
    : (lookup.whois?.nameservers || []).map((ns) => String(ns).toLowerCase())
  const mxRecords = values(lookup, 'mx').map((mx) => mx.exchange || String(mx)).filter(Boolean)
  const hasSpf = txtStrings(lookup).some((txt) => txt.toLowerCase().startsWith('v=spf1'))

  return {
    dns: resolves ? 'healthy' : 'missing',
    nameservers: nameserverList.length >= 2 ? 'healthy' : nameserverList.length === 1 ? 'warning' : 'missing',
    // No MX means the domain doesn't receive mail. That is a choice, not a fault.
    email: mxRecords.length ? (hasSpf ? 'healthy' : 'warning') : 'none',
    aRecord: aRecords[0] || '',
    nameserverList,
    mxRecords,
    hasSpf,
    websiteUrl,
    lastChecked: String(lookup.checkedAt).slice(0, 10),
  }
}

export function normalizeDomainHealth(record) {
  return deriveDomainHealth(record)
}

export function healthVariant(status) {
  if (status === 'healthy') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'missing') return 'danger'
  return 'outline'
}

export function healthLabel(status) {
  if (status === 'none') return 'Not set up'
  if (status === 'warning') return 'Needs attention'
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function healthSymbol(status) {
  if (status === 'healthy') return '✓'
  if (status === 'warning') return '!'
  if (status === 'missing') return '✕'
  return '—'
}
