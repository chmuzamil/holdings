import { buildLedger, cleanupSuggestions, impactOf, localDate, monthlyCostUsd, summarizeCosts, type Asset, type HoldingsData, type Project } from '@holdings/core'
import { ToolError, type Tool } from './protocol'

const KINDS = ['domain', 'server', 'repo', 'account', 'subscription', 'credential', 'card', 'certificate', 'other']
const RELATION_WORDS = { points_to: 'points to', deploys_to: 'deploys to', paid_with: 'is paid with', depends_on: 'depends on' }

const round = (value: number) => Math.round(value * 100) / 100
const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/**
 * Finds one item by id or name: an exact match first, then a single partial
 * match. Otherwise tells the agent what it could have meant.
 */
function resolve<T extends { id: string; name: string }>(items: T[], query: unknown, label: string): T {
  const wanted = String(query ?? '').trim().toLowerCase()
  if (!wanted) throw new ToolError(`Say which ${label} you mean, by name or id.`)
  const exact = items.find((item) => item.id.toLowerCase() === wanted || item.name.toLowerCase() === wanted)
  if (exact) return exact
  const partial = items.filter((item) => item.name.toLowerCase().includes(wanted))
  if (partial.length === 1) return partial[0] as T
  const options = (partial.length ? partial : items).slice(0, 15).map((item) => item.name)
  throw new ToolError(
    partial.length
      ? `More than one ${label} matches "${query}": ${options.join(', ')}. Use the full name.`
      : `No ${label} called "${query}". Known ${label}s: ${options.join(', ') || 'none yet'}.`,
  )
}

function projectsUsing(data: HoldingsData, assetId: string): string[] {
  const ids = new Set(data.projectAssets.filter((row) => row.assetId === assetId).map((row) => row.projectId))
  return data.projects.filter((project) => ids.has(project.id)).map((project) => project.name)
}

/** The next date that needs attention: renewal or expiry, whichever comes first. */
function nextDate(asset: Asset): { date: string; event: 'renews' | 'expires' } | null {
  const dates = [
    asset.renewsAt && { date: asset.renewsAt, event: 'renews' as const },
    asset.expiresAt && { date: asset.expiresAt, event: 'expires' as const },
  ].filter(Boolean) as { date: string; event: 'renews' | 'expires' }[]
  return dates.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}

function upcoming(data: HoldingsData, today: string, days: number) {
  return data.assets
    .filter((asset) => asset.status !== 'cancelled')
    .map((asset) => ({ asset, next: nextDate(asset) }))
    .filter((item): item is { asset: Asset; next: { date: string; event: 'renews' | 'expires' } } => Boolean(item.next))
    .map(({ asset, next }) => ({ asset, next, daysLeft: daysBetween(today, next.date) }))
    .filter((item) => item.daysLeft <= days)
    .sort((a, b) => a.next.date.localeCompare(b.next.date))
    .map(({ asset, next, daysLeft }) => ({
      name: asset.name,
      kind: asset.kind,
      provider: asset.provider,
      [next.event === 'renews' ? 'renewsOn' : 'expiresOn']: next.date,
      daysLeft,
      overdue: daysLeft < 0,
      costUsd: asset.costUsd,
      billing: asset.billing,
      projects: projectsUsing(data, asset.id),
    }))
}

function assetSummary(data: HoldingsData, asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    provider: asset.provider,
    status: asset.status,
    monthlyCostUsd: round(monthlyCostUsd(asset)),
    costUsd: asset.costUsd,
    billing: asset.billing,
    renewsAt: asset.renewsAt || null,
    expiresAt: asset.expiresAt || null,
    projects: projectsUsing(data, asset.id),
    notes: asset.notes || undefined,
  }
}

const numberArg = (value: unknown, fallback: number, min: number, max: number) => {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new ToolError(`Use a number from ${min} to ${max}.`)
  return Math.round(number)
}

