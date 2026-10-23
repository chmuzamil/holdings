import type { Asset, HoldingsData, Link, Project } from './model'

/** Why an item is affected: the chain of dependencies back to the item that stopped. */
export interface ImpactStep {
  /** The item that depends on the next one in the chain. */
  assetId: string
  relation: Link['relation']
}

export interface AffectedAsset {
  asset: Asset
  /** From this asset down to the one that stopped, e.g. domain → points_to → server. */
  path: ImpactStep[]
}

/** A subdomain that stops while the rest of its domain keeps working. */
export interface AffectedSubdomain {
  asset: Asset
  subdomain: string
  /** The stopped or affected asset the subdomain points to. */
  pointsTo: Asset
}

export interface AffectedProject {
  project: Project
  /** The stopped or affected items this project uses. */
  through: Asset[]
}

export interface Impact {
  stopped: Asset
  affectedAssets: AffectedAsset[]
  affectedSubdomains: AffectedSubdomain[]
  affectedProjects: AffectedProject[]
  /** Monthly revenue of the affected projects that track revenue. */
  revenueAtRiskUsd: number
  /** Affected projects whose revenue isn't tracked, so the risk above may be low. */
  projectsWithUnknownRevenue: number
}

/**
 * What stops working if one asset stops (a server dies, a domain lapses, a
 * card is declined). Follows dependency links backwards: anything that
 * points to, deploys to or is paid with the stopped asset is affected, and so
 * is anything depending on those, transitively. Projects that use any
 * affected asset are affected.
 */
export function impactOf(data: HoldingsData, assetId: string): Impact | null {
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]))
  const stopped = assets.get(assetId)
  if (!stopped) return null

  // dependents.get(x) = links whose "to" is x, i.e. things that depend on x.
  const dependents = new Map<string, Link[]>()
  for (const link of data.links) {
    const list = dependents.get(link.to) ?? []
    list.push(link)
    dependents.set(link.to, list)
  }

  const paths = new Map<string, ImpactStep[]>([[assetId, []]])
  const partial: AffectedSubdomain[] = []
  const queue = [assetId]
  while (queue.length) {
    const current = queue.shift() as string
    for (const link of dependents.get(current) ?? []) {
      if (!assets.has(link.from)) continue
      // A subdomain link breaks only that subdomain; it doesn't take the domain (or its projects) down.
      if (link.subdomain) {
        partial.push({ asset: assets.get(link.from) as Asset, subdomain: link.subdomain, pointsTo: assets.get(current) as Asset })
        continue
      }
      if (paths.has(link.from)) continue
      paths.set(link.from, [{ assetId: link.from, relation: link.relation }, ...(paths.get(current) ?? [])])
      queue.push(link.from)
    }
  }

  const affectedAssets: AffectedAsset[] = [...paths.entries()]
    .filter(([id]) => id !== assetId)
    .map(([id, path]) => ({ asset: assets.get(id) as Asset, path }))
    .sort((a, b) => a.path.length - b.path.length || a.asset.name.localeCompare(b.asset.name))

  const hit = new Set(paths.keys())
  const projects = new Map(data.projects.map((project) => [project.id, project]))
  const through = new Map<string, Asset[]>()
  for (const row of data.projectAssets) {
    if (!hit.has(row.assetId) || !projects.has(row.projectId)) continue
    const list = through.get(row.projectId) ?? []
    const asset = assets.get(row.assetId) as Asset
    if (!list.includes(asset)) list.push(asset)
    through.set(row.projectId, list)
  }

  const affectedProjects: AffectedProject[] = [...through.entries()]
    .map(([projectId, list]) => ({ project: projects.get(projectId) as Project, through: list }))
    .sort((a, b) => (b.project.monthlyRevenueUsd ?? -1) - (a.project.monthlyRevenueUsd ?? -1) || a.project.name.localeCompare(b.project.name))

  const affectedSubdomains = partial
    .filter((item) => !hit.has(item.asset.id))
    .sort((a, b) => `${a.subdomain}.${a.asset.name}`.localeCompare(`${b.subdomain}.${b.asset.name}`))

  return {
    stopped,
    affectedAssets,
    affectedSubdomains,
    affectedProjects,
    revenueAtRiskUsd: affectedProjects.reduce((sum, item) => sum + (item.project.monthlyRevenueUsd ?? 0), 0),
    projectsWithUnknownRevenue: affectedProjects.filter((item) => item.project.monthlyRevenueUsd === null).length,
  }
}

/** Every asset ranked by how much would stop with it: revenue at risk, then projects, then items. */
export function rankByImpact(data: HoldingsData): Impact[] {
  return data.assets
    .map((asset) => impactOf(data, asset.id) as Impact)
    .filter((impact) => impact.affectedProjects.length || impact.affectedAssets.length || impact.affectedSubdomains.length)
    .sort((a, b) =>
      b.revenueAtRiskUsd - a.revenueAtRiskUsd
      || b.affectedProjects.length - a.affectedProjects.length
      || b.affectedAssets.length - a.affectedAssets.length)
}
