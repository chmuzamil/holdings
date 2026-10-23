import { monthlyCostUsd, summarizeCosts } from './cost'
import type { Asset, AssetKind, HoldingsData, Project } from './model'

export interface ExitAsset {
  asset: Asset
  /** This project's monthly share of the asset's cost. */
  monthlyUsd: number
  /** Other projects using the same asset; it can't simply be handed over. */
  sharedWith: string[]
  /** Name of the card or account that pays for it, if recorded. */
  paidWith: string
  steps: string[]
}

export interface ExitPack {
  project: Project
  generatedAt: string
  /** Local calendar date the pack was made. */
  generatedOn: string
  monthlyRevenueUsd: number | null
  monthlyCostUsd: number
  assets: ExitAsset[]
  /** Dates within the next 90 days a buyer needs to know about. */
  upcoming: { asset: Asset; label: string; date: string }[]
  /** Things to settle before the sale that aren't tied to one asset. */
  generalSteps: string[]
}

// What a seller typically has to do to hand each kind of asset over.
const STEPS: Record<AssetKind, string[]> = {
  domain: [
    'Unlock the domain at the registrar.',
    'Get the transfer (EPP/auth) code and send it to the buyer.',
    'Hand over DNS records, or transfer the DNS zone too.',
    'Confirm the transfer once the buyer starts it.',
  ],
  server: [
    'Agree whether the buyer takes over the account or migrates to their own server.',
    'Take a final backup and share it securely.',
    'Hand over server access, then remove your own keys.',
  ],
  repo: [
    'Transfer the repository to the buyer\'s GitHub account or organisation.',
    'Check deploy keys, secrets and CI settings after the transfer.',
  ],
  account: [
    'Change the account email and owner to the buyer.',
    'Turn off your two-factor device and let the buyer set up theirs.',
  ],
  subscription: [
    'Move the subscription to the buyer\'s billing, or cancel it on the handover date.',
  ],
  credential: [
    'Do not send the key. The buyer creates a new one, then you revoke yours.',
  ],
  certificate: [
    'Let the buyer issue a new certificate on their own server after the domain moves.',
  ],
  card: [
    'Move every bill paid with this card to the buyer\'s card before the handover date.',
  ],
  other: ['Agree how this is handed over.'],
}

const KIND_ORDER: AssetKind[] = ['domain', 'server', 'repo', 'subscription', 'account', 'credential', 'certificate', 'card', 'other']

function daysUntil(date: string, now: Date): number | null {
  const time = Date.parse(`${date}T00:00:00`)
  if (Number.isNaN(time)) return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return Math.round((time - start.getTime()) / 86400000)
}

export function buildExitPack(data: HoldingsData, projectId: string, now: Date = new Date()): ExitPack | null {
  const project = data.projects.find((item) => item.id === projectId)
  if (!project) return null

  const assets = new Map(data.assets.map((asset) => [asset.id, asset]))
  const projectNames = new Map(data.projects.map((item) => [item.id, item.name]))
  const costs = summarizeCosts(data).projects.get(projectId)
  const shareOf = new Map((costs?.lines ?? []).map((line) => [line.assetId, line.monthlyUsd]))

  const usersOf = (assetId: string) => data.projectAssets
    .filter((row) => row.assetId === assetId && row.projectId !== projectId)
    .map((row) => projectNames.get(row.projectId))
    .filter((name): name is string => Boolean(name))

  const own = data.projectAssets.filter((row) => row.projectId === projectId).map((row) => assets.get(row.assetId)).filter((asset): asset is Asset => Boolean(asset))
  // Cards that pay for this project's assets belong in the pack too.
  const cards = data.links
    .filter((link) => link.relation === 'paid_with' && own.some((asset) => asset.id === link.from))
    .map((link) => assets.get(link.to))
    .filter((asset): asset is Asset => Boolean(asset) && !own.includes(asset as Asset))
  const included = [...new Set([...own, ...cards])]

  const exitAssets: ExitAsset[] = included
    .map((asset) => {
      const paidWithId = data.links.find((link) => link.from === asset.id && link.relation === 'paid_with')?.to
      const sharedWith = usersOf(asset.id)
      const steps = [...STEPS[asset.kind]]
      if (sharedWith.length && asset.kind !== 'card') {
        steps.unshift(`Also used by ${sharedWith.join(', ')}. Split it off or keep it and give the buyer a replacement.`)
      }
      return {
        asset,
        monthlyUsd: shareOf.get(asset.id) ?? (cards.includes(asset) ? 0 : monthlyCostUsd(asset)),
        sharedWith,
        paidWith: paidWithId ? assets.get(paidWithId)?.name ?? '' : '',
        steps,
      }
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.asset.kind) - KIND_ORDER.indexOf(b.asset.kind) || a.asset.name.localeCompare(b.asset.name))

  const upcoming = included
    .flatMap((asset) => [
      ['Renews', asset.renewsAt],
      ['Expires', asset.expiresAt],
    ].filter(([, date]) => date).map(([label, date]) => ({ asset, label: label as string, date: date as string })))
    .filter((item) => {
      const days = daysUntil(item.date, now)
      return days !== null && days >= 0 && days <= 90
    })
    .filter((item, index, list) => list.findIndex((other) => other.asset.id === item.asset.id && other.date === item.date) === index)
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    project,
    generatedAt: now.toISOString(),
    generatedOn: localDate(now),
    monthlyRevenueUsd: project.monthlyRevenueUsd,
    monthlyCostUsd: costs?.monthlyUsd ?? 0,
    assets: exitAssets,
    upcoming,
    generalSteps: [
      'Agree a handover date and what is included (domains, code, accounts, customers, content).',
      'Export customer data and hand it over in line with your privacy policy.',
      'Tell customers and payment providers about the new owner where needed.',
      'After the handover, rotate or revoke every key and password you still know.',
    ],
  }
}

