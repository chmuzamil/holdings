export const HEALTH_STATUSES = ['healthy', 'warning', 'missing', 'unknown']

const MOCK_HEALTH_BY_DOMAIN = {
  'maker.example': {
    dns: 'healthy',
    nameservers: 'healthy',
    email: 'healthy',
    website: 'healthy',
    aRecord: '203.0.113.20',
    nameserverList: ['ns1.maker.example', 'ns2.maker.example'],
    mxRecords: ['mail.maker.example'],
    websiteUrl: 'https://maker.example',
    httpStatus: 200,
  },
  'newsbite.example': {
    dns: 'healthy',
    nameservers: 'healthy',
    email: 'healthy',
    website: 'healthy',
    aRecord: '203.0.113.10',
    nameserverList: ['ns1.spaceship.com', 'ns2.spaceship.com'],
    mxRecords: ['mail.newsbite.example'],
    websiteUrl: 'https://newsbite.example',
    httpStatus: 200,
  },
  'backups.example': {
    dns: 'unknown',
    nameservers: 'healthy',
    email: 'missing',
    website: 'missing',
    aRecord: '—',
    nameserverList: ['ns1.backups.example'],
    mxRecords: [],
    websiteUrl: 'https://backups.example',
    httpStatus: null,
  },
  'shopfront.example': {
    dns: 'unknown',
    nameservers: 'healthy',
    email: 'missing',
    website: 'missing',
    aRecord: '—',
    nameserverList: ['ns1.shopfront.example'],
    mxRecords: [],
    websiteUrl: 'https://shopfront.example',
    httpStatus: null,
  },
  'cityguide.example': {
    dns: 'unknown',
    nameservers: 'healthy',
    email: 'missing',
    website: 'missing',
    aRecord: '—',
    nameserverList: ['ns1.cityguide.example'],
    mxRecords: [],
    websiteUrl: 'https://cityguide.example',
    httpStatus: null,
  },
  'founder-os.maker.example': {
    dns: 'healthy',
    nameservers: 'healthy',
    email: 'warning',
    website: 'healthy',
    aRecord: '203.0.113.10',
    nameserverList: ['ns1.maker.example'],
    mxRecords: [],
    websiteUrl: 'https://founder-os.maker.example',
    httpStatus: 200,
  },
}

export function getDefaultHealthForDomain(name) {
  const mock = MOCK_HEALTH_BY_DOMAIN[String(name || '').toLowerCase()]
  const today = new Date().toISOString().slice(0, 10)
  return {
    dns: mock?.dns || 'unknown',
    nameservers: mock?.nameservers || 'unknown',
    email: mock?.email || 'unknown',
    website: mock?.website || 'unknown',
    aRecord: mock?.aRecord || '—',
    nameserverList: mock?.nameserverList || [],
    mxRecords: mock?.mxRecords || [],
    websiteUrl: mock?.websiteUrl || (name ? `https://${name}` : ''),
    httpStatus: mock?.httpStatus ?? null,
    lastChecked: today,
  }
}

export function normalizeDomainHealth(record) {
  const defaults = getDefaultHealthForDomain(record.name)
  const health = record.health || {}
  return {
    ...defaults,
    ...health,
    nameserverList: health.nameserverList || defaults.nameserverList,
    mxRecords: health.mxRecords || defaults.mxRecords,
  }
}

export function healthVariant(status) {
  if (status === 'healthy') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'missing') return 'danger'
  return 'outline'
}

export function healthLabel(status) {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function healthSymbol(status) {
  if (status === 'healthy') return '✓'
  if (status === 'warning') return '!'
  if (status === 'missing') return '✕'
  return '—'
}
