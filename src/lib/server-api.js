// Talks to the optional self-hosted server (packages/server). Without one,
// getSession() returns null and the app keeps everything in this browser.

const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'holdings' }
const SAVE_DELAY_MS = 600

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `The server answered ${status}.`)
    this.status = status
    this.body = body || {}
  }
}

export async function api(method, path, body, fetchImpl = fetch) {
  const response = await fetchImpl(path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? { 'X-Requested-With': 'holdings' } : HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, json)
  return json
}

/** The server's login state, or null when there is no server. */
export async function getSession(fetchImpl = fetch) {
  try {
    const response = await fetchImpl('/api/session', { credentials: 'same-origin' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const session = await response.json()
    return typeof session?.setupNeeded === 'boolean' ? session : null
  } catch {
    return null
  }
}

/**
 * Collects changes ({ records, settings }) and saves them shortly after the
 * last one. Each save sends the version it started from, so a copy changed in
 * another tab or device is never silently overwritten.
 *
 * Status: 'saved' | 'pending' | 'saving' | 'conflict' | 'signed-out' | 'error'
 */
export function createSaver({ version, saved = {}, onStatus = () => {}, fetchImpl = fetch, delay = SAVE_DELAY_MS }) {
  let currentVersion = version
  let doc = { ...saved }
  let lastSent = JSON.stringify(doc)
  let timer = null
  let running = null
  let status = 'saved'

  const setStatus = (next) => {
    if (next === status) return
    status = next
    onStatus(next)
  }

  async function flush() {
    clearTimeout(timer)
    timer = null
    if (running) return running
    if (status === 'conflict' || status === 'signed-out') return
    const body = JSON.stringify(doc)
    if (body === lastSent) return setStatus('saved')
    setStatus('saving')
    running = api('PUT', '/api/data', { version: currentVersion, data: doc }, fetchImpl)
      .then((result) => {
        currentVersion = result.version
        lastSent = body
        setStatus(JSON.stringify(doc) === body ? 'saved' : 'pending')
      })
      .catch((error) => {
        setStatus(error.status === 409 ? 'conflict' : error.status === 401 ? 'signed-out' : 'error')
      })
      .finally(() => {
        running = null
        if (status === 'pending') schedule()
      })
    return running
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }

  return {
    update(part, value) {
      doc = { ...doc, [part]: value }
      if (JSON.stringify(doc) === lastSent) return
      if (status === 'saved' || status === 'error') setStatus('pending')
      if (status === 'pending' || status === 'saving') schedule()
    },
    flush,
    retry() {
      if (status === 'error') {
        setStatus('pending')
        return flush()
      }
    },
    get status() {
      return status
    },
    get version() {
      return currentVersion
    },
  }
}
