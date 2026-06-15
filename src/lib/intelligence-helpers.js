import { resolveProjectAssets } from './asset-helpers'
import { normalizeDomainRecord } from './domain-helpers'
import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'
import {
  computeProjectMonthlyCostUsd,
  getProjectCostBreakdown,
  normalizeProjectRecord,
} from './project-helpers'
import { normalizeRepoRecord } from './repo-helpers'
import { normalizeServerRecord } from './server-helpers'
import { getHealthScoreBreakdown } from './health-score'

function haystack(...parts) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function domainMonthlyUsd(domain, toUsd) {
  return toUsd(domain) / 12
}

function assetMonthlyUsd(record, moduleKey, toUsd) {
  return moduleKey === 'domains' ? domainMonthlyUsd(record, toUsd) : toUsd(record)
}

export function buildCommandIndex(records) {
  const items = []

  ;(records.projects || []).forEach((project) => {
    const p = normalizeProjectRecord(project)
    items.push({
      id: project.id,
      moduleKey: 'projects',
      type: 'Project',
      name: p.name,
      subtitle: p.status,
      haystack: haystack(p.name, p.slug, p.description, p.category, p.status),
    })
  })

  records.domains.forEach((domain) => {
    items.push({
      id: domain.id,
      moduleKey: 'domains',
      type: 'Domain',
      name: domain.name,
      subtitle: domain.provider,
      haystack: haystack(domain.name, domain.provider, domain.notes),
    })
  })

  records.servers.forEach((server) => {
    const s = normalizeServerRecord(server)
    items.push({
      id: server.id,
      moduleKey: 'servers',
      type: 'Server',
      name: s.name,
      subtitle: s.ipAddress,
      haystack: haystack(s.name, s.provider, s.ipAddress, s.location),
    })
  })

  records.repos.forEach((repo) => {
    const r = normalizeRepoRecord(repo)
    items.push({
      id: repo.id,
      moduleKey: 'repos',
      type: 'Repository',
      name: r.name,
      subtitle: r.owner,
      haystack: haystack(r.name, r.owner, r.description, r.url, r.language),
    })
  })

  records.accounts.forEach((account) => {
    items.push({
      id: account.id,
      moduleKey: 'accounts',
      type: 'Account',
      name: account.name,
      subtitle: account.provider,
      haystack: haystack(account.name, account.provider),
    })
  })

  records.subscriptions.forEach((subscription) => {
    items.push({
      id: subscription.id,
      moduleKey: 'subscriptions',
      type: 'Subscription',
      name: subscription.name,
      subtitle: subscription.provider,
      haystack: haystack(subscription.name, subscription.provider),
    })
  })

  return items
}

export function searchCommandIndex(index, query, limit = 12) {
  const q = query.trim().toLowerCase()
  if (!q) return index.slice(0, limit)
  return index
    .filter((item) => item.haystack.includes(q))
    .sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      if (aName === q) return -1
      if (bName === q) return 1
      if (aName.startsWith(q) && !bName.startsWith(q)) return -1
      if (bName.startsWith(q) && !aName.startsWith(q)) return 1
      return aName.localeCompare(bName)
    })
    .slice(0, limit)
}

export function getTotalMonthlyBurn(records, toUsd) {
  const domainMonthly = records.domains.reduce((sum, d) => sum + domainMonthlyUsd(d, toUsd), 0)
  const serverMonthly = records.servers.reduce((sum, s) => sum + toUsd(s), 0)
  const subMonthly = records.subscriptions.reduce((sum, s) => sum + toUsd(s), 0)
  const accountMonthly = records.accounts.reduce((sum, a) => sum + toUsd(a), 0)
  return domainMonthly + serverMonthly + subMonthly + accountMonthly
}

export function getFounderInsights(records, toUsd) {
  const monthlyUsd = getTotalMonthlyBurn(records, toUsd)
  const allAssets = [
    ...records.domains.map((d) => ({ ...d, moduleKey: 'domains', monthlyUsd: domainMonthlyUsd(d, toUsd) })),
    ...records.servers.map((s) => ({ ...s, moduleKey: 'servers', monthlyUsd: toUsd(s) })),
    ...records.subscriptions.map((s) => ({ ...s, moduleKey: 'subscriptions', monthlyUsd: toUsd(s) })),
    ...records.accounts.map((a) => ({ ...a, moduleKey: 'accounts', monthlyUsd: toUsd(a) })),
  ].filter((a) => a.monthlyUsd > 0)

  const projects = (records.projects || []).map((p) => ({
    project: normalizeProjectRecord(p),
    monthlyUsd: computeProjectMonthlyCostUsd(p, records, toUsd),
    connections: normalizeProjectRecord(p).domainIds.length
      + normalizeProjectRecord(p).repoIds.length
      + normalizeProjectRecord(p).serverIds.length
      + normalizeProjectRecord(p).subscriptionIds.length,
  }))

  const sorted = [...allAssets].sort((a, b) => b.monthlyUsd - a.monthlyUsd)
  const domainCosts = records.domains.map((d) => domainMonthlyUsd(d, toUsd)).filter((c) => c > 0)
  const serverCosts = records.servers.map((s) => toUsd(s)).filter((c) => c > 0)

  return {
    counts: {
      domains: records.domains.length,
      servers: records.servers.length,
      projects: (records.projects || []).length,
      repos: records.repos.length,
      subscriptions: records.subscriptions.length,
      accounts: records.accounts.length,
    },
    monthlyUsd,
    annualUsd: monthlyUsd * 12,
    mostExpensive: sorted[0] || null,
    cheapest: sorted[sorted.length - 1] || null,
    mostConnectedProject: [...projects].sort((a, b) => b.connections - a.connections)[0] || null,
    mostExpensiveProject: [...projects].sort((a, b) => b.monthlyUsd - a.monthlyUsd)[0] || null,
    avgDomainCost: domainCosts.length ? domainCosts.reduce((s, c) => s + c, 0) / domainCosts.length : 0,
    avgServerCost: serverCosts.length ? serverCosts.reduce((s, c) => s + c, 0) / serverCosts.length : 0,
  }
}

