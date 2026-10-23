import { isRenewableModule } from './renewal-helpers'

const DAY = 86400000

function localDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function daysBetween(from, to) {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  return Math.round((to - start) / DAY)
}

// What the date means for each kind of item.
function dateLabel(record, which) {
  if (record.moduleKey === 'keys') return which === 'renewalDate' ? 'Rotate' : 'Expires'
  if (record.moduleKey === 'domains') return which === 'renewalDate' ? 'Renews' : 'Expires'
  if (record.moduleKey === 'accounts') return which === 'renewalDate' ? 'Review' : 'Check'
  return which === 'renewalDate' ? 'Renews' : 'Ends'
}

export const EXPIRY_GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'month', label: 'Next 30 days' },
  { key: 'quarter', label: 'Next 3 months' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No date set' },
]

/**
 * Everything that renews, expires or needs rotating, one row per item, using
 * its nearest date (the earlier of renewal/rotate-by and expiry). Cancelled
 * items are left out.
 */
export function getExpiryRadar(flatRecords, now = new Date()) {
  const rows = flatRecords
    .filter((record) => isRenewableModule(record.moduleKey) && record.status !== 'Cancelled')
    .map((record) => {
      const candidates = ['renewalDate', 'expiryDate']
        .filter((which) => record[which])
        .map((which) => ({ which, date: localDate(record[which]) }))
        .filter((item) => !Number.isNaN(item.date.getTime()))
        .sort((a, b) => a.date - b.date)
      const next = candidates[0]
      const days = next ? daysBetween(now, next.date) : null
      const group = days === null ? 'none' : days < 0 ? 'overdue' : days <= 30 ? 'month' : days <= 90 ? 'quarter' : 'later'
      return {
        record,
        date: next ? next.date : null,
        dateValue: next ? record[next.which] : '',
        dateLabel: next ? dateLabel(record, next.which) : '',
        days,
        group,
      }
    })
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.record.name.localeCompare(b.record.name))

  return EXPIRY_GROUPS.map((group) => ({ ...group, rows: rows.filter((row) => row.group === group.key) }))
}

export function daysLabel(days) {
  if (days === null) return ''
  if (days === 0) return 'today'
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  return `in ${days} day${days === 1 ? '' : 's'}`
}
