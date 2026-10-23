import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaver, getSession } from './server-api'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Fake server: keeps a version and answers PUT /api/data like the real one. */
function fakeServer(startVersion = 1) {
  const server = { version: startVersion, saves: [] }
  server.fetch = vi.fn(async (path, init) => {
    const body = JSON.parse(init.body)
    if (body.version !== server.version) return jsonResponse(409, { error: 'changed', version: server.version })
    server.version += 1
    server.saves.push(body.data)
    return jsonResponse(200, { version: server.version })
  })
  return server
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('getSession', () => {
  it('returns null when there is no server', async () => {
    expect(await getSession(async () => new Response('<html>', { status: 404 }))).toBeNull()
    expect(await getSession(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))).toBeNull()
    expect(await getSession(async () => { throw new TypeError('offline') })).toBeNull()
  })

  it('returns the session from a server', async () => {
    const session = { setupNeeded: false, authenticated: false }
    expect(await getSession(async () => jsonResponse(200, session))).toEqual(session)
  })
})

describe('createSaver', () => {
  it('waits for a pause, then saves once with the version', async () => {
    const server = fakeServer(3)
    const statuses = []
    const saver = createSaver({ version: 3, fetchImpl: server.fetch, onStatus: (status) => statuses.push(status) })
    saver.update('records', { domains: [1] })
    saver.update('records', { domains: [1, 2] })
    expect(server.fetch).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(server.saves).toEqual([{ records: { domains: [1, 2] } }])
    expect(saver.version).toBe(4)
    expect(statuses).toEqual(['pending', 'saving', 'saved'])
  })

  it('skips saving when nothing changed', async () => {
    const server = fakeServer()
    const saver = createSaver({ version: 1, saved: { records: { a: 1 } }, fetchImpl: server.fetch })
    saver.update('records', { a: 1 })
    await vi.runAllTimersAsync()
    expect(server.fetch).not.toHaveBeenCalled()
    expect(saver.status).toBe('saved')
  })

  it('saves again if something changed while saving', async () => {
    const server = fakeServer()
    const saver = createSaver({ version: 1, fetchImpl: server.fetch })
    saver.update('records', { n: 1 })
    await vi.advanceTimersByTimeAsync(600)
    saver.update('settings', { theme: 'x' })
    await vi.runAllTimersAsync()
    expect(server.saves.at(-1)).toEqual({ records: { n: 1 }, settings: { theme: 'x' } })
    expect(saver.status).toBe('saved')
  })

  it('stops on a conflict instead of overwriting', async () => {
    const server = fakeServer(5)
    const saver = createSaver({ version: 4, fetchImpl: server.fetch })
    saver.update('records', { mine: true })
    await vi.runAllTimersAsync()
    expect(saver.status).toBe('conflict')
    saver.update('records', { mine: 'again' })
    await vi.runAllTimersAsync()
    expect(server.saves).toEqual([])
  })

  it('reports a signed-out session and other errors', async () => {
    const signedOut = createSaver({ version: 1, fetchImpl: async () => jsonResponse(401, { error: 'Sign in first.' }) })
    signedOut.update('records', {})
    await vi.runAllTimersAsync()
    expect(signedOut.status).toBe('signed-out')

    let fail = true
    const flaky = createSaver({ version: 1, fetchImpl: async () => (fail ? jsonResponse(500, {}) : jsonResponse(200, { version: 2 })) })
    flaky.update('records', { a: 1 })
    await vi.runAllTimersAsync()
    expect(flaky.status).toBe('error')
    fail = false
    await flaky.retry()
    expect(flaky.status).toBe('saved')
  })

  it('sends the request header the server needs', async () => {
    const server = fakeServer()
    const saver = createSaver({ version: 1, fetchImpl: server.fetch })
    saver.update('records', {})
    await vi.runAllTimersAsync()
    const [path, init] = server.fetch.mock.calls[0]
    expect(path).toBe('/api/data')
    expect(init.method).toBe('PUT')
    expect(init.headers['X-Requested-With']).toBe('holdings')
  })
})
