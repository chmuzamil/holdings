import { monthlyCostUsd } from './cost'
import type { Asset, HoldingsData } from './model'

export type CleanupReason = 'unused' | 'archived-only' | 'duplicate' | 'cancelled-but-renews'

export interface CleanupSuggestion {
  reason: CleanupReason
  /** The items involved: one, or several for duplicates. */
  assets: Asset[]
  /** What stopping it would save each month, in USD; null when it depends on which one you keep. */
  savingMonthlyUsd: number | null
  /** Projects using it (for archived-only). */
  projects: string[]
}

export interface Cleanup {
  suggestions: CleanupSuggestion[]
  /** Sum of the suggestions that have a known saving. */
  savingMonthlyUsd: number
}

/** Set on an item (details.keepWithoutProject) when it is for everything, like a design tool. */
export const KEEP_WITHOUT_PROJECT = 'keepWithoutProject'

/**
 * Things you may be paying for without needing them. Each suggestion is a
 * question for the owner, not a verdict: only they know whether an unlinked
 * subscription is for everything.
 */
export function cleanupSuggestions(data: HoldingsData, today: string): Cleanup {
  const projectsById = new Map(data.projects.map((project) => [project.id, project]))
  const usedBy = new Map<string, string[]>()
  for (const row of data.projectAssets) {
    if (!projectsById.has(row.projectId)) continue
    usedBy.set(row.assetId, [...(usedBy.get(row.assetId) ?? []), row.projectId])
  }

  const suggestions: CleanupSuggestion[] = []
  const paid = data.assets.filter((asset) => monthlyCostUsd(asset) > 0)

  for (const asset of paid) {
    const projectIds = usedBy.get(asset.id) ?? []
    const monthly = monthlyCostUsd(asset)
    if (!projectIds.length) {
      if (asset.details[KEEP_WITHOUT_PROJECT] === true) continue
      suggestions.push({ reason: 'unused', assets: [asset], savingMonthlyUsd: monthly, projects: [] })
    } else if (projectIds.every((id) => projectsById.get(id)?.status === 'archived')) {
      suggestions.push({
        reason: 'archived-only',
        assets: [asset],
        savingMonthlyUsd: monthly,
        projects: projectIds.map((id) => projectsById.get(id)?.name ?? id),
      })
    }
  }

  const byProvider = new Map<string, Asset[]>()
  for (const asset of paid.filter((item) => item.kind === 'subscription' && item.provider.trim())) {
    const key = asset.provider.trim().toLowerCase()
    byProvider.set(key, [...(byProvider.get(key) ?? []), asset])
  }
  for (const group of byProvider.values()) {
    if (group.length > 1) suggestions.push({ reason: 'duplicate', assets: group, savingMonthlyUsd: null, projects: [] })
  }

  for (const asset of data.assets) {
    if (asset.status === 'cancelled' && asset.renewsAt && asset.renewsAt >= today) {
      suggestions.push({ reason: 'cancelled-but-renews', assets: [asset], savingMonthlyUsd: null, projects: [] })
    }
  }

  const order: Record<CleanupReason, number> = { 'cancelled-but-renews': 0, unused: 1, 'archived-only': 1, duplicate: 2 }
  suggestions.sort((a, b) => order[a.reason] - order[b.reason] || (b.savingMonthlyUsd ?? 0) - (a.savingMonthlyUsd ?? 0))
  const saving = suggestions.reduce((sum, item) => sum + (item.savingMonthlyUsd ?? 0), 0)
  return { suggestions, savingMonthlyUsd: Math.round(saving * 100) / 100 }
}
