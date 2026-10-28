import type { HoldingsData } from './model'

export interface Activity {
  /** ISO date (YYYY-MM-DD). */
  date: string
  /** A linked repo's last push, or the date the owner set by hand. */
  source: 'repo' | 'manual'
}

/**
 * When a project was last worked on: the newest push to a linked repo
 * (from the GitHub import), or the "last worked on" date the owner set,
 * whichever is later. null when neither is known (nothing is guessed).
 */
export function lastActivity(data: HoldingsData, projectId: string): Activity | null {
  const project = data.projects.find((item) => item.id === projectId)
  if (!project) return null
  const repoIds = new Set(data.projectAssets.filter((row) => row.projectId === projectId).map((row) => row.assetId))
  const candidates: Activity[] = []
  for (const asset of data.assets) {
    if (asset.kind !== 'repo' || !repoIds.has(asset.id)) continue
    const pushed = asset.details.lastCommitAt
    if (typeof pushed === 'string' && /^\d{4}-\d{2}-\d{2}/.test(pushed)) candidates.push({ date: pushed.slice(0, 10), source: 'repo' })
  }
  if (project.lastWorkedOn) candidates.push({ date: project.lastWorkedOn, source: 'manual' })
  return candidates.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

export function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
}

const STAGE_WORDS: Record<string, string> = {
  idea: 'Idea', building: 'Building', launched: 'Launched', maintenance: 'Maintenance', paused: 'Paused', archived: 'Archived',
}

export function stageLabel(stage: string): string {
  return STAGE_WORDS[stage] ?? stage
}

/** "2026-08-20 (last push to a linked repo)", or "not known". */
export function activityLabel(activity: Activity | null): string {
  if (!activity) return 'not known'
  return `${activity.date} (${activity.source === 'repo' ? 'last push to a linked repo' : 'set by hand'})`
}
