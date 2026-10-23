export const RENEWAL_MODULE_KEYS = ['domains', 'servers', 'accounts', 'subscriptions', 'keys']

export function isRenewableModule(moduleKey) {
  return RENEWAL_MODULE_KEYS.includes(moduleKey)
}

export function isRenewableRecord(record) {
  return isRenewableModule(record?.moduleKey)
}

// Days until the earlier of the renewal (or rotate-by) date and the expiry date.
export function daysUntilRenewal(record) {
  const value = [record?.renewalDate, record?.expiryDate].filter(Boolean).sort()[0]
  if (!value) return null
  const today = new Date()
  const target = new Date(`${value}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}
