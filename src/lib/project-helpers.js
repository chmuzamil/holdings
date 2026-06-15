export const projectStatuses = [
  'Idea',
  'Planning',
  'Building',
  'MVP',
  'Beta',
  'Production',
  'Maintained',
  'Archived',
]

export const projectCategories = [
  'SaaS',
  'OSS Library',
  'Internal Tool',
  'Mobile App',
  'Content Platform',
  'Website',
  'Utility',
  'API',
]

export const projectPriorities = ['Low', 'Medium', 'High', 'Critical']

export const emptyProjectRecord = {
  name: '',
  slug: '',
  description: '',
  status: 'Planning',
  priority: 'Medium',
  category: 'Internal Tool',
  liveUrl: '',
  domainIds: [],
  repoIds: [],
  serverIds: [],
  subscriptionIds: [],
  notes: '',
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeProjectRecord(record) {
  return {
    ...emptyProjectRecord,
    ...record,
    domainIds: Array.isArray(record.domainIds) ? record.domainIds : [],
    repoIds: Array.isArray(record.repoIds) ? record.repoIds : [],
    serverIds: Array.isArray(record.serverIds) ? record.serverIds : [],
    subscriptionIds: Array.isArray(record.subscriptionIds) ? record.subscriptionIds : [],
    slug: record.slug || slugify(record.name),
  }
}

export function projectStatusVariant(status) {
  if (status === 'Production' || status === 'Maintained') return 'success'
  if (status === 'Beta' || status === 'MVP' || status === 'Building' || status === 'Planning') return 'warning'
  if (status === 'Archived') return 'expired'
  if (status === 'Idea') return 'outline'
  return 'default'
}

function domainMonthlyUsd(domain, toUsd) {
  return toUsd(domain) / 12
}

export function computeProjectMonthlyCostUsd(project, records, toUsd) {
  const normalized = normalizeProjectRecord(project)
  let total = 0

  normalized.domainIds.forEach((id) => {
    const domain = records.domains.find((item) => item.id === id)
    if (domain) total += domainMonthlyUsd(domain, toUsd)
  })

  normalized.serverIds.forEach((id) => {
    const server = records.servers.find((item) => item.id === id)
    if (server) total += toUsd(server)
  })

  normalized.subscriptionIds.forEach((id) => {
    const subscription = records.subscriptions.find((item) => item.id === id)
    if (subscription) total += toUsd(subscription)
  })

  return total
}

export function computeProjectStats(projects, records, toUsd) {
  const normalized = projects.map(normalizeProjectRecord)
  const monthlyUsd = normalized.reduce(
    (sum, project) => sum + computeProjectMonthlyCostUsd(project, records, toUsd),
    0,
  )

  return {
    total: normalized.length,
    production: normalized.filter((item) => item.status === 'Production').length,
    building: normalized.filter((item) => ['Building', 'MVP', 'Beta', 'Planning'].includes(item.status)).length,
    archived: normalized.filter((item) => item.status === 'Archived').length,
    monthlyUsd,
  }
}

export function getProjectCostBreakdown(project, records, toUsd) {
  const normalized = normalizeProjectRecord(project)
  const rows = []

  normalized.domainIds.forEach((id) => {
    const domain = records.domains.find((item) => item.id === id)
    if (domain) {
      rows.push({
        label: domain.name,
        type: 'Domain',
        monthlyUsd: domainMonthlyUsd(domain, toUsd),
      })
    }
  })

  normalized.serverIds.forEach((id) => {
    const server = records.servers.find((item) => item.id === id)
    if (server) {
      rows.push({
        label: server.name,
        type: 'Server',
        monthlyUsd: toUsd(server),
      })
    }
  })

  normalized.subscriptionIds.forEach((id) => {
    const subscription = records.subscriptions.find((item) => item.id === id)
    if (subscription) {
      rows.push({
        label: subscription.name,
        type: 'Subscription',
        monthlyUsd: toUsd(subscription),
      })
    }
  })

  const totalUsd = rows.reduce((sum, row) => sum + row.monthlyUsd, 0)
  return { rows, totalUsd }
}
