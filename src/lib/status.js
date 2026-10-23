// Badge tone for an asset's status (domains, servers, accounts, subscriptions).
const TONES = {
  Active: 'success',
  'Expiring Soon': 'warning',
  Expired: 'danger',
  Cancelled: 'neutral',
}

export function statusTone(status) {
  return TONES[status] || 'neutral'
}
