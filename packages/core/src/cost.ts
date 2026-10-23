import type { Asset, HoldingsData, ProjectAsset } from './model'

/** What an asset costs per month, in USD. Yearly costs are spread over 12 months. */
export function monthlyCostUsd(asset: Pick<Asset, 'costUsd' | 'billing' | 'status'>): number {
  if (asset.status === 'cancelled' || asset.billing === 'free') return 0
  const cost = Number.isFinite(asset.costUsd) && asset.costUsd > 0 ? asset.costUsd : 0
  return asset.billing === 'yearly' ? cost / 12 : cost
}

export interface CostLine {
  assetId: string
  name: string
  kind: Asset['kind']
  /** The asset's full monthly cost. */
  assetMonthlyUsd: number
  /** The part of it this project carries. */
  monthlyUsd: number
  /** Fraction (0–1) of the asset's cost this project carries. */
  share: number
  /** Number of projects that use this asset. */
  sharedBy: number
}

export interface ProjectCost {
  projectId: string
  monthlyUsd: number
  lines: CostLine[]
}

export interface CostSummary {
  /** Monthly cost of everything tracked. Always equals the sum of `projects` plus `unassignedMonthlyUsd`. */
  totalMonthlyUsd: number
  projects: Map<string, ProjectCost>
  /** Cost not carried by any project: unlinked assets, plus any part of a shared asset not covered by explicit shares. */
  unassignedMonthlyUsd: number
  unassigned: CostLine[]
}

/**
 * Fractions of an asset's cost carried by each project using it.
 *
 * Explicit percentages are used as given (capped so they never add up to more
 * than 100%). Projects without a percentage split whatever is left evenly. If
 * every project has a percentage and they add up to less than 100%, the rest
 * stays unassigned.
 */
export function shareFractions(rows: ProjectAsset[]): Map<string, number> {
  const fractions = new Map<string, number>()
  const explicit = rows.filter((row) => typeof row.sharePct === 'number' && Number.isFinite(row.sharePct))
  const implicit = rows.filter((row) => !explicit.includes(row))

  let remaining = 1
  for (const row of explicit) {
    const fraction = Math.min(Math.max((row.sharePct ?? 0) / 100, 0), remaining)
    fractions.set(row.projectId, (fractions.get(row.projectId) ?? 0) + fraction)
    remaining -= fraction
  }
  for (const row of implicit) {
    fractions.set(row.projectId, (fractions.get(row.projectId) ?? 0) + remaining / implicit.length)
  }
  return fractions
}

export function summarizeCosts(data: HoldingsData): CostSummary {
  const projectIds = new Set(data.projects.map((project) => project.id))
  const rowsByAsset = new Map<string, ProjectAsset[]>()
  for (const row of data.projectAssets) {
    if (!projectIds.has(row.projectId)) continue
    const rows = rowsByAsset.get(row.assetId) ?? []
    // One row per project and asset; a duplicate would count the project twice.
    if (!rows.some((existing) => existing.projectId === row.projectId)) rows.push(row)
    rowsByAsset.set(row.assetId, rows)
  }

  const projects = new Map<string, ProjectCost>(
    data.projects.map((project) => [project.id, { projectId: project.id, monthlyUsd: 0, lines: [] }]),
  )
  const unassigned: CostLine[] = []
  let totalMonthlyUsd = 0

  for (const asset of data.assets) {
    const assetMonthlyUsd = monthlyCostUsd(asset)
    totalMonthlyUsd += assetMonthlyUsd
    const rows = rowsByAsset.get(asset.id) ?? []
    const base = { assetId: asset.id, name: asset.name, kind: asset.kind, assetMonthlyUsd, sharedBy: rows.length }

    let carried = 0
    for (const [projectId, share] of shareFractions(rows)) {
      const cost = projects.get(projectId)
      if (!cost) continue
      const monthlyUsd = assetMonthlyUsd * share
      cost.lines.push({ ...base, monthlyUsd, share })
      cost.monthlyUsd += monthlyUsd
      carried += share
    }

    const leftover = 1 - carried
    if (leftover > 1e-9) {
      unassigned.push({ ...base, monthlyUsd: assetMonthlyUsd * leftover, share: leftover })
    }
  }

  const unassignedMonthlyUsd = unassigned.reduce((sum, line) => sum + line.monthlyUsd, 0)
  for (const cost of projects.values()) cost.lines.sort((a, b) => b.monthlyUsd - a.monthlyUsd)
  unassigned.sort((a, b) => b.monthlyUsd - a.monthlyUsd)

  return { totalMonthlyUsd, projects, unassignedMonthlyUsd, unassigned }
}
