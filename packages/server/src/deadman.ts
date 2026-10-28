import { hashToken, newToken } from './crypto'
import type { Store } from './db'
import { SettingsError, type Notifier } from './notify'

// Dead-man's switch. If the owner doesn't check in for a while, the person
// they chose gets the locked handover file. Off until the owner turns it on.
//
// Signing in, saving changes, or the "Check in" button all count. When a
// check-in is due, the owner gets reminders with a one-click link; at the end
// of the grace period, the trusted person gets the file by email, once. The
// file was locked in the owner's browser: the server never has the passphrase.

export const INTERVALS = [14, 30, 60, 90]
export const GRACE = [7, 14, 30]
const MAX_FILE_BYTES = 5 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const STATE_KEY = 'deadman'
const FILE_KEY = 'deadman_file'
// Touching the check-in on every save would write on every keystroke burst.
const TOUCH_EVERY_MS = 60 * 60 * 1000

interface State {
  enabled: boolean
  intervalDays: number
  graceDays: number
  contactName: string
  contactEmail: string
  note: string
  /** Where the owner opens Holdings, for check-in links. */
  appUrl: string
  lastCheckIn: string
  /** Hashes of the check-in links sent since the last check-in. */
  linkHashes: string[]
  remindersSent: string[]
  triggeredAt: string | null
  /** When the file was last sent, kept after a check-in re-arms the switch. */
  lastTriggeredAt: string | null
  fileUpdatedAt: string | null
}

