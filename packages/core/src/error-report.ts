// Optional error reporting to any Sentry-compatible service (Sentry, GlitchTip).
// Off unless a DSN is set. No SDK: events are built here from an allowlist
// (error type, message, stack frames, release), so request bodies, headers,
// cookies, user details and app data are never part of them. Messages and file
// names are scrubbed of anything that looks like a key, card number, email
// address or URL query before sending.

export interface Dsn {
  /** Where events are posted, with the public key in the query string. */
  url: string
  publicKey: string
}

export interface ReporterOptions {
  dsn: string
  release: string
  environment: string
  platform: 'javascript' | 'node'
  /** Posts the envelope; a failed send is ignored. */
  send: (url: string, body: string) => Promise<unknown>
  now?: () => number
  /** Most events sent in one minute; the rest are dropped. */
  perMinute?: number
}

interface Frame {
  function?: string
  filename: string
  lineno?: number
  colno?: number
  in_app: boolean
}

export interface ReportEvent {
  event_id: string
  timestamp: number
  platform: 'javascript' | 'node'
  level: 'error'
  release: string
  environment: string
  exception: { values: { type: string; value: string; stacktrace?: { frames: Frame[] } }[] }
}

/** Reads https://<key>@<host>/<project>; returns null for anything else. */
export function parseDsn(dsn: string | undefined | null): Dsn | null {
  const match = /^(https?):\/\/([\w-]+)(?::[^@/]*)?@([\w.-]+(?::\d+)?)((?:\/[\w-]+)*)\/([\w-]+)\/?$/.exec(dsn?.trim() ?? '')
  if (!match) return null
  const [, scheme, publicKey, host, prefix, projectId] = match
  return {
    publicKey: publicKey!,
    url: `${scheme}://${host}${prefix}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`,
  }
}

const CARD = /\b(?:\d[ -]?){12,18}\d\b/g
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// Bearer/Basic credentials and key=value style secrets.
const AUTH_SCHEME = /\b(bearer|basic)\s+[^\s"',;&]+/gi
const CREDENTIAL = /\b(token|api[_-]?key|apikey|secret|password|passwd|pwd|authorization|cookie|session)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi
// Long runs of letters and digits, like API keys and tokens. Needs a digit and a letter.
const TOKEN = /\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{20,}\b/g
const URL_QUERY = /(\bhttps?:\/\/[^\s?#"']+)[?#][^\s"']*/gi

/** Removes anything in a message that could be private. */
export function scrubText(text: string): string {
  return scrubPath(text).replace(TOKEN, '[redacted]').slice(0, 1000)
}

/** Like scrubText, but keeps long names, so hashed file names stay readable. */
function scrubPath(text: string): string {
  return text
    .replace(URL_QUERY, '$1')
    .replace(AUTH_SCHEME, '$1 [redacted]')
    .replace(CREDENTIAL, '$1$2[redacted]')
    .replace(EMAIL, '[email]')
    .replace(CARD, '[number]')
    .slice(0, 1000)
}

/** Stack frames from V8 ("at fn (file:1:2)") or Firefox/Safari ("fn@file:1:2"), oldest first. */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return []
  const frames: Frame[] = []
  for (const line of stack.split('\n').slice(0, 50)) {
    const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line) ?? /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line)
    if (!match) continue
    const filename = scrubPath(match[2] ?? '')
    frames.push({
      ...(match[1] ? { function: scrubText(match[1]) } : {}),
      filename,
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: !/node_modules|^node:|^internal\//.test(filename),
    })
  }
  return frames.reverse()
}

/** The whole event, built only from the fields listed in ReportEvent. */
export function buildEvent(error: unknown, options: Pick<ReporterOptions, 'release' | 'environment' | 'platform'> & { now: number; id: string }): ReportEvent {
  const isError = error instanceof Error
  const type = isError ? error.name || 'Error' : 'NonError'
  const value = isError ? error.message : typeof error === 'string' ? error : `Non-error thrown: ${typeof error}`
  const frames = isError ? parseStack(error.stack) : []
  return {
    event_id: options.id,
    timestamp: options.now / 1000,
    platform: options.platform,
    level: 'error',
    release: options.release,
    environment: options.environment,
    exception: { values: [{ type: scrubText(type), value: scrubText(value), ...(frames.length ? { stacktrace: { frames } } : {}) }] },
  }
}

/** Returns report(error), or null when the DSN is missing or invalid. report never rejects. */
export function createErrorReporter(options: ReporterOptions): ((error: unknown) => Promise<void>) | null {
  const dsn = parseDsn(options.dsn)
  if (!dsn) return null
  const now = options.now ?? Date.now
  const perMinute = options.perMinute ?? 10
  const seen = new Set<string>()
  let windowStart = 0
  let sent = 0

  return async (error) => {
    const time = now()
    const event = buildEvent(error, { ...options, now: time, id: randomId() })
    const exception = event.exception.values[0]
    const top = exception?.stacktrace?.frames.at(-1)
    // The same error from the same place is sent once.
    const fingerprint = `${exception?.type}|${exception?.value}|${top?.filename}:${top?.lineno}`
    if (seen.has(fingerprint)) return
    if (time - windowStart > 60_000) {
      windowStart = time
      sent = 0
    }
    if (sent >= perMinute) return
    sent += 1
    seen.add(fingerprint)
    const body = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date(time).toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n')
    await options.send(dsn.url, body).catch(() => {})
  }
}

function randomId(): string {
  let id = ''
  for (let i = 0; i < 32; i += 1) id += Math.floor(Math.random() * 16).toString(16)
  return id
}
