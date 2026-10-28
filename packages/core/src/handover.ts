import { activityLabel, lastActivity, stageLabel } from './activity'
import { summarizeCosts } from './cost'
import { localDate } from './exit'
import type { Asset, HoldingsData } from './model'

export interface HandoverOptions {
  /** Who the pack is for, e.g. "Sara". */
  recipient: string
  /** Who wrote it. */
  owner: string
  /** A personal note from the owner, shown first. */
  message: string
}

export interface HandoverSection {
  heading: string
  paragraphs: string[]
  items: string[]
}

export interface HandoverDoc {
  title: string
  generatedAt: string
  generatedOn: string
  sections: HandoverSection[]
}


const usd = (value: number) => `$${value.toFixed(value % 1 ? 2 : 0)}`

function daysUntil(date: string, now: Date): number | null {
  const time = Date.parse(`${date}T00:00:00`)
  if (Number.isNaN(time)) return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return Math.round((time - start.getTime()) / 86400000)
}

function keptIn(asset: Asset): string {
  return typeof asset.details.keptIn === 'string' ? asset.details.keptIn : ''
}

/**
 * Everything a trusted person needs to keep the projects running (or wind
 * them down) if the owner is unavailable. Contains where secrets are kept,
 * never the secrets.
 */
export function buildHandover(data: HoldingsData, options: HandoverOptions, now: Date = new Date()): HandoverDoc {
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]))
  const costs = summarizeCosts(data)
  const paidWith = (asset: Asset) => {
    const link = data.links.find((item) => item.from === asset.id && item.relation === 'paid_with')
    return link ? assets.get(link.to)?.name ?? '' : ''
  }
  const live = data.assets.filter((asset) => asset.status !== 'cancelled')

  const dueSoon = live
    .map((asset) => {
      const dates = [asset.renewsAt, asset.expiresAt].filter(Boolean).sort()
      const date = dates[0] ?? ''
      return { asset, date, days: date ? daysUntil(date, now) : null }
    })
    .filter((item) => item.days !== null && item.days <= 30)
    .sort((a, b) => a.date.localeCompare(b.date))

  const sections: HandoverSection[] = []

  sections.push({
    heading: `For ${options.recipient || 'you'}`,
    paragraphs: [
      options.message.trim() || `${options.owner || 'I'} put this together so you can keep things running, or wind them down calmly, if I can't.`,
      'This file does not contain passwords, keys or card numbers. It says where each one is kept.',
    ],
    items: [],
  })

  sections.push({
    heading: 'Do this first (next 30 days)',
    paragraphs: dueSoon.length ? [] : ['Nothing renews or expires in the next 30 days.'],
    items: dueSoon.map(({ asset, date, days }) => {
      const when = (days as number) < 0 ? `was due ${date}` : `${date} (in ${days} day${days === 1 ? '' : 's'})`
      const extra = [asset.provider, paidWith(asset) ? `paid with ${paidWith(asset)}` : '', keptIn(asset) ? `kept in ${keptIn(asset)}` : ''].filter(Boolean)
      const detail = extra.join(', ')
      return `${asset.name}: ${when}${detail ? `. ${detail.charAt(0).toUpperCase()}${detail.slice(1)}` : ''}.`
    }),
  })

  for (const project of data.projects) {
    const rows = data.projectAssets.filter((row) => row.projectId === project.id)
    const projectAssets = rows.map((row) => assets.get(row.assetId)).filter((asset): asset is Asset => Boolean(asset))
    const money = [
      project.monthlyRevenueUsd === null ? 'Revenue not tracked' : `Earns ${usd(project.monthlyRevenueUsd)} a month`,
      `costs ${usd(costs.projects.get(project.id)?.monthlyUsd ?? 0)} a month`,
    ].join(', ')
    const stage = `Stage: ${stageLabel(project.stage)}. Last worked on: ${activityLabel(lastActivity(data, project.id))}.`
    sections.push({
      heading: `Project: ${project.name}`,
      paragraphs: [project.description, project.liveUrl ? `Live at ${project.liveUrl}.` : '', `${money}.`, stage, project.notes].filter(Boolean),
      items: projectAssets.map((asset) => {
        const facts = [asset.provider, keptIn(asset) ? `kept in ${keptIn(asset)}` : '', asset.notes].filter(Boolean)
        return `${asset.name}${facts.length ? `: ${facts.join('. ')}` : ''}`
      }),
    })
  }

  const keys = live.filter((asset) => asset.kind === 'credential' || asset.kind === 'certificate')
  if (keys.length) {
    sections.push({
      heading: 'Where keys and logins are kept',
      paragraphs: [],
      items: keys.map((asset) => `${asset.name}${keptIn(asset) ? `: ${keptIn(asset)}` : ': not recorded'}`),
    })
  }

  const cards = live.filter((asset) => asset.kind === 'card')
  if (cards.length) {
    sections.push({
      heading: 'Bills and cards',
      paragraphs: ['If a card is cancelled or expires, these bills will fail.'],
      items: cards.map((card) => {
        const bills = data.links.filter((link) => link.to === card.id && link.relation === 'paid_with').map((link) => assets.get(link.from)?.name).filter(Boolean)
        return `${card.name}: ${bills.length ? bills.join(', ') : 'no bills recorded'}`
      }),
    })
  }

  sections.push({
    heading: 'If you need to wind things down',
    paragraphs: [],
    items: [
      'Tell customers first, and give them a date and a way to export their data.',
      'Cancel subscriptions and servers after the data is safe.',
      'Keep the domains for at least a year so nobody else can impersonate the projects.',
      `In total everything costs about ${usd(costs.totalMonthlyUsd)} a month.`,
    ],
  })

  return {
    title: `If ${options.owner || 'the owner'} is unavailable`,
    generatedAt: now.toISOString(),
    generatedOn: localDate(now),
    sections,
  }
}

export function handoverMarkdown(doc: HandoverDoc): string {
  const lines = [`# ${doc.title}`, '', `Written ${doc.generatedOn}.`, '']
  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '')
    for (const paragraph of section.paragraphs) lines.push(paragraph, '')
    for (const item of section.items) lines.push(`- ${item}`)
    if (section.items.length) lines.push('')
  }
  return lines.join('\n')
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** The document body as HTML. Every piece of user text is escaped. */
export function handoverHtml(doc: HandoverDoc): string {
  const parts = [`<h1>${escapeHtml(doc.title)}</h1>`, `<p class="meta">Written ${escapeHtml(doc.generatedOn)}.</p>`]
  for (const section of doc.sections) {
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`)
    for (const paragraph of section.paragraphs) parts.push(`<p>${escapeHtml(paragraph)}</p>`)
    if (section.items.length) parts.push(`<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
  }
  return parts.join('\n')
}