const DEFAULTS: State = {
  enabled: false,
  intervalDays: 30,
  graceDays: 14,
  contactName: '',
  contactEmail: '',
  note: '',
  appUrl: '',
  lastCheckIn: '',
  linkHashes: [],
  remindersSent: [],
  triggeredAt: null,
  lastTriggeredAt: null,
  fileUpdatedAt: null,
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const day = (iso: string) => iso.slice(0, 10)

export function createDeadman({ store, notifier, now = () => new Date() }: { store: Store; notifier: Notifier; now?: () => Date }) {
  const load = (): State => ({ ...DEFAULTS, ...(JSON.parse(store.getSetting(STATE_KEY) ?? '{}') as Partial<State>) })
  const save = (state: State) => store.setSetting(STATE_KEY, JSON.stringify(state))

  function dates(state: State) {
    const last = Date.parse(state.lastCheckIn || now().toISOString())
    const dueAt = new Date(last + state.intervalDays * DAY_MS)
    const sendAt = new Date(dueAt.getTime() + state.graceDays * DAY_MS)
    return { dueAt, sendAt }
  }

  function view(state = load()) {
    const { linkHashes, remindersSent, ...rest } = state
    const { dueAt, sendAt } = dates(state)
    return {
      ...rest,
      dueAt: dueAt.toISOString(),
      sendAt: sendAt.toISOString(),
      hasFile: Boolean(store.getSetting(FILE_KEY)),
      emailReady: notifier.emailReady(),
    }
  }

  /** Resets the clock. Returns whether the file had already been sent. */
  function checkIn() {
    const state = load()
    const wasTriggered = Boolean(state.triggeredAt)
    save({
      ...state,
      lastCheckIn: now().toISOString(),
      linkHashes: [],
      remindersSent: [],
      triggeredAt: null,
      lastTriggeredAt: state.triggeredAt ?? state.lastTriggeredAt,
    })
    return wasTriggered
  }

  async function remind(state: State, stage: string, sendAt: Date) {
    const token = newToken()
    const link = state.appUrl ? `${state.appUrl.replace(/\/$/, '')}/api/deadman/checkin?token=${token}` : ''
    const name = state.contactName || state.contactEmail
    const result = await notifier.broadcast({
      title: stage === 'last' ? 'Last reminder: check in to Holdings today' : 'Check in to Holdings',
      lines: [
        `You haven’t checked in for a while. If you don’t, your locked handover file goes to ${name} on ${day(sendAt.toISOString())}.`,
        link ? `Check in with one click: ${link}` : 'Open Holdings and press Check in, or sign in.',
      ],
    })
    return { tokenHash: hashToken(token), ...result }
  }

  async function trigger(state: State) {
    const file = store.getSetting(FILE_KEY)
    if (!file) throw new Error('There is no handover file to send.')
    const name = state.contactName ? ` ${state.contactName}` : ''
    await notifier.emailTo({
      to: state.contactEmail,
      subject: 'A handover file has been left for you',
      text: [
        `Hello${name},`,
        '',
        'The person who set this up hasn’t checked in for a while, so their handover file has been sent to you automatically. It lists their projects and what each one runs on, so they can be kept running or wound down.',
        '',
        'Open the attached file in any web browser. It is locked: you need the passphrase they gave you. Nothing is sent anywhere when you open it.',
        ...(state.note ? ['', 'Their note to you:', state.note] : []),
        '',
        '— Sent by Holdings, on their behalf',
      ].join('\n'),
      attachments: [{ filename: 'handover.html', content: file, contentType: 'text/html' }],
    })
  }

  return {
    view,
    checkIn,

    /** Counts ordinary use (sign-in, saving) as a check-in, at most once an hour. */
    touch() {
      const state = load()
      if (!state.enabled || state.triggeredAt) return
      if (now().getTime() - Date.parse(state.lastCheckIn || '1970-01-01') < TOUCH_EVERY_MS) return
      checkIn()
    },

    /** One-click links from the reminders. */
    checkInWithLink(token: string) {
      const state = load()
      if (!token || !state.linkHashes.includes(hashToken(token))) return null
      return { wasTriggered: checkIn() }
    },

    configure(input: Record<string, unknown>) {
      const state = load()
      const next: State = { ...state }
      if (input.intervalDays !== undefined) {
        if (!INTERVALS.includes(Number(input.intervalDays))) throw new SettingsError(`Check in every ${INTERVALS.join(', ')} days.`)
        next.intervalDays = Number(input.intervalDays)
      }
      if (input.graceDays !== undefined) {
        if (!GRACE.includes(Number(input.graceDays))) throw new SettingsError(`Wait ${GRACE.join(', ')} days after a missed check-in.`)
        next.graceDays = Number(input.graceDays)
      }
      if (input.contactName !== undefined) next.contactName = String(input.contactName).trim().slice(0, 80)
      if (input.contactEmail !== undefined) next.contactEmail = String(input.contactEmail).trim()
      if (input.note !== undefined) next.note = String(input.note).trim().slice(0, 2000)
      if (typeof input.appUrl === 'string' && /^https?:\/\//.test(input.appUrl)) next.appUrl = input.appUrl.slice(0, 300)
      if (input.enabled !== undefined) next.enabled = Boolean(input.enabled)

      if (next.enabled) {
        if (!notifier.emailReady()) throw new SettingsError('Turn on email notifications first: the file is sent by email.')
        if (!EMAIL.test(next.contactEmail)) throw new SettingsError('Enter the email address of the person you trust.')
        if (!store.getSetting(FILE_KEY)) throw new SettingsError('Lock and upload your handover file first.')
      }
      // Turning it on starts the clock now.
      if (next.enabled && !state.enabled) {
        Object.assign(next, { lastCheckIn: now().toISOString(), linkHashes: [], remindersSent: [], triggeredAt: null })
      }
      save(next)
      return view(next)
    },

    saveFile(html: unknown) {
      const text = typeof html === 'string' ? html : ''
      if (!text.startsWith('<!doctype html>') || !text.includes('decryptHandover')) throw new SettingsError('That isn’t a locked handover file.')
      if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new SettingsError('That file is too large.')
      store.setSetting(FILE_KEY, text)
      save({ ...load(), fileUpdatedAt: now().toISOString() })
      return view()
    },

    /** Runs hourly: sends reminders when due and the file when the grace period ends. */
    async check() {
      const state = load()
      if (!state.enabled || state.triggeredAt) return { action: 'none' as const }
      const { dueAt, sendAt } = dates(state)
      const time = now().getTime()

      if (time >= sendAt.getTime()) {
        try {
          await trigger(state)
        } catch (error) {
          await notifier.broadcast({ title: 'Holdings couldn’t send your handover file', lines: [`Sending to ${state.contactEmail} failed: ${(error as Error).message}. It will try again in an hour.`] })
          return { action: 'failed' as const, error: (error as Error).message }
        }
        save({ ...load(), triggeredAt: now().toISOString() })
        await notifier.broadcast({
          title: 'Your handover file was sent',
          lines: [`You didn’t check in, so your locked handover file was sent to ${state.contactName || state.contactEmail}. Check in to turn the switch back on.`],
        })
        return { action: 'sent' as const }
      }

      if (time < dueAt.getTime()) return { action: 'none' as const }
      // Due: remind when it falls due, halfway through the grace period, and the day before.
      const stages: [string, number][] = [
        ['due', dueAt.getTime()],
        ['halfway', dueAt.getTime() + (state.graceDays * DAY_MS) / 2],
        ['last', sendAt.getTime() - DAY_MS],
      ]
      const stage = stages.filter(([, at]) => time >= at).at(-1)?.[0]
      if (!stage || state.remindersSent.includes(stage)) return { action: 'none' as const }
      const result = await remind(state, stage, sendAt)
      const latest = load()
      save({ ...latest, linkHashes: [...latest.linkHashes, result.tokenHash], remindersSent: [...latest.remindersSent, stage] })
      return { action: 'reminded' as const, stage, failures: result.failures }
    },

    start(intervalMs = 60 * 60 * 1000) {
      const tick = () => this.check().catch((error) => console.error('Dead-man’s switch check failed:', error))
      tick()
      const timer = setInterval(tick, intervalMs)
      timer.unref()
      return () => clearInterval(timer)
    },
  }
}

export type Deadman = ReturnType<typeof createDeadman>
