import {
  DATA_VERSION,
  type Asset,
  type AssetKind,
  type AssetStatus,
  type Billing,
  type HoldingsData,
  type Link,
  type Project,
  type ProjectAsset,
  type ProjectStatus,
} from './model'

/** A record as stored by Holdings 0.1 (one list per module). */
export type V1Record = Record<string, unknown> & { id?: unknown }

export type V1ModuleKey = 'domains' | 'servers' | 'repos' | 'projects' | 'accounts' | 'subscriptions'

export type V1Records = Partial<Record<V1ModuleKey, V1Record[]>>

interface MigrateOptions {
  /** Cost of a record in USD. Defaults to its `cost` field. */
  costUsd?: (record: V1Record, moduleKey: V1ModuleKey) => number
}

const ASSET_MODULES: Record<Exclude<V1ModuleKey, 'projects'>, { kind: AssetKind; billing: Billing }> = {
  domains: { kind: 'domain', billing: 'yearly' },
  servers: { kind: 'server', billing: 'monthly' },
  repos: { kind: 'repo', billing: 'free' },
  accounts: { kind: 'account', billing: 'monthly' },
  subscriptions: { kind: 'subscription', billing: 'monthly' },
}

// Fields that map onto Asset/Project properties or are rebuilt as
// projectAssets/links. Everything else is kept in `details`.
const COMMON_FIELDS = new Set([
  'id', 'name', 'provider', 'cost', 'currency', 'renewalDate', 'expiryDate', 'status', 'notes',
  'addedAt', 'editedAt', 'health', 'moduleKey',
  'connectedProjectIds', 'connectedServerIds', 'connectedRepoIds', 'connectedDomainIds',
  'domainIds', 'repoIds', 'serverIds', 'subscriptionIds',
  'slug', 'description', 'liveUrl', 'monthlyRevenueUsd',
])

const STATUS: Record<string, AssetStatus> = {
  active: 'active',
  'expiring soon': 'expiring',
  expired: 'expired',
  cancelled: 'cancelled',
}

const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'planning', 'building', 'mvp', 'beta', 'production', 'maintained', 'archived']

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value))
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== '') : [])

function details(record: V1Record): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !COMMON_FIELDS.has(key)))
}

function revenue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function isV1Records(value: unknown): value is V1Records {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if ((value as { version?: unknown }).version === DATA_VERSION) return false
  return (['domains', 'servers', 'repos', 'projects', 'accounts', 'subscriptions'] as const).some((key) =>
    Array.isArray((value as V1Records)[key]),
  )
}

export function fromV1(records: V1Records, options: MigrateOptions = {}): HoldingsData {
  const costUsd = options.costUsd ?? ((record) => Number(record.cost) || 0)
  const assets: Asset[] = []
  const projects: Project[] = []
  const membership: Array<[projectId: string, assetId: string]> = []
  const links: Link[] = []

  for (const [moduleKey, { kind, billing }] of Object.entries(ASSET_MODULES) as Array<[Exclude<V1ModuleKey, 'projects'>, { kind: AssetKind; billing: Billing }]>) {
    for (const record of records[moduleKey] ?? []) {
      const id = text(record.id)
      if (!id) continue
      assets.push({
        id,
        kind,
        name: text(record.name),
        provider: text(record.provider),
        costUsd: Math.max(0, costUsd(record, moduleKey)),
        billing,
        status: STATUS[text(record.status).toLowerCase()] ?? 'active',
        renewsAt: text(record.renewalDate),
        expiresAt: text(record.expiryDate),
        notes: text(record.notes),
        details: details(record),
        addedAt: text(record.addedAt),
        editedAt: text(record.editedAt),
      })
      for (const projectId of ids(record.connectedProjectIds)) membership.push([projectId, id])

      if (moduleKey === 'domains') {
        for (const serverId of ids(record.connectedServerIds)) links.push({ from: id, to: serverId, relation: 'points_to' })
        const subdomains = Array.isArray(record.subdomains) ? record.subdomains : []
        for (const sub of subdomains) {
          const serverId = text((sub as Record<string, unknown>)?.serverId)
          if (serverId) links.push({ from: id, to: serverId, relation: 'points_to' })
        }
      }
      if (moduleKey === 'repos') {
        for (const serverId of ids(record.connectedServerIds)) links.push({ from: id, to: serverId, relation: 'deploys_to' })
      }
    }
  }

  for (const record of records.projects ?? []) {
    const id = text(record.id)
    if (!id) continue
    const name = text(record.name)
    const status = text(record.status).toLowerCase() as ProjectStatus
    projects.push({
      id,
      name,
      slug: text(record.slug) || slugify(name),
      status: PROJECT_STATUSES.includes(status) ? status : 'idea',
      description: text(record.description),
      liveUrl: text(record.liveUrl),
      notes: text(record.notes),
      monthlyRevenueUsd: revenue(record.monthlyRevenueUsd),
      details: details(record),
      addedAt: text(record.addedAt),
      editedAt: text(record.editedAt),
    })
    for (const key of ['domainIds', 'repoIds', 'serverIds', 'subscriptionIds'] as const) {
      for (const assetId of ids(record[key])) membership.push([id, assetId])
    }
  }

  const assetIds = new Set(assets.map((asset) => asset.id))
  const projectIds = new Set(projects.map((project) => project.id))

  const seenMembership = new Set<string>()
  const projectAssets: ProjectAsset[] = []
  for (const [projectId, assetId] of membership) {
    const key = `${projectId}\u0000${assetId}`
    if (seenMembership.has(key) || !projectIds.has(projectId) || !assetIds.has(assetId)) continue
    seenMembership.add(key)
    projectAssets.push({ projectId, assetId })
  }

  const seenLinks = new Set<string>()
  const uniqueLinks = links.filter((link) => {
    const key = `${link.from}\u0000${link.to}\u0000${link.relation}`
    if (seenLinks.has(key) || link.from === link.to || !assetIds.has(link.from) || !assetIds.has(link.to)) return false
    seenLinks.add(key)
    return true
  })

  return { version: DATA_VERSION, projects, assets, projectAssets, links: uniqueLinks }
}
