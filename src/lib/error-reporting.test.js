import { afterEach, describe, expect, it, vi } from 'vitest'
import { startErrorReporting } from './error-reporting'

afterEach(() => vi.unstubAllGlobals())

describe('startErrorReporting', () => {
  it('is off without VITE_SENTRY_DSN', () => {
    const target = new EventTarget()
    expect(startErrorReporting({ VITE_APP_VERSION: '1.0.0' }, target)).toBe(false)
  })

  it('sends uncaught errors and rejections, without cookies or referrer', async () => {
    const fetch = vi.fn(async () => new Response(''))
    vi.stubGlobal('fetch', fetch)
    const target = new EventTarget()
    expect(startErrorReporting({ VITE_SENTRY_DSN: 'https://key@errors.example/3', VITE_APP_VERSION: '1.0.0', VITE_DEMO: 'true' }, target)).toBe(true)

    target.dispatchEvent(Object.assign(new Event('error'), { error: new Error('render failed') }))
    target.dispatchEvent(Object.assign(new Event('error'), { error: null, message: 'Script error.' }))
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError('fetch failed') }))
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://errors.example/api/3/envelope/?sentry_key=key&sentry_version=7')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' })
    const event = JSON.parse(init.body.split('\n')[2])
    expect(event).toMatchObject({ release: 'holdings@1.0.0', environment: 'demo', platform: 'javascript' })
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'render failed' })
  })
})