function priorityVariant(priority) {
  if (priority === 'critical') return 'danger'
  if (priority === 'warning') return 'warning'
  return 'outline'
}

export function getAttentionItems(records, flatRecords) {
  const items = []
  const now = new Date()

  flatRecords.filter(isRenewableRecord).forEach((record) => {
    const days = daysUntilRenewal(record)
    if (days === null) return
    if (record.status === 'Expired' || days < 0) {
      items.push({
        id: `expired-${record.id}`,
        priority: 'critical',
        label: 'Expired asset',
        detail: `${record.name} is overdue`,
        moduleKey: record.moduleKey,
        recordId: record.id,
      })
    } else if (days <= 7) {
      items.push({
        id: `renew-7-${record.id}`,
        priority: 'critical',
        label: 'Renewal in 7 days',
        detail: `${record.name} · ${days} days left`,
        moduleKey: record.moduleKey,
        recordId: record.id,
      })
    } else if (days <= 30) {
      items.push({
        id: `renew-30-${record.id}`,
        priority: 'warning',
        label: 'Renewal in 30 days',
        detail: `${record.name} · ${days} days left`,
        moduleKey: record.moduleKey,
        recordId: record.id,
      })
    }
  })

  records.domains.forEach((domain) => {
    const normalized = normalizeDomainRecord(domain)
    const lastChecked = normalized.health?.lastChecked
    if (!lastChecked) {
      items.push({
        id: `health-${domain.id}`,
        priority: 'warning',
        label: 'Missing health check',
        detail: domain.name,
        moduleKey: 'domains',
        recordId: domain.id,
      })
    }
  })

  records.servers.forEach((server) => {
    const s = normalizeServerRecord(server)
    if (!s.connectedProjectIds?.length) {
      const linked = (records.projects || []).some((p) =>
        normalizeProjectRecord(p).serverIds.includes(server.id),
      )
      if (!linked) {
        items.push({
          id: `server-unlinked-${server.id}`,
          priority: 'info',
          label: 'Server with no linked project',
          detail: s.name,
          moduleKey: 'servers',
          recordId: server.id,
        })
      }
    }
  })

  ;(records.projects || []).forEach((project) => {
    const p = normalizeProjectRecord(project)
    if (!p.domainIds.length) {
      items.push({
        id: `project-no-domain-${project.id}`,
        priority: 'info',
        label: 'Project missing domain',
        detail: p.name,
        moduleKey: 'projects',
        recordId: project.id,
      })
    }
    if (!p.repoIds.length) {
      items.push({
        id: `project-no-repo-${project.id}`,
        priority: 'warning',
        label: 'Project missing repository',
        detail: p.name,
        moduleKey: 'projects',
        recordId: project.id,
      })
    }
  })

  records.repos.forEach((repo) => {
    const r = normalizeRepoRecord(repo)
    if (r.githubHealth === 'Stale') {
      items.push({
        id: `stale-${repo.id}`,
        priority: 'warning',
        label: 'Stale repository',
        detail: `${r.name} · no push in 180+ days`,
        moduleKey: 'repos',
        recordId: repo.id,
      })
    }
  })

  const order = { critical: 0, warning: 1, info: 2 }
  return items.sort((a, b) => order[a.priority] - order[b.priority])
}

export { priorityVariant }

export function getHealthScore(records, flatRecords) {
  return getHealthScoreBreakdown(records, flatRecords)
}

