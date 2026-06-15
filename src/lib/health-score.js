import { normalizeDomainRecord } from './domain-helpers'
import { normalizeProjectRecord } from './project-helpers'
import { normalizeRepoRecord } from './repo-helpers'
import { normalizeServerRecord } from './server-helpers'
import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'

export const HEALTH_FACTORS = [
  { id: 'renewals', label: 'Renewals on track', weight: 'Critical −8 · Warning −4' },
  { id: 'links', label: 'Projects linked to assets', weight: 'Info −2 each' },
  { id: 'repos', label: 'Repository activity', weight: 'Stale repo −4' },
  { id: 'domains', label: 'Domain health checks', weight: 'Missing check −4' },
]

export function getDomainHealthScore(health) {
  if (!health) return { score: 50, label: 'Unknown' }
  const map = { healthy: 100, warning: 65, missing: 25, unknown: 50 }
  const keys = ['dns', 'nameservers', 'email', 'website']
  const avg = keys.reduce((sum, key) => sum + (map[health[key]] ?? 50), 0) / keys.length
  const score = Math.round(avg)
  const label = score >= 85 ? 'Healthy' : score >= 60 ? 'Fair' : 'At risk'
  return { score, label }
}

export function getHealthScoreBreakdown(records, flatRecords) {
  const factors = []
  let score = 100

  flatRecords.filter(isRenewableRecord).forEach((record) => {
    const days = daysUntilRenewal(record)
    if (record.status === 'Expired' || (days !== null && days < 0)) {
      score -= 8
      factors.push({ type: 'critical', text: `${record.name} is overdue` })
    } else if (days !== null && days <= 7) {
      score -= 8
      factors.push({ type: 'critical', text: `${record.name} renews in ${days} days` })
    } else if (days !== null && days <= 30) {
      score -= 4
      factors.push({ type: 'warning', text: `${record.name} renews in ${days} days` })
    }
  })

  records.repos.forEach((repo) => {
    const r = normalizeRepoRecord(repo)
    if (r.githubHealth === 'Stale') {
      score -= 4
      factors.push({ type: 'warning', text: `${r.name} has no recent pushes` })
    }
  })

  ;(records.projects || []).forEach((project) => {
    const p = normalizeProjectRecord(project)
    if (!p.domainIds.length) {
      score -= 2
      factors.push({ type: 'info', text: `${p.name} has no linked domain` })
    }
    if (!p.repoIds.length) {
      score -= 4
      factors.push({ type: 'warning', text: `${p.name} has no linked repository` })
    }
  })

  records.domains.forEach((domain) => {
    const d = normalizeDomainRecord(domain)
    if (!d.health?.lastChecked) {
      score -= 4
      factors.push({ type: 'warning', text: `${domain.name} missing health check` })
    }
  })

  records.servers.forEach((server) => {
    const s = normalizeServerRecord(server)
    const linked = s.connectedProjectIds?.length
      || (records.projects || []).some((p) => normalizeProjectRecord(p).serverIds.includes(server.id))
    if (!linked) {
      score -= 2
      factors.push({ type: 'info', text: `${s.name} not linked to a project` })
    }
  })

  score = Math.max(0, Math.min(100, score))
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Needs attention'

  return { score, label, factors: factors.slice(0, 6) }
}

export function getHealthRecommendations(health) {
  if (!health) return []
  const recs = []

  ;(health.factors || []).forEach((factor) => {
    if (factor.type === 'critical') {
      recs.push({ priority: 'high', text: `Urgent: ${factor.text}`, action: 'Resolve before it impacts uptime or billing.' })
    } else if (factor.type === 'warning') {
      recs.push({ priority: 'medium', text: factor.text, action: 'Schedule this in your next ops block.' })
    } else {
      recs.push({ priority: 'low', text: factor.text, action: 'Link missing assets to improve portfolio coverage.' })
    }
  })

  if (!recs.length && health.score >= 85) {
    recs.push({
      priority: 'low',
      text: 'Infrastructure looks stable.',
      action: 'Run domain health checks monthly and keep repos linked to projects.',
    })
  }

  return recs.slice(0, 6)
}

export function getHealthScoreTimeline(records, flatRecords) {
  const current = getHealthScoreBreakdown(records, flatRecords)
  const events = [...(current.factors || [])].map((factor, index) => ({
    daysAgo: (index + 1) * 14,
    delta: factor.type === 'critical' ? -8 : factor.type === 'warning' ? -4 : -2,
    reason: factor.text,
  }))

  let score = current.score
  const points = [
    { label: 'Today', score: current.score, reason: 'Current infrastructure health' },
  ]

  events.forEach((event) => {
    score = Math.min(100, score - event.delta)
    points.unshift({
      label: `${event.daysAgo}d ago`,
      score,
      reason: event.reason,
    })
  })

  if (points.length < 3) {
    points.unshift({ label: '30d ago', score: Math.min(100, current.score + 6), reason: 'Baseline before recent changes' })
  }

  return points.slice(-5)
}

export function getProjectConnectionHealth(project) {
  const normalized = normalizeProjectRecord(project)
  let score = 100
  const gaps = []

  if (!normalized.domainIds.length) {
    score -= 15
    gaps.push('No domain linked')
  }
  if (!normalized.repoIds.length) {
    score -= 25
    gaps.push('No repository linked')
  }
  if (!normalized.serverIds.length) {
    score -= 10
    gaps.push('No server linked')
  }
  if (normalized.status === 'Archived') {
    score -= 20
    gaps.push('Project archived')
  }

  score = Math.max(0, Math.min(100, score))
  const label = score >= 80 ? 'Healthy' : score >= 55 ? 'Fair' : 'Needs work'
  return { score, label, gaps }
}
