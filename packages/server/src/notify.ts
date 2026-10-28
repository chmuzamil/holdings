import { fromV1, isV1Records, type Asset, type HoldingsData, type V1Records } from '@holdings/core'
import nodemailer from 'nodemailer'
import { seal, unseal } from './crypto'
import type { Store } from './db'
import type { FetchLike } from './stripe'

// Optional notifications: email (your own SMTP), a webhook (Slack, Discord or
// plain JSON) and ntfy. Every channel is off until the owner turns it on. A
// daily check tells you about renewals and expiries at 30, 7 and 1 days and
// when overdue, each only once.

export interface EmailSettings {
  enabled: boolean
  host: string
  port: number
  security: 'tls' | 'starttls' | 'none'
  user: string
  from: string
  to: string
}
export interface WebhookSettings {
  enabled: boolean
  url: string
  format: 'json' | 'slack' | 'discord'
}
export interface NtfySettings {
  enabled: boolean
  server: string
  topic: string
}
export interface NotificationSettings {
  email: EmailSettings
  webhook: WebhookSettings
  ntfy: NtfySettings
  /** How far ahead to warn, in days (the first milestone). */
  leadDays: number
}

type Channel = 'email' | 'webhook' | 'ntfy'
export interface Message {
  title: string
  lines: string[]
}

interface Stored extends NotificationSettings {
  emailPasswordSealed: string | null
  ntfyTokenSealed: string | null
}

const SETTINGS_KEY = 'notifications'
const SENT_KEY = 'notifications_sent'
const LAST_CHECK_KEY = 'notifications_last_check'
const TIMEOUT_MS = 15_000
const MILESTONES = [30, 7, 1] as const

export const DEFAULTS: Stored = {
  email: { enabled: false, host: '', port: 587, security: 'starttls', user: '', from: '', to: '' },
  webhook: { enabled: false, url: '', format: 'json' },
  ntfy: { enabled: false, server: 'https://ntfy.sh', topic: '' },
  leadDays: 30,
  emailPasswordSealed: null,
  ntfyTokenSealed: null,
}

export class SettingsError extends Error {}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

function httpUrl(value: string, label: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SettingsError(`${label} must be a full address, like https://…`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new SettingsError(`${label} must start with https://`)
  return url.toString()
}

/** Checks and merges an update into the stored settings. Secrets are sealed. */
export function mergeSettings(current: Stored, input: Record<string, any>, key: Buffer): Stored {
  const next: Stored = structuredClone(current)
  if (input.email) {
    const e = input.email
    next.email = {
      enabled: Boolean(e.enabled ?? next.email.enabled),
      host: String(e.host ?? next.email.host).trim(),
      port: Number(e.port ?? next.email.port),
      security: ['tls', 'starttls', 'none'].includes(e.security) ? e.security : next.email.security,
      user: String(e.user ?? next.email.user).trim(),
      from: String(e.from ?? next.email.from).trim(),
      to: String(e.to ?? next.email.to).trim(),
    }
    if (typeof e.password === 'string' && e.password) next.emailPasswordSealed = seal(e.password, key)
    if (e.password === null) next.emailPasswordSealed = null
    if (next.email.enabled) {
      if (!next.email.host) throw new SettingsError('Enter your mail server (SMTP host).')
      if (!Number.isInteger(next.email.port) || next.email.port < 1 || next.email.port > 65535) throw new SettingsError('Enter a port from 1 to 65535.')
      if (!EMAIL.test(next.email.from)) throw new SettingsError('Enter the address mail is sent from.')
      if (!EMAIL.test(next.email.to)) throw new SettingsError('Enter the address to send notifications to.')
    }
  }
  if (input.webhook) {
    const w = input.webhook
    next.webhook = {
      enabled: Boolean(w.enabled ?? next.webhook.enabled),
      url: String(w.url ?? next.webhook.url).trim(),
      format: ['json', 'slack', 'discord'].includes(w.format) ? w.format : next.webhook.format,
    }
    if (next.webhook.enabled) next.webhook.url = httpUrl(next.webhook.url, 'The webhook address')
  }
  if (input.ntfy) {
    const n = input.ntfy
    next.ntfy = {
      enabled: Boolean(n.enabled ?? next.ntfy.enabled),
      server: String(n.server ?? next.ntfy.server).trim() || DEFAULTS.ntfy.server,
      topic: String(n.topic ?? next.ntfy.topic).trim(),
    }
    if (typeof n.token === 'string' && n.token) next.ntfyTokenSealed = seal(n.token, key)
    if (n.token === null) next.ntfyTokenSealed = null
    if (next.ntfy.enabled) {
      next.ntfy.server = httpUrl(next.ntfy.server, 'The ntfy server').replace(/\/$/, '')
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(next.ntfy.topic)) throw new SettingsError('Use a topic of letters, numbers, - and _ only. Pick something hard to guess.')
    }
  }
  if (input.leadDays !== undefined) {
    const days = Number(input.leadDays)
    if (![7, 14, 30].includes(days)) throw new SettingsError('Warn 7, 14 or 30 days ahead.')
    next.leadDays = days
  }
  return next
}

