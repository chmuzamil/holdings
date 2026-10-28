import { buildLedger, cleanupSuggestions, fromV1, impactOf, localDate, rankByImpact, summarizeCosts } from '@holdings/core'

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
  monthlyRevenueUsd: null,
}

// Monthly revenue in USD, or null when it isn't tracked ('' from an empty form field).
function parseRevenue(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
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
    monthlyRevenueUsd: parseRevenue(record.monthlyRevenueUsd),
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

const KIND_LABELS = {
  domain: 'Domain',
  server: 'Server',
  repo: 'Repository',
  account: 'Account',
  subscription: 'Subscription',
}

// One cost summary per records object and cost function, so each change to
// the data is computed once however many components ask.
const costCache = new WeakMap()

function getPortfolio(records, toUsd) {
  let byCostFn = costCache.get(records)
  if (!byCostFn) {
    byCostFn = new WeakMap()
    costCache.set(records, byCostFn)
  }
  let portfolio = byCostFn.get(toUsd)
  if (!portfolio) {
    const data = fromV1(records, { costUsd: (record) => toUsd(record) })
    const costs = summarizeCosts(data)
    portfolio = { data, costs, ledger: buildLedger(data, costs), ranked: null }
    byCostFn.set(toUsd, portfolio)
  }
  return portfolio
}

export function getCostSummary(records, toUsd) {
  return getPortfolio(records, toUsd).costs
}

export function getLedger(records, toUsd) {
  return getPortfolio(records, toUsd).ledger
}

// Paid items you may not need. See @holdings/core cleanupSuggestions.
export function getCleanup(records, toUsd, now = new Date()) {
  return cleanupSuggestions(getPortfolio(records, toUsd).data, localDate(now))
}

// What stops if one item stops. See @holdings/core impactOf.
export function getImpact(records, toUsd, assetId) {
  return assetId ? impactOf(getPortfolio(records, toUsd).data, assetId) : null
}

// Items ranked by how much would stop with them (computed once per data change).
export function getRiskiestItems(records, toUsd) {
  const portfolio = getPortfolio(records, toUsd)
  if (!portfolio.ranked) portfolio.ranked = rankByImpact(portfolio.data)
  return portfolio.ranked
}

export function getHoldingsData(records, toUsd) {
  return getPortfolio(records, toUsd).data
}

export function getAllAssets(records, toUsd) {
  return getPortfolio(records, toUsd).data.assets
}

export function getLedgerRow(project, records, toUsd) {
  return getLedger(records, toUsd).rows.find((row) => row.projectId === project.id) ?? null
}

function projectCost(project, records, toUsd) {
  const known = (records.projects || []).some((item) => item.id === project.id)
  const source = known ? records : { ...records, projects: [...(records.projects || []), project] }
  return getCostSummary(source, toUsd).projects.get(project.id)
}

export function computeProjectMonthlyCostUsd(project, records, toUsd) {
  return projectCost(project, records, toUsd)?.monthlyUsd ?? 0
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
  const cost = projectCost(project, records, toUsd)
  const rows = (cost?.lines ?? []).map((line) => ({
    label: line.name,
    type: KIND_LABELS[line.kind] || 'Asset',
    monthlyUsd: line.monthlyUsd,
    assetMonthlyUsd: line.assetMonthlyUsd,
    sharedBy: line.sharedBy,
  }))
  return { rows, totalUsd: cost?.monthlyUsd ?? 0 }
}
