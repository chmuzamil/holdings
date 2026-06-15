import { normalizeProjectRecord, projectStatusVariant, computeProjectMonthlyCostUsd } from './project-helpers'
import { devStatusVariant } from './repo-helpers'
import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'
import { countConnectedProjects, getAssetMap } from './asset-helpers'

const FINANCIAL_CATEGORIES = [
  { key: 'domains', label: 'Domains', color: '#7dd3fc', isAnnual: true },
  { key: 'servers', label: 'VPS / Servers', color: '#34d399', isAnnual: false },
  { key: 'subscriptions', label: 'Subscriptions', color: '#f87171', isAnnual: false },
  { key: 'accounts', label: 'Accounts', color: '#fbbf24', isAnnual: false },
  { key: 'projects', label: 'Projects', color: '#a78bfa', isAnnual: false, computed: true },
]

function sumCategoryMonthlyUsd(records, categoryKey, toUsd) {
  if (categoryKey === 'projects') {
    return (records.projects || []).reduce(
      (sum, project) => sum + computeProjectMonthlyCostUsd(project, records, toUsd),
      0,
    )
  }
  const items = records[categoryKey] || []
  const yearlyUsd = items.reduce((sum, item) => sum + toUsd(item), 0)
  return categoryKey === 'domains' ? yearlyUsd / 12 : yearlyUsd
}

function sumCategoryAnnualUsd(records, categoryKey, toUsd) {
  if (categoryKey === 'projects') {
    return sumCategoryMonthlyUsd(records, categoryKey, toUsd) * 12
  }
  const items = records[categoryKey] || []
  const yearlyUsd = items.reduce((sum, item) => sum + toUsd(item), 0)
  return categoryKey === 'domains' ? yearlyUsd : yearlyUsd * 12
}

export function getCostBreakdown(records, toUsd) {
  const rows = FINANCIAL_CATEGORIES.map((category) => ({
    ...category,
    monthlyUsd: sumCategoryMonthlyUsd(records, category.key, toUsd),
  }))
  const totalUsd = rows.reduce((sum, row) => sum + row.monthlyUsd, 0) || 1

  return rows
    .map((row) => ({
      ...row,
      percent: Math.round((row.monthlyUsd / totalUsd) * 100),
    }))
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
}

export function getAnnualCostBreakdown(records, toUsd) {
  const rows = FINANCIAL_CATEGORIES.map((category) => ({
    ...category,
    annualUsd: sumCategoryAnnualUsd(records, category.key, toUsd),
  }))
  const totalUsd = rows.reduce((sum, row) => sum + row.annualUsd, 0)

  return {
    rows: rows.sort((a, b) => b.annualUsd - a.annualUsd),
    totalUsd,
  }
}

function assetMonthlyUsd(record, toUsd) {
  const usd = toUsd(record)
  return record.moduleKey === 'domains' ? usd / 12 : usd
}

export function getTopExpenses(records, toUsd, limit = 5) {
  const assets = FINANCIAL_CATEGORIES.flatMap((category) =>
    (records[category.key] || []).map((item) => ({
      ...item,
      moduleKey: category.key,
      monthlyUsd: assetMonthlyUsd({ ...item, moduleKey: category.key }, toUsd),
    })),
  )

  return assets
    .filter((item) => item.monthlyUsd > 0)
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .slice(0, limit)
}

function renewalUnitUsd(record, toUsd) {
  return toUsd(record)
}

function countRenewalsInPeriod(record, periodDays) {
  const daysLeft = daysUntilRenewal(record)
  if (daysLeft === null || daysLeft > periodDays) return 0

  if (record.moduleKey === 'domains') {
    return 1
  }

  const firstRenewalIn = Math.max(0, daysLeft)
  return Math.floor((periodDays - firstRenewalIn) / 30) + 1
}

