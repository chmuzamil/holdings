import { percentShares } from './format'

const ACTIVE = (record) => record.status !== 'Cancelled' && record.status !== 'Expired'

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

  records.domains.filter(ACTIVE).forEach((d) => add(d.provider, toUsd(d) / 12, 'domains'))
  records.servers.filter(ACTIVE).forEach((s) => add(s.provider, toUsd(s), 'servers'))
  records.subscriptions.filter(ACTIVE).forEach((s) => add(s.provider, toUsd(s), 'subscriptions'))
  records.accounts.filter(ACTIVE).forEach((a) => add(a.provider, toUsd(a), 'accounts'))

  const rows = Array.from(totals.values())
    .map((row) => ({ provider: row.provider, monthlyUsd: row.monthlyUsd, types: Array.from(row.types) }))
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)

  const shares = percentShares(rows.map((row) => row.monthlyUsd))
  return rows.map((row, index) => ({ ...row, share: shares[index] }))
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Next date on or after `from` that falls on the same day each year.
function nextAnniversary(dateStr, from) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  while (date < from) date.setFullYear(date.getFullYear() + 1)
  return date
}

/**
 * What you'll pay in each of the next `count` months, starting this month.
 * Monthly items (servers, subscriptions, accounts) are charged every month;
 * yearly items (domains) are charged in full in the month they renew.
 * Cancelled and expired items are left out.
 */
export function getCashForecast(records, toUsd, now = new Date(), count = 12) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const months = Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    return {
      key: monthKey(date),
      label: date.toLocaleString('en-US', { month: 'short' }),
      year: date.getFullYear(),
      recurringUsd: 0,
      renewals: [],
      totalUsd: 0,
    }
  })
  const byKey = new Map(months.map((month) => [month.key, month]))

  const monthly = [...records.servers, ...records.subscriptions, ...records.accounts].filter(ACTIVE)
  const recurringUsd = monthly.reduce((sum, record) => sum + toUsd(record), 0)
  months.forEach((month) => { month.recurringUsd = recurringUsd })

  records.domains.filter(ACTIVE).forEach((domain) => {
    const dateStr = domain.renewalDate || domain.expiryDate
    const amount = toUsd(domain)
    if (!dateStr || !amount) return
    const due = nextAnniversary(dateStr, start)
    const month = due && byKey.get(monthKey(due))
    if (month) month.renewals.push({ name: domain.name, usd: amount, date: due })
  })

  months.forEach((month) => {
    month.renewals.sort((a, b) => a.date - b.date)
    month.totalUsd = month.recurringUsd + month.renewals.reduce((sum, item) => sum + item.usd, 0)
  })
  return months
}
