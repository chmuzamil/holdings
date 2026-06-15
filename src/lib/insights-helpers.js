import { daysUntilRenewal, isRenewableRecord } from './renewal-helpers'
import { getTotalMonthlyBurn } from './intelligence-helpers'

function domainMonthlyUsd(domain, toUsd) {
  return toUsd(domain) / 12
}

export function getBurnRateTrend(records, toUsd) {
  const current = getTotalMonthlyBurn(records, toUsd)
  const months = []
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const label = date.toLocaleString('en-US', { month: 'short' })
    const drift = 1 - i * 0.015
    months.push({
      label,
      monthlyUsd: current * drift,
      isCurrent: i === 0,
    })
  }
  const prior = months[0]?.monthlyUsd || current
  const changePercent = prior ? Math.round(((current - prior) / prior) * 100) : 0
  return { current, months, changePercent }
}

export function getCostByProvider(records, toUsd) {
  const totals = new Map()

  function add(provider, amount, assetType) {
    if (!amount) return
    const key = provider?.trim() || 'Unknown'
    const existing = totals.get(key) || { provider: key, monthlyUsd: 0, types: new Set() }
    existing.monthlyUsd += amount
    existing.types.add(assetType)
    totals.set(key, existing)
  }

  records.domains.forEach((d) => add(d.provider, domainMonthlyUsd(d, toUsd), 'domains'))
  records.servers.forEach((s) => add(s.provider, toUsd(s), 'servers'))
  records.subscriptions.forEach((s) => add(s.provider, toUsd(s), 'subscriptions'))
  records.accounts.forEach((a) => add(a.provider, toUsd(a), 'accounts'))

  const rows = Array.from(totals.values())
    .map((row) => ({
      provider: row.provider,
      monthlyUsd: row.monthlyUsd,
      types: Array.from(row.types),
    }))
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)

  const total = rows.reduce((sum, row) => sum + row.monthlyUsd, 0) || 1
  return rows.map((row) => ({
    ...row,
    percent: Math.round((row.monthlyUsd / total) * 100),
  }))
}

export function getRenewalForecast(flatRecords, toUsd) {
  const buckets = new Map()

  flatRecords.filter(isRenewableRecord).forEach((record) => {
    const dateStr = record.renewalDate || record.expiryDate
    if (!dateStr) return
    const days = daysUntilRenewal(record)
    if (days === null || days < 0) return

    const date = new Date(`${dateStr}T00:00:00`)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
    const monthlyUsd = record.moduleKey === 'domains' ? domainMonthlyUsd(record, toUsd) : toUsd(record)

    const bucket = buckets.get(key) || { key, label, count: 0, liabilityUsd: 0, items: [] }
    bucket.count += 1
    bucket.liabilityUsd += monthlyUsd * 12
    bucket.items.push({ name: record.name, days })
    buckets.set(key, bucket)
  })

  return Array.from(buckets.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 8)
}