export function getRenewalLiability(flatRecords, toUsd) {
  const renewable = flatRecords.filter(isRenewableRecord)
  const periods = [
    { days: 30, label: 'Next 30 Days' },
    { days: 90, label: 'Next 90 Days' },
    { days: 365, label: 'Next 12 Months' },
  ]

  return periods.map((period) => {
    const totalUsd = renewable.reduce((sum, record) => {
      const cycles = countRenewalsInPeriod(record, period.days)
      if (!cycles) return sum
      return sum + renewalUnitUsd(record, toUsd) * cycles
    }, 0)

    return { ...period, totalUsd }
  })
}

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export function renewalsDueThisMonth(flatRecords) {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  return flatRecords.filter((item) => {
    if (!isRenewableRecord(item)) return false
    const date = item.renewalDate || item.expiryDate
    if (!date) return false
    const target = new Date(`${date}T00:00:00`)
    return target.getMonth() === month && target.getFullYear() === year
  }).length
}

export function countDigitalAssets(records) {
  return records.domains.length
    + records.servers.length
    + records.accounts.length
    + records.subscriptions.length
}

export function countActiveProjects(projects) {
  return (projects || []).filter((project) => {
    const normalized = normalizeProjectRecord(project)
    return ['Production', 'Building', 'MVP', 'Beta', 'Maintained'].includes(normalized.status)
  }).length
}

export function getAssetDistribution(records) {
  return [
    { label: 'Domains', value: records.domains.length, color: '#7dd3fc' },
    { label: 'VPS / Servers', value: records.servers.length, color: '#34d399' },
    { label: 'Projects', value: (records.projects || []).length, color: '#a78bfa' },
    { label: 'Repositories', value: records.repos.length, color: '#c4b5fd' },
    { label: 'Accounts', value: records.accounts.length, color: '#fbbf24' },
    { label: 'Subscriptions', value: records.subscriptions.length, color: '#f87171' },
  ]
}

export function getProjectHealth(projects) {
  const normalized = (projects || []).map(normalizeProjectRecord)
  const total = normalized.length || 1
  const groups = [
    { label: 'Planning', statuses: ['Planning', 'Idea'] },
    { label: 'Building', statuses: ['Building', 'MVP'] },
    { label: 'Beta', statuses: ['Beta'] },
    { label: 'Production', statuses: ['Production'] },
    { label: 'Maintained', statuses: ['Maintained'] },
    { label: 'Archived', statuses: ['Archived'] },
  ]

  return groups.map((group) => {
    const count = normalized.filter((project) => group.statuses.includes(project.status)).length
    return {
      label: group.label,
      count,
      percent: Math.round((count / total) * 100),
    }
  }).filter((group) => group.count > 0 || total === 1)
}

export function getUpcomingRenewals(flatRecords, limit = 6) {
  return flatRecords
    .filter((item) => isRenewableRecord(item))
    .map((item) => {
      const date = item.renewalDate || item.expiryDate
      return {
        id: `${item.moduleKey}-${item.id}`,
        date,
        title: item.name,
        detail: {
          domains: 'Domain renewal',
          servers: 'Server renewal',
          accounts: 'Account review',
          subscriptions: 'Subscription renewal',
        }[item.moduleKey] || 'Renewal',
        moduleKey: item.moduleKey,
        tone: item.status === 'Expiring Soon' || item.status === 'Expired' ? 'warning' : 'default',
      }
    })
    .filter((event) => event.date)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))
    .slice(0, limit)
}

export function getRecentActivity(_records, flatRecords, limit = 6) {
  return getUpcomingRenewals(flatRecords, limit)
}

export function getPortfolioProjects(projects, limit = 6) {
  const priority = {
    Production: 0,
    Building: 1,
    MVP: 2,
    Beta: 3,
    Maintained: 4,
    Planning: 5,
    Idea: 6,
    Archived: 7,
  }

  return [...(projects || [])]
    .map(normalizeProjectRecord)
    .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9))
    .slice(0, limit)
}

export { devStatusVariant, projectStatusVariant, getAssetMap, countConnectedProjects }
