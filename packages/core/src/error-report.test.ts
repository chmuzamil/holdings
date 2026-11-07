import { describe, expect, it } from 'vitest'
import { buildEvent, createErrorReporter, parseDsn, parseStack, scrubText } from './error-report'

const DSN = 'https://abc123@errors.example/42'

describe('parseDsn', () => {
  it('turns a DSN into the envelope URL', () => {
    expect(parseDsn(DSN)).toEqual({
      publicKey: 'abc123',
      url: 'https://errors.example/api/42/envelope/?sentry_key=abc123&sentry_version=7',
    })
    expect(parseDsn('https://k@errors.example/sub/7')?.url).toBe('https://errors.example/sub/api/7/envelope/?sentry_key=k&sentry_version=7')
  })

  it('is off for empty or invalid values', () => {
    for (const value of [undefined, null, '', '  ', 'not a url', 'https://errors.example/42', 'ftp://k@errors.example/1', 'https://k@errors.example/']) {
      expect(parseDsn(value)).toBeNull()
    }
  })
})

describe('scrubText', () => {
  it('removes keys, card numbers, emails and URL queries', () => {
    // Built from parts so secret scanners don't take the made-up key for a real one.
    const key = ['sk', 'live', '51HxAbCdEfGhIjKlMnOp1234'].join('_')
    const text = scrubText(
      `Failed for owner@mail.example with card 4242 4242 4242 4242 and key ${key}, `
      + 'GET https://api.example/v1/x?token=abc#frag, Authorization: Bearer eyJhbGciOi.payload.sig, password=hunter2',
    )
    expect(text).not.toMatch(/owner@|4242|sk_live|token=abc|frag|eyJ|hunter2/)
    expect(text).toContain('[email]')
    expect(text).toContain('[number]')
    expect(text).toContain('https://api.example/v1/x')
  })

  it('keeps ordinary messages', () => {
    expect(scrubText("Cannot read properties of undefined (reading 'domains')")).toBe("Cannot read properties of undefined (reading 'domains')")
    expect(scrubText('Your session expired; the token is invalid')).toBe('Your session expired; the token is invalid')
  })
})

describe('parseStack', () => {
  it('reads V8 and Firefox stacks, oldest frame first, without queries', () => {
    const v8 = 'TypeError: x\n    at render (https://app.example/assets/SettingsView-Dk2l3mfA.js:10:5)\n    at https://app.example/assets/index.js?v=secret:1:2\n    at run (node:internal/x:3:4)'
    expect(parseStack(v8)).toEqual([
      { function: 'run', filename: 'node:internal/x', lineno: 3, colno: 4, in_app: false },
      { filename: 'https://app.example/assets/index.js', lineno: 1, colno: 2, in_app: true },
      { function: 'render', filename: 'https://app.example/assets/SettingsView-Dk2l3mfA.js', lineno: 10, colno: 5, in_app: true },
    ])
    expect(parseStack('render@https://app.example/a.js:1:2\n@https://app.example/b.js:3:4')).toEqual([
      { filename: 'https://app.example/b.js', lineno: 3, colno: 4, in_app: true },
      { function: 'render', filename: 'https://app.example/a.js', lineno: 1, colno: 2, in_app: true },
    ])
  })
})

describe('buildEvent', () => {
  it('only has the allowed fields', () => {
    const error = Object.assign(new Error('boom'), { request: { body: 'secret', headers: { cookie: 'x' } } })
    const event = buildEvent(error, { release: '1.0.0', environment: 'test', platform: 'node', now: 1_000, id: 'a'.repeat(32) })
    expect(Object.keys(event).sort()).toEqual(['environment', 'event_id', 'exception', 'level', 'platform', 'release', 'timestamp'])
    expect(JSON.stringify(event)).not.toMatch(/secret|cookie/)
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'boom' })
    expect(buildEvent('plain', { release: '1', environment: 't', platform: 'javascript', now: 0, id: 'b' }).exception.values[0]).toEqual({ type: 'NonError', value: 'plain' })
  })
})

describe('createErrorReporter', () => {
  it('is off without a DSN', () => {
    expect(createErrorReporter({ dsn: '', release: '1', environment: 't', platform: 'node', send: async () => {} })).toBeNull()
  })

  it('posts an envelope once per error and at most perMinute times', () => {
    const sent: [string, string][] = []
    let time = 0
    const report = createErrorReporter({
      dsn: DSN, release: '1', environment: 't', platform: 'node', perMinute: 2, now: () => time,
      send: async (url, body) => sent.push([url, body]),
    })!
    report(new Error('one'))
    report(new Error('one'))
    report(new Error('two'))
    report(new Error('three'))
    expect(sent).toHaveLength(2)
    const [url, body] = sent[0]!
    expect(url).toBe('https://errors.example/api/42/envelope/?sentry_key=abc123&sentry_version=7')
    const [header, item, event] = body.split('\n').map((line) => JSON.parse(line))
    expect(item).toEqual({ type: 'event' })
    expect(header.event_id).toBe(event.event_id)
    expect(event.exception.values[0].value).toBe('one')
    time = 61_000
    report(new Error('three'))
    expect(sent).toHaveLength(3)
  })

  it('ignores a failed send', async () => {
    const report = createErrorReporter({ dsn: DSN, release: '1', environment: 't', platform: 'node', send: () => Promise.reject(new Error('offline')) })!
    await expect(report(new Error('x'))).resolves.toBeUndefined()
  })
})