const KIND_TITLES: Record<AssetKind, string> = {
  domain: 'Domains',
  server: 'Servers',
  repo: 'Code',
  subscription: 'Subscriptions',
  account: 'Accounts',
  credential: 'Keys and tokens',
  certificate: 'Certificates',
  card: 'Payment cards',
  other: 'Other',
}

/** YYYY-MM-DD in local time (toISOString would give the UTC date). */
export function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const usd = (value: number) => `$${value.toFixed(value % 1 ? 2 : 0)}`

/** The pack as Markdown, for a data room, an email or a listing. */
export function exitPackMarkdown(pack: ExitPack): string {
  const { project } = pack
  const lines: string[] = [
    `# ${project.name}: asset register and transfer checklist`,
    '',
    `Generated ${pack.generatedOn} with Holdings. Secrets (keys, passwords, card numbers) are not included.`,
    '',
  ]
  if (project.description) lines.push(project.description, '')
  if (project.liveUrl) lines.push(`Live: ${project.liveUrl}`, '')
  lines.push(
    '## Money',
    '',
    `- Revenue: ${pack.monthlyRevenueUsd === null ? 'not tracked' : `${usd(pack.monthlyRevenueUsd)} a month`}`,
    `- Running costs: ${usd(pack.monthlyCostUsd)} a month (${usd(pack.monthlyCostUsd * 12)} a year)`,
  )
  if (pack.monthlyRevenueUsd !== null) lines.push(`- Profit: ${usd(pack.monthlyRevenueUsd - pack.monthlyCostUsd)} a month`)
  lines.push('')

  if (pack.upcoming.length) {
    lines.push('## Coming up in the next 90 days', '')
    for (const item of pack.upcoming) lines.push(`- ${item.date}: ${item.asset.name} (${item.label.toLowerCase()})`)
    lines.push('')
  }

  lines.push('## What is included', '')
  for (const kind of KIND_ORDER) {
    const group = pack.assets.filter((item) => item.asset.kind === kind)
    if (!group.length) continue
    lines.push(`### ${KIND_TITLES[kind]}`, '')
    for (const item of group) {
      const facts = [
        item.asset.provider,
        item.monthlyUsd ? `${usd(item.monthlyUsd)}/mo` : '',
        item.asset.renewsAt ? `renews ${item.asset.renewsAt}` : '',
        item.asset.expiresAt && item.asset.expiresAt !== item.asset.renewsAt ? `expires ${item.asset.expiresAt}` : '',
        item.paidWith ? `paid with ${item.paidWith}` : '',
        typeof item.asset.details.keptIn === 'string' && item.asset.details.keptIn ? `kept in ${item.asset.details.keptIn}` : '',
        item.sharedWith.length ? `shared with ${item.sharedWith.join(', ')}` : '',
      ].filter(Boolean)
      lines.push(`- **${item.asset.name}**${facts.length ? `: ${facts.join(' · ')}` : ''}`)
    }
    lines.push('')
  }

  lines.push('## Transfer checklist', '')
  for (const step of pack.generalSteps) lines.push(`- [ ] ${step}`)
  for (const item of pack.assets) {
    lines.push('', `**${item.asset.name}**`)
    for (const step of item.steps) lines.push(`- [ ] ${step}`)
  }
  lines.push('')
  return lines.join('\n')
}