export function getActivityFeed(records, limit = 8) {
  const events = []

  records.domains.forEach((d) => {
    if (d.renewalDate) {
      events.push({ date: d.renewalDate, title: `Domain ${d.name}`, detail: 'Renewal scheduled', type: 'domain', moduleKey: 'domains' })
    }
    events.push({ date: '2026-01-01', title: `Added domain ${d.name}`, detail: 'Domain tracked', type: 'added', moduleKey: 'domains' })
  })

  records.servers.forEach((s) => {
    events.push({ date: s.renewalDate || '2025-06-01', title: `Server ${s.name}`, detail: 'Infrastructure updated', type: 'server', moduleKey: 'servers' })
  })

  ;(records.projects || []).forEach((p) => {
    const np = normalizeProjectRecord(p)
    events.push({ date: '2026-03-01', title: `Created project ${np.name}`, detail: np.status, type: 'project', moduleKey: 'projects' })
  })

  records.repos.forEach((r) => {
    const nr = normalizeRepoRecord(r)
    if (nr.lastCommitAt) {
      events.push({ date: nr.lastCommitAt, title: `Updated ${nr.name}`, detail: 'Repository push', type: 'repo', moduleKey: 'repos' })
    }
  })

  records.subscriptions.forEach((s) => {
    events.push({ date: s.renewalDate || '2026-01-01', title: `Subscription ${s.name}`, detail: 'Billing cycle', type: 'subscription', moduleKey: 'subscriptions' })
  })

  return events
    .filter((e) => e.date)
    .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`))
    .slice(0, limit)
}

const TIMELINE_EVENTS = [
  { year: 2024, label: 'Created PakDataKit', moduleKey: 'projects' },
  { year: 2025, label: 'Added Main VPS', moduleKey: 'servers' },
  { year: 2026, label: 'Created Founder OS', moduleKey: 'projects' },
  { year: 2026, label: 'Registered backups.example', moduleKey: 'domains' },
  { year: 2026, label: 'Added SpaceMail', moduleKey: 'subscriptions' },
]

export function getAssetTimeline(records) {
  const derived = []

  records.repos.forEach((r) => {
    const nr = normalizeRepoRecord(r)
    if (nr.createdAt) {
      derived.push({
        year: new Date(`${nr.createdAt}T00:00:00`).getFullYear(),
        label: `Created ${nr.name}`,
        moduleKey: 'repos',
        date: nr.createdAt,
      })
    }
  })

  records.domains.forEach((d) => {
    if (d.renewalDate) {
      derived.push({
        year: new Date(`${d.renewalDate}T00:00:00`).getFullYear(),
        label: `Registered ${d.name}`,
        moduleKey: 'domains',
        date: d.renewalDate,
      })
    }
  })

  const merged = [...TIMELINE_EVENTS, ...derived]
  const byYear = merged.reduce((acc, event) => {
    if (!acc[event.year]) acc[event.year] = []
    acc[event.year].push(event)
    return acc
  }, {})

  return Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a)
    .map((year) => ({ year, events: byYear[year] }))
}

export function getInfrastructureGraph(records) {
  return (records.projects || []).map((project) => {
    const normalized = normalizeProjectRecord(project)
    const assets = resolveProjectAssets(project, records)
    return {
      id: project.id,
      name: normalized.name,
      status: normalized.status,
      domain: assets.domains[0] || null,
      repos: assets.repos,
      servers: assets.servers,
      subscriptions: assets.subscriptions,
      accounts: [],
    }
  })
}

export function getDashboardWidgets(records, flatRecords, toUsd) {
  const insights = getFounderInsights(records, toUsd)
  const projects = (records.projects || []).map((p) => ({
    project: normalizeProjectRecord(p),
    monthlyUsd: computeProjectMonthlyCostUsd(p, records, toUsd),
    connections: normalizeProjectRecord(p).domainIds.length
      + normalizeProjectRecord(p).repoIds.length
      + normalizeProjectRecord(p).serverIds.length
      + normalizeProjectRecord(p).subscriptionIds.length,
  }))

  const nextRenewal = flatRecords
    .filter(isRenewableRecord)
    .map((r) => ({ ...r, days: daysUntilRenewal(r) }))
    .filter((r) => r.days !== null && r.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null

  const latestRepo = [...records.repos]
    .map(normalizeRepoRecord)
    .sort((a, b) => new Date(`${b.lastCommitAt || b.updatedAt || '1970'}T00:00:00`)
      - new Date(`${a.lastCommitAt || a.updatedAt || '1970'}T00:00:00`))[0] || null

  const latestDomain = records.domains[records.domains.length - 1] || null
  const latestServer = records.servers[records.servers.length - 1] || null

  return {
    nextRenewal,
    mostExpensiveProject: insights.mostExpensiveProject,
    mostConnectedProject: insights.mostConnectedProject,
    latestRepo,
    latestDomain,
    latestServer,
    health: getHealthScore(records, flatRecords),
    activity: getActivityFeed(records, 6),
    infrastructurePreview: getInfrastructureGraph(records).slice(0, 3),
  }
}

export function getProjectCostAnalytics(project, records, toUsd) {
  const breakdown = getProjectCostBreakdown(project, records, toUsd)
  const totalUsd = breakdown.totalUsd || 1
  const allocation = breakdown.rows.map((row) => ({
    ...row,
    percent: Math.round((row.monthlyUsd / totalUsd) * 100),
  }))
  const trend = allocation.map((row, i) => ({
    label: row.label,
    value: row.monthlyUsd,
    month: `M${i + 1}`,
  }))
  return { breakdown, allocation, trend, totalUsd, annualUsd: totalUsd * 12 }
}