/** What the browser sees: never the secrets themselves. */
export function publicSettings(stored: Stored) {
  const { emailPasswordSealed, ntfyTokenSealed, ...rest } = stored
  return { ...rest, email: { ...rest.email, hasPassword: Boolean(emailPasswordSealed) }, ntfy: { ...rest.ntfy, hasToken: Boolean(ntfyTokenSealed) } }
}

// --- sending ---------------------------------------------------------------

export type MailTransport = (options: { host: string; port: number; secure: boolean; requireTLS: boolean; auth?: { user: string; pass: string } }) => {
  sendMail: (mail: { from: string; to: string; subject: string; text: string }) => Promise<unknown>
}

const defaultTransport: MailTransport = (options) =>
  nodemailer.createTransport({ ...options, connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS })

async function post(fetchImpl: FetchLike, url: string, init: RequestInit, label: string) {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new SettingsError(`Couldn’t reach the ${label}.`)
  }
  if (!response.ok) throw new SettingsError(`The ${label} answered ${response.status}.`)
}

export async function send(channel: Channel, stored: Stored, message: Message, key: Buffer, deps: { fetch: FetchLike; transport: MailTransport }) {
  const text = message.lines.join('\n')
  if (channel === 'email') {
    const e = stored.email
    const password = stored.emailPasswordSealed ? unseal(stored.emailPasswordSealed, key) : ''
    const transport = deps.transport({
      host: e.host,
      port: e.port,
      secure: e.security === 'tls',
      requireTLS: e.security === 'starttls',
      ...(e.user ? { auth: { user: e.user, pass: password } } : {}),
    })
    try {
      await transport.sendMail({ from: e.from, to: e.to, subject: message.title, text: `${text}\n\n— Holdings` })
    } catch (error) {
      throw new SettingsError(`The mail server refused: ${(error as Error).message}`)
    }
    return
  }
  if (channel === 'webhook') {
    const w = stored.webhook
    const body = w.format === 'slack'
      ? { text: `*${message.title}*\n${text}` }
      : w.format === 'discord'
        ? { content: `**${message.title}**\n${text}`.slice(0, 2000) }
        : { source: 'holdings', title: message.title, lines: message.lines }
    await post(deps.fetch, w.url, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'webhook')
    return
  }
  const n = stored.ntfy
  const token = stored.ntfyTokenSealed ? unseal(stored.ntfyTokenSealed, key) : ''
  await post(deps.fetch, `${n.server}/${n.topic}`, {
    headers: { Title: message.title, Tags: 'calendar', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: text,
  }, 'ntfy server')
}

// --- what to tell you --------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

export interface Alert {
  key: string
  line: string
}

/**
 * Renewals and expiries that just reached a milestone (lead days, 7, 1,
 * overdue) and weren't sent before. The key includes the date, so a renewed
 * item starts over.
 */
export function dueAlerts(data: HoldingsData, today: string, leadDays: number, sent: Set<string>): Alert[] {
  const projectsFor = (asset: Asset) => {
    const ids = new Set(data.projectAssets.filter((row) => row.assetId === asset.id).map((row) => row.projectId))
    return data.projects.filter((project) => ids.has(project.id)).map((project) => project.name)
  }
  const alerts: Alert[] = []
  for (const asset of data.assets) {
    if (asset.status === 'cancelled') continue
    const next = [
      asset.renewsAt && { date: asset.renewsAt, verb: 'renews' },
      asset.expiresAt && { date: asset.expiresAt, verb: 'expires' },
    ].filter(Boolean).sort((a, b) => (a as { date: string }).date.localeCompare((b as { date: string }).date))[0] as { date: string; verb: string } | undefined
    if (!next) continue
    const days = daysBetween(today, next.date)
    if (days > leadDays) continue
    const milestone = days < 0 ? 'overdue' : String([...MILESTONES.filter((m) => m <= leadDays), leadDays].filter((m) => days <= m).sort((a, b) => a - b)[0])
    const key = `${asset.id}|${next.date}|${milestone}`
    if (sent.has(key)) continue
    const when = days < 0 ? `was due ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? `${next.verb} today` : `${next.verb} in ${days} day${days === 1 ? '' : 's'}`
    const projects = projectsFor(asset)
    alerts.push({ key, line: `• ${asset.name} ${when} (${next.date})${projects.length ? ` · ${projects.join(', ')}` : ''}` })
  }
  return alerts.sort((a, b) => a.line.localeCompare(b.line))
}

export function readHoldings(body: string | undefined): HoldingsData | null {
  if (!body) return null
  try {
    const records = (JSON.parse(body) as { records?: unknown }).records
    if (!isV1Records(records)) return null
    return fromV1(records as V1Records, { costUsd: (record) => (record.currency && record.currency !== 'USD' ? 0 : Number(record.cost) || 0) })
  } catch {
    return null
  }
}

// --- the notifier ------------------------------------------------------------

export function createNotifier({ store, secretKey, now = () => new Date(), fetch: fetchImpl = fetch, transport = defaultTransport }: {
  store: Store
  secretKey: Buffer
  now?: () => Date
  fetch?: FetchLike
  transport?: MailTransport
}) {
  const deps = { fetch: fetchImpl, transport }
  const load = (): Stored => ({ ...DEFAULTS, ...(JSON.parse(store.getSetting(SETTINGS_KEY) ?? '{}') as Partial<Stored>) })
  const enabledChannels = (stored: Stored) => (['email', 'webhook', 'ntfy'] as const).filter((channel) => stored[channel].enabled)
  const localDay = () => {
    const date = now()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return {
    settings: () => ({ ...publicSettings(load()), lastCheck: JSON.parse(store.getSetting(LAST_CHECK_KEY) ?? 'null') }),

    save(input: Record<string, unknown>) {
      const next = mergeSettings(load(), input, secretKey)
      store.setSetting(SETTINGS_KEY, JSON.stringify(next))
      return publicSettings(next)
    },

    async test(channel: Channel) {
      const stored = load()
      if (!stored[channel]?.enabled) throw new SettingsError('Turn this on and save it first.')
      await send(channel, stored, { title: 'Holdings test notification', lines: ['If you can read this, notifications work.'] }, secretKey, deps)
    },

    /** Sends whatever reached a milestone since the last check, to every channel that is on. */
    async check() {
      const stored = load()
      const channels = enabledChannels(stored)
      const today = localDay()
      const data = readHoldings(store.getData()?.body)
      const sent = new Set<string>(JSON.parse(store.getSetting(SENT_KEY) ?? '[]'))
      const alerts = channels.length && data ? dueAlerts(data, today, stored.leadDays, sent) : []
      const failures: string[] = []
      if (alerts.length) {
        const message = {
          title: alerts.length === 1 ? '1 thing needs you soon' : `${alerts.length} things need you soon`,
          lines: alerts.map((alert) => alert.line),
        }
        for (const channel of channels) {
          try {
            await send(channel, stored, message, secretKey, deps)
          } catch (error) {
            failures.push(`${channel}: ${(error as Error).message}`)
          }
        }
        // Mark as sent when at least one channel worked, so a broken one doesn't repeat the others.
        if (failures.length < channels.length) {
          alerts.forEach((alert) => sent.add(alert.key))
          // Forget keys for dates long past, so the list stays small.
          const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY_MS).toISOString().slice(0, 10)
          store.setSetting(SENT_KEY, JSON.stringify([...sent].filter((key) => (key.split('|')[1] ?? '') >= cutoff)))
        }
      }
      const result = { at: now().toISOString(), day: today, sent: failures.length < channels.length ? alerts.length : 0, failures }
      store.setSetting(LAST_CHECK_KEY, JSON.stringify(result))
      return result
    },

    /** Runs the check once a day, from 8:00 server time. */
    start(intervalMs = 60 * 60 * 1000) {
      const tick = () => {
        const last = JSON.parse(store.getSetting(LAST_CHECK_KEY) ?? 'null') as { day?: string } | null
        if (now().getHours() >= 8 && last?.day !== localDay()) {
          this.check().catch((error) => console.error('Notification check failed:', error))
        }
      }
      tick()
      const timer = setInterval(tick, intervalMs)
      timer.unref()
      return () => clearInterval(timer)
    },
  }
}

export type Notifier = ReturnType<typeof createNotifier>
