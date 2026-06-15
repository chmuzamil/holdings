export const RENEWAL_MODULE_KEYS = ['domains', 'servers', 'accounts', 'subscriptions']

export function isRenewableModule(moduleKey) {
  return RENEWAL_MODULE_KEYS.includes(moduleKey)
}

export function isRenewableRecord(record) {
  return isRenewableModule(record?.moduleKey)
}

export function daysUntilRenewal(record) {
  const value = record?.renewalDate || record?.expiryDate
  if (!value) return null
  const today = new Date()
  const target = new Date(`${value}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}
