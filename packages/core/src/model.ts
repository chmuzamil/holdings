// The Holdings data model (version 2).
//
// Everything a founder owns is an Asset. Projects are linked to assets through
// ProjectAsset rows, so one server can belong to several projects and its cost
// is split between them. Links between assets ("this domain points at that
// server") describe what depends on what.

export const DATA_VERSION = 2

export type AssetKind =
  | 'domain'
  | 'server'
  | 'repo'
  | 'account'
  | 'subscription'
  | 'credential'
  | 'card'
  | 'certificate'
  | 'other'

/** How often the cost is paid. Amounts are always in US dollars. */
export type Billing = 'monthly' | 'yearly' | 'free'

export type AssetStatus = 'active' | 'expiring' | 'expired' | 'cancelled'

export interface Asset {
  id: string
  kind: AssetKind
  name: string
  provider: string
  /** Amount per billing period, in USD. */
  costUsd: number
  billing: Billing
  status: AssetStatus
  /** ISO date (YYYY-MM-DD) of the next renewal or payment. */
  renewsAt: string
  /** ISO date (YYYY-MM-DD) when it stops working if not renewed. */
  expiresAt: string
  notes: string
  /** Kind-specific fields (IP address, repo URL, subdomains, DNS lookup, …). */
  details: Record<string, unknown>
  addedAt: string
  editedAt: string
}

export type ProjectStatus =
  | 'idea'
  | 'planning'
  | 'building'
  | 'mvp'
  | 'beta'
  | 'production'
  | 'maintained'
  | 'archived'

/**
 * Where a project is in its life. Older data only has the more detailed
 * status, so the stage is derived from it (see stageFromStatus).
 */
export type ProjectStage = 'idea' | 'building' | 'launched' | 'maintenance' | 'paused' | 'archived'

export const PROJECT_STAGES: ProjectStage[] = ['idea', 'building', 'launched', 'maintenance', 'paused', 'archived']

export function stageFromStatus(status: string): ProjectStage {
  const value = status.toLowerCase()
  if (value === 'idea' || value === 'planning') return 'idea'
  if (value === 'building') return 'building'
  if (value === 'mvp' || value === 'beta' || value === 'production') return 'launched'
  if (value === 'maintained') return 'maintenance'
  if (value === 'archived') return 'archived'
  return 'idea'
}

export interface Project {
  id: string
  name: string
  slug: string
  status: ProjectStatus
  description: string
  liveUrl: string
  notes: string
  /** Monthly revenue in USD, or null when it isn't tracked (not the same as earning nothing). */
  monthlyRevenueUsd: number | null
  stage: ProjectStage
  /** ISO date-time the stage last changed, or '' when unknown. */
  stageChangedAt: string
  /** ISO date the owner last worked on it (set by hand), or ''. */
  lastWorkedOn: string
  /** Kind-specific fields carried over from earlier versions (priority, category, …). */
  details: Record<string, unknown>
  addedAt: string
  editedAt: string
}

export interface ProjectAsset {
  projectId: string
  assetId: string
  /**
   * Percentage (0–100) of the asset's cost this project carries. Leave unset
   * to split the cost evenly between all projects using the asset.
   */
  sharePct?: number
}

/** "from" depends on "to" in the way the relation describes. */
export type Relation =
  | 'points_to' // domain → server: DNS points at the server
  | 'deploys_to' // repo → server: the code runs there
  | 'paid_with' // asset → card or account that pays for it
  | 'depends_on' // anything else

export interface Link {
  from: string
  to: string
  relation: Relation
  /**
   * Set when only part of "from" depends on "to": a subdomain (e.g. "staging")
   * pointing at a server. Losing "to" breaks that subdomain, not the whole domain.
   */
  subdomain?: string
}

export interface HoldingsData {
  version: typeof DATA_VERSION
  projects: Project[]
  assets: Asset[]
  projectAssets: ProjectAsset[]
  links: Link[]
}

export function emptyData(): HoldingsData {
  return { version: DATA_VERSION, projects: [], assets: [], projectAssets: [], links: [] }
}
