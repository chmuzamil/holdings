import type { Asset, HoldingsData } from './model'

// Calendar (iCalendar, RFC 5545) of renewals and expiries. Events are all-day
// and keep the same UID across exports, so importing or refreshing the feed
// updates an event instead of adding a copy.

export interface CalendarOptions {
  /** Only items used by this project. */
  projectId?: string
  /** Only this item ("Add to calendar" for one row). */
  assetId?: string
  /** Add a reminder this many days before (0 or undefined for none). */
  alarmDays?: number
  /** For the calendar's name and the UIDs' domain. */
  name?: string
  now?: Date
}

const KINDS = new Set<Asset['kind']>(['domain', 'subscription', 'server', 'credential', 'certificate', 'card', 'account'])
const UID_DOMAIN = 'holdings.local'

/** UTF-8 size in bytes (core runs anywhere, so no TextEncoder). */
export function utf8Length(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Folds a content line to at most 75 octets (UTF-8), continuing with CRLF and
 * a space. Never splits a multi-byte character.
 */
export function foldLine(line: string): string {
  if (utf8Length(line) <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = utf8Length(char)
    // Continuation lines start with a space, which counts towards the 75.
    const limit = parts.length ? 74 : 75
    if (size + bytes > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const date = (iso: string) => iso.replace(/-/g, '')
const nextDay = (iso: string) => {
  const day = new Date(`${iso}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10).replace(/-/g, '')
}
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const KIND_WORDS: Record<string, string> = {
  domain: 'Domain', subscription: 'Subscription', server: 'Server', credential: 'Key',
  certificate: 'Certificate', card: 'Card', account: 'Account',
}

export interface CalendarEvent {
  uid: string
  date: string
  summary: string
  description: string
}

/** The events a calendar would hold, before formatting. */
export function calendarEvents(data: HoldingsData, options: Pick<CalendarOptions, 'projectId' | 'assetId'> = {}): CalendarEvent[] {
  const inProject = options.projectId
    ? new Set(data.projectAssets.filter((row) => row.projectId === options.projectId).map((row) => row.assetId))
    : null
  const projectNames = (assetId: string) => {
    const ids = new Set(data.projectAssets.filter((row) => row.assetId === assetId).map((row) => row.projectId))
    return data.projects.filter((project) => ids.has(project.id)).map((project) => project.name)
  }
  const events: CalendarEvent[] = []
  for (const asset of data.assets) {
    if (!KINDS.has(asset.kind) || asset.status === 'cancelled') continue
    if (inProject && !inProject.has(asset.id)) continue
    if (options.assetId && asset.id !== options.assetId) continue
    const projects = projectNames(asset.id)
    const add = (iso: string, event: 'renews' | 'expires') => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
      const label = event === 'renews' ? (asset.kind === 'credential' ? 'rotate' : 'renews') : 'expires'
      events.push({
        uid: `${asset.id}-${event}@${UID_DOMAIN}`,
        date: iso,
        summary: `${asset.name} ${label}`,
        description: [
          `${KIND_WORDS[asset.kind] ?? 'Item'}${asset.provider ? ` at ${asset.provider}` : ''}.`,
          asset.costUsd > 0 && asset.billing !== 'free' ? `Costs $${asset.costUsd} ${asset.billing === 'yearly' ? 'a year' : 'a month'}.` : '',
          projects.length ? `Used by ${projects.join(', ')}.` : '',
          'From Holdings.',
        ].filter(Boolean).join('\n'),
      })
    }
    add(asset.renewsAt, 'renews')
    if (asset.expiresAt && asset.expiresAt !== asset.renewsAt) add(asset.expiresAt, 'expires')
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))
}

/** A complete .ics file. Lines end with CRLF, as the format requires. */
export function buildCalendar(data: HoldingsData, options: CalendarOptions = {}): string {
  const now = options.now ?? new Date()
  const alarm = Math.max(0, Math.floor(options.alarmDays ?? 0))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Holdings//Renewals//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name ?? 'Holdings renewals')}`,
  ]
  for (const event of calendarEvents(data, options)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${date(event.date)}`,
      `DTEND;VALUE=DATE:${nextDay(event.date)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      'TRANSP:TRANSPARENT',
    )
    if (alarm > 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(event.summary)}`, `TRIGGER:-P${alarm}D`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
