import { recentHighChanges } from './domain-watch'
import { resolveProjectAssets } from './asset-helpers'
import { normalizeDomainRecord } from './domain-helpers'
import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'
import {
  computeProjectMonthlyCostUsd,
  getCostSummary,
  getProjectCostBreakdown,
  normalizeProjectRecord,
} from './project-helpers'
import { normalizeRepoRecord } from './repo-helpers'
import { normalizeServerRecord } from './server-helpers'
import { getProjectGaps } from './health-score'
import { percentShares } from './format'

function haystack(...parts) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function domainMonthlyUsd(domain, toUsd) {
  return toUsd(domain) / 12
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

export function getTotalMonthlyCost(records, toUsd) {
  return getCostSummary(records, toUsd).totalMonthlyUsd
}

export function getFounderInsights(records, toUsd) {
  const monthlyUsd = getTotalMonthlyCost(records, toUsd)
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


const CHANGE_LABELS = {
  nameservers: 'Nameservers changed',
  transferLock: 'Transfer lock removed',
  status: 'Registry status changed',
  expires: 'Expiry date moved earlier',
}

export function getAttentionItems(records, flatRecords, serverChanges = {}) {
  const items = []
  const add = (item) => items.push(item)

  records.domains.forEach((domain) => {
    recentHighChanges(domain, serverChanges).forEach((change) => {
      add({
        id: `domain-change-${change.id}`,
        priority: 'critical',
        label: CHANGE_LABELS[change.field] || 'Domain changed',
        detail: domain.name,
        action: 'Check that this was you. If it wasn\u2019t, contact your registrar now.',
        moduleKey: 'domains',
        recordId: domain.id,
      })
    })
  })

  flatRecords.filter(isRenewableRecord).forEach((record) => {
    if (record.status === 'Cancelled') return
    const days = daysUntilRenewal(record)
    if (days === null) return
    const base = { moduleKey: record.moduleKey, recordId: record.id, detail: record.name }
    if (record.status === 'Expired' || days < 0) {
      add({ ...base, id: `expired-${record.id}`, priority: 'critical', label: days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : 'Expired', action: 'Renew it, or mark it cancelled if you let it go.' })
    } else if (days <= 7) {
      add({ ...base, id: `renew-7-${record.id}`, priority: 'critical', label: days === 0 ? 'Renews today' : `Renews in ${days} day${days === 1 ? '' : 's'}`, action: 'Renew or cancel it this week.' })
    } else if (days <= 30) {
      add({ ...base, id: `renew-30-${record.id}`, priority: 'warning', label: `Renews in ${days} days`, action: 'Check the card it uses and whether you still need it.' })
    }
  })

  records.domains.forEach((domain) => {
    const normalized = normalizeDomainRecord(domain)
    if (!normalized.health?.lastChecked) {
      add({ id: `health-${domain.id}`, priority: 'info', label: 'DNS not checked yet', detail: domain.name, action: 'Run a DNS check from the Domains page.', moduleKey: 'domains', recordId: domain.id })
    }
  })

  records.servers.forEach((server) => {
    const s = normalizeServerRecord(server)
    const linked = s.connectedProjectIds?.length
      || (records.projects || []).some((p) => normalizeProjectRecord(p).serverIds.includes(server.id))
    if (!linked && server.status !== 'Cancelled') {
      add({ id: `server-unlinked-${server.id}`, priority: 'info', label: 'Not used by any project', detail: s.name, action: 'Link it to a project, or cancel it.', moduleKey: 'servers', recordId: server.id })
    }
  })

  ;(records.projects || []).forEach((project) => {
    const p = normalizeProjectRecord(project)
    getProjectGaps(p).forEach((gap) => {
      add({ id: `project-${gap.key}-${project.id}`, priority: 'info', label: gap.label, detail: p.name, action: gap.action, moduleKey: 'projects', recordId: project.id })
    })
  })

  records.repos.forEach((repo) => {
    const r = normalizeRepoRecord(repo)
    if (r.githubHealth === 'Stale') {
      add({ id: `stale-${repo.id}`, priority: 'info', label: 'No code changes in 6 months', detail: r.name, action: 'Archive it, or link it to a project you still run.', moduleKey: 'repos', recordId: repo.id })
    }
  })

  const order = { critical: 0, warning: 1, info: 2 }
  return items.sort((a, b) => order[a.priority] - order[b.priority])
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

export function getProjectCostAnalytics(project, records, toUsd) {
  const breakdown = getProjectCostBreakdown(project, records, toUsd)
  const shares = percentShares(breakdown.rows.map((row) => row.monthlyUsd))
  const allocation = breakdown.rows.map((row, index) => ({ ...row, share: shares[index] }))
  return { breakdown, allocation, totalUsd: breakdown.totalUsd, annualUsd: breakdown.totalUsd * 12 }
}
