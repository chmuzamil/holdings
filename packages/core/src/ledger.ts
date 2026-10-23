import { summarizeCosts, type CostSummary } from './cost'
import type { HoldingsData } from './model'

export interface LedgerRow {
  projectId: string
  name: string
  costMonthlyUsd: number
  /** null when the project's revenue isn't tracked. */
  revenueMonthlyUsd: number | null
  /** Revenue minus cost; null when revenue isn't tracked. */
  profitMonthlyUsd: number | null
  /** Profit as a fraction of revenue; null without revenue. */
  margin: number | null
}

export interface Ledger {
  rows: LedgerRow[]
  /** Sum of tracked revenue. */
  revenueMonthlyUsd: number
  /** Everything tracked costs, including costs no project carries. */
  costMonthlyUsd: number
  unassignedMonthlyUsd: number
  /** Revenue minus all costs, so unassigned costs are never hidden. */
  profitMonthlyUsd: number
  /** How many projects have revenue tracked. */
  projectsWithRevenue: number
}

export function buildLedger(data: HoldingsData, costs: CostSummary = summarizeCosts(data)): Ledger {
  const rows = data.projects.map((project): LedgerRow => {
    const costMonthlyUsd = costs.projects.get(project.id)?.monthlyUsd ?? 0
    const revenueMonthlyUsd = project.monthlyRevenueUsd
    const profitMonthlyUsd = revenueMonthlyUsd === null ? null : revenueMonthlyUsd - costMonthlyUsd
    return {
      projectId: project.id,
      name: project.name,
      costMonthlyUsd,
      revenueMonthlyUsd,
      profitMonthlyUsd,
      margin: profitMonthlyUsd !== null && revenueMonthlyUsd ? profitMonthlyUsd / revenueMonthlyUsd : null,
    }
  })

  const revenueMonthlyUsd = rows.reduce((sum, row) => sum + (row.revenueMonthlyUsd ?? 0), 0)
  return {
    rows,
    revenueMonthlyUsd,
    costMonthlyUsd: costs.totalMonthlyUsd,
    unassignedMonthlyUsd: costs.unassignedMonthlyUsd,
    profitMonthlyUsd: revenueMonthlyUsd - costs.totalMonthlyUsd,
    projectsWithRevenue: rows.filter((row) => row.revenueMonthlyUsd !== null).length,
  }
}
