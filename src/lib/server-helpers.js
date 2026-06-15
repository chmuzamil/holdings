export const emptyServerRecord = {
  name: '',
  provider: '',
  packageName: '',
  ipAddress: '',
  cpu: 0,
  ramGb: 0,
  storage: '',
  bandwidth: '',
  os: '',
  location: '',
  hostedServices: [],
  connectedProjectIds: [],
  cost: 0,
  currency: 'PKR',
  renewalDate: '',
  expiryDate: '',
  status: 'Active',
  notes: '',
}

export function normalizeServerRecord(record) {
  const hostedServices = Array.isArray(record.hostedServices)
    ? record.hostedServices
    : String(record.hostedServices || '')
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)

  return {
    ...emptyServerRecord,
    ...record,
    cpu: Number(record.cpu || 0),
    ramGb: Number(record.ramGb || 0),
    cost: Number(record.cost || 0),
    hostedServices,
    connectedProjectIds: Array.isArray(record.connectedProjectIds)
      ? record.connectedProjectIds
      : [],
  }
}

export function formatServerSpecs(server) {
  const normalized = normalizeServerRecord(server)
  return [
    normalized.cpu ? `${normalized.cpu} CPU` : null,
    normalized.ramGb ? `${normalized.ramGb} GB RAM` : null,
    normalized.storage || null,
    normalized.os || null,
  ].filter(Boolean)
}

export function formatServerSpecsLine(server) {
  return formatServerSpecs(server).join(' · ')
}

export function computeServerCostMetrics(server, toUsd) {
  const normalized = normalizeServerRecord(server)
  const monthlyUsd = toUsd(normalized)
  const cpu = normalized.cpu || 1
  const ramGb = normalized.ramGb || 1

  return {
    monthlyUsd,
    annualUsd: monthlyUsd * 12,
    perCoreUsd: monthlyUsd / cpu,
    perGbRamUsd: monthlyUsd / ramGb,
  }
}

export function countHostedServices(server) {
  return normalizeServerRecord(server).hostedServices.length
}