export function createTools(load: () => Promise<HoldingsData>, { now = () => new Date() } = {}): Tool[] {
  const today = () => localDate(now())

  return [
    {
      name: 'portfolio_overview',
      title: 'Portfolio overview',
      description:
        'Totals for everything in Holdings: monthly cost, tracked revenue and profit, cost not assigned to any project, how many items of each kind, and the next renewals. Start here. All money is in US dollars.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run() {
        const data = await load()
        const ledger = buildLedger(data, summarizeCosts(data))
        const byKind: Record<string, number> = {}
        for (const asset of data.assets) byKind[asset.kind] = (byKind[asset.kind] ?? 0) + 1
        return {
          asOf: today(),
          projects: data.projects.length,
          items: { total: data.assets.length, byKind },
          monthlyUsd: {
            cost: round(ledger.costMonthlyUsd),
            revenue: round(ledger.revenueMonthlyUsd),
            profit: round(ledger.profitMonthlyUsd),
            notInAnyProject: round(ledger.unassignedMonthlyUsd),
          },
          projectsTrackingRevenue: ledger.projectsWithRevenue,
          nextRenewals: upcoming(data, today(), 30).slice(0, 5),
        }
      },
    },
    {
      name: 'list_projects',
      title: 'List projects',
      description:
        'Every project with its status and monthly cost, revenue, profit and margin in US dollars. Shared servers and subscriptions are split between the projects using them. Revenue is null when the project does not track it (which is not the same as earning nothing).',
      inputSchema: {
        type: 'object',
        properties: { status: { type: 'string', description: 'Only projects with this status, e.g. production, beta, archived.' } },
        additionalProperties: false,
      },
      async run(args) {
        const data = await load()
        const ledger = buildLedger(data, summarizeCosts(data))
        const status = typeof args.status === 'string' ? args.status.toLowerCase() : ''
        return {
          projects: data.projects
            .filter((project) => !status || project.status === status)
            .map((project) => {
              const row = ledger.rows.find((item) => item.projectId === project.id)
              return {
                id: project.id,
                name: project.name,
                status: project.status,
                monthlyCostUsd: round(row?.costMonthlyUsd ?? 0),
                monthlyRevenueUsd: row?.revenueMonthlyUsd ?? null,
                monthlyProfitUsd: row?.profitMonthlyUsd === null || row?.profitMonthlyUsd === undefined ? null : round(row.profitMonthlyUsd),
                margin: row?.margin === null || row?.margin === undefined ? null : round(row.margin),
                items: data.projectAssets.filter((item) => item.projectId === project.id).length,
              }
            }),
        }
      },
    },
    {
      name: 'get_project',
      title: 'Project details',
      description:
        'One project in detail: description, live URL, what it costs line by line (including its share of shared items), revenue, and every domain, server, repo, account, subscription, key or card it uses, with how they depend on each other.',
      inputSchema: {
        type: 'object',
        properties: { project: { type: 'string', description: 'Project name or id.' } },
        required: ['project'],
        additionalProperties: false,
      },
      async run(args) {
        const data = await load()
        const project: Project = resolve(data.projects, args.project, 'project')
        const costs = summarizeCosts(data).projects.get(project.id)
        const assetIds = new Set(data.projectAssets.filter((row) => row.projectId === project.id).map((row) => row.assetId))
        const assets = data.assets.filter((asset) => assetIds.has(asset.id))
        const names = new Map(data.assets.map((asset) => [asset.id, asset.name]))
        const cost = costs?.monthlyUsd ?? 0
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          description: project.description || undefined,
          liveUrl: project.liveUrl || undefined,
          notes: project.notes || undefined,
          monthlyUsd: {
            cost: round(cost),
            revenue: project.monthlyRevenueUsd,
            profit: project.monthlyRevenueUsd === null ? null : round(project.monthlyRevenueUsd - cost),
          },
          costLines: (costs?.lines ?? []).map((line) => ({
            name: line.name,
            kind: line.kind,
            monthlyUsd: round(line.monthlyUsd),
            sharePct: Math.round(line.share * 100),
            sharedByProjects: line.sharedBy,
          })),
          items: assets.map((asset) => assetSummary(data, asset)),
          dependencies: data.links
            .filter((link) => assetIds.has(link.from) || assetIds.has(link.to))
            .map((link) => `${link.subdomain ? `${link.subdomain}.` : ''}${names.get(link.from) ?? link.from} ${RELATION_WORDS[link.relation]} ${names.get(link.to) ?? link.to}`),
        }
      },
    },
    {
      name: 'list_items',
      title: 'List items',
      description:
        'Domains, servers, repos, accounts, subscriptions, keys, certificates and cards, with provider, status, monthly cost in US dollars, renewal and expiry dates, and the projects using each. Filter by kind or by text in the name or provider. Holdings stores metadata only, never secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS, description: 'Only items of this kind.' },
          query: { type: 'string', description: 'Text to look for in the name or provider.' },
          limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Most items to return (default 100).' },
        },
        additionalProperties: false,
      },
      async run(args) {
        const data = await load()
        const kind = typeof args.kind === 'string' ? args.kind : ''
        if (kind && !KINDS.includes(kind)) throw new ToolError(`Unknown kind "${kind}". Use one of: ${KINDS.join(', ')}.`)
        const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
        const limit = numberArg(args.limit, 100, 1, 500)
        const matches = data.assets.filter((asset) =>
          (!kind || asset.kind === kind) && (!query || `${asset.name} ${asset.provider}`.toLowerCase().includes(query)))
        return { total: matches.length, items: matches.slice(0, limit).map((asset) => assetSummary(data, asset)) }
      },
    },
    {
      name: 'upcoming_renewals',
      title: 'Upcoming renewals and expiries',
      description:
        'Everything that renews or expires within the next N days (default 30), soonest first, including anything already overdue. Covers domains, servers, subscriptions, certificates, API keys and payment cards. Says which projects each one affects.',
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'How many days ahead to look (default 30).' } },
        additionalProperties: false,
      },
      async run(args) {
        const data = await load()
        const days = numberArg(args.days, 30, 1, 365)
        return { asOf: today(), days, items: upcoming(data, today(), days) }
      },
    },
    {
      name: 'cleanup_suggestions',
      title: 'Clean-up suggestions',
      description:
        'Paid items the owner may not need: not used by any project, only used by archived projects, several subscriptions with the same provider, or marked cancelled but still showing a renewal. Includes the monthly saving in US dollars where it is known. These are questions for the owner, not verdicts: an unlinked subscription may be for everything.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run() {
        const data = await load()
        const cleanup = cleanupSuggestions(data, today())
        return {
          asOf: today(),
          possibleSavingMonthlyUsd: cleanup.savingMonthlyUsd,
          suggestions: cleanup.suggestions.map((item) => ({
            reason: item.reason,
            items: item.assets.map((asset) => ({ name: asset.name, kind: asset.kind, provider: asset.provider })),
            savingMonthlyUsd: item.savingMonthlyUsd === null ? null : round(item.savingMonthlyUsd),
            ...(item.projects.length ? { projects: item.projects } : {}),
          })),
        }
      },
    },
    {
      name: 'what_breaks_if',
      title: 'What breaks if…',
      description:
        'What stops working if one item stops: a server goes down, a domain lapses, a card is declined, an account is lost. Follows dependencies (domains pointing at servers, repos deploying to them, things paid with a card) and lists the affected items, subdomains and projects, with the monthly revenue at risk.',
      inputSchema: {
        type: 'object',
        properties: { item: { type: 'string', description: 'Name or id of the domain, server, card, account or other item.' } },
        required: ['item'],
        additionalProperties: false,
      },
      async run(args) {
        const data = await load()
        const asset = resolve(data.assets, args.item, 'item')
        const impact = impactOf(data, asset.id)
        if (!impact) throw new ToolError(`Couldn't work out the impact of ${asset.name}.`)
        const names = new Map(data.assets.map((item) => [item.id, item.name]))
        return {
          stopped: { name: impact.stopped.name, kind: impact.stopped.kind },
          affectedProjects: impact.affectedProjects.map((item) => ({
            name: item.project.name,
            monthlyRevenueUsd: item.project.monthlyRevenueUsd,
            through: item.through.map((through) => through.name),
          })),
          affectedItems: impact.affectedAssets.map((item) => ({
            name: item.asset.name,
            kind: item.asset.kind,
            because: item.path.map((step) => `${names.get(step.assetId) ?? step.assetId} ${RELATION_WORDS[step.relation]}`).join(' → ') + ` ${impact.stopped.name}`,
          })),
          affectedSubdomains: impact.affectedSubdomains.map((item) => `${item.subdomain}.${item.asset.name} (points to ${item.pointsTo.name})`),
          monthlyRevenueAtRiskUsd: round(impact.revenueAtRiskUsd),
          projectsWithUnknownRevenue: impact.projectsWithUnknownRevenue,
        }
      },
    },
  ]
}
