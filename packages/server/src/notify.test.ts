import { randomBytes } from 'node:crypto'
import { fromV1 } from '@holdings/core'
import { describe, expect, it, vi } from 'vitest'
import { openStore } from './db'
import { createNotifier, DEFAULTS, dueAlerts, mergeSettings, publicSettings, send, SettingsError } from './notify'

const key = randomBytes(32)
const TODAY = '2026-10-29'

const records = {
  domains: [
    { id: 'd1', name: 'shop.example', renewalDate: '2026-11-05', status: 'Active', cost: 12 },
    { id: 'd2', name: 'old.example', renewalDate: '2026-10-20', status: 'Active', cost: 10 },
    { id: 'd3', name: 'later.example', renewalDate: '2027-03-01', status: 'Active', cost: 10 },
    { id: 'd4', name: 'gone.example', renewalDate: '2026-11-01', status: 'Cancelled', cost: 10 },
  ],
  keys: [{ id: 'k1', name: 'Visa ending 4242', keyType: 'Payment card', expiryDate: '2026-11-25', status: 'Active' }],
  projects: [{ id: 'p1', name: 'Shop', domainIds: ['d1'] }],
}
const data = fromV1(records)

function fakeFetch(status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok', { status }))
}
function fakeTransport(fail = false) {
  const sendMail = vi.fn(async () => {
    if (fail) throw new Error('535 auth failed')
  })
  const transport = vi.fn(() => ({ sendMail }))
  return { transport, sendMail }
}

describe('which renewals to tell you about', () => {
  it('tells you at the right milestone, with the project', () => {
    const alerts = dueAlerts(data, TODAY, 30, new Set())
    expect(alerts.map((alert) => alert.key).sort()).toEqual(['d1|2026-11-05|7', 'd2|2026-10-20|overdue', 'k1|2026-11-25|30'])
    expect(alerts.find((alert) => alert.key.startsWith('d1'))?.line).toBe('• shop.example renews in 7 days (2026-11-05) · Shop')
    expect(alerts.find((alert) => alert.key.startsWith('d2'))?.line).toBe('• old.example was due 9 days ago (2026-10-20)')
    expect(alerts.find((alert) => alert.key.startsWith('k1'))?.line).toContain('expires in 27 days')
  })

  it('sends each milestone once, and the next one later', () => {
    const sent = new Set(dueAlerts(data, TODAY, 30, new Set()).map((alert) => alert.key))
    expect(dueAlerts(data, TODAY, 30, sent)).toEqual([])
    expect(dueAlerts(data, '2026-11-04', 30, sent).map((alert) => alert.key)).toContain('d1|2026-11-05|1')
  })

  it('starts later when you warn fewer days ahead, and skips cancelled items', () => {
    const keys = dueAlerts(data, TODAY, 7, new Set()).map((alert) => alert.key)
    expect(keys.some((k) => k.startsWith('k1'))).toBe(false)
    expect(keys.some((k) => k.startsWith('d4'))).toBe(false)
  })
})

describe('settings', () => {
  it('stays off until turned on, and checks what you turn on', () => {
    expect(mergeSettings(DEFAULTS, { webhook: { url: 'nonsense' } }, key).webhook.enabled).toBe(false)
    expect(() => mergeSettings(DEFAULTS, { webhook: { enabled: true, url: 'nonsense' } }, key)).toThrow(SettingsError)
    expect(() => mergeSettings(DEFAULTS, { email: { enabled: true, host: 'smtp.mail.example', from: 'x', to: 'me@mail.example' } }, key)).toThrow(/sent from/)
    expect(() => mergeSettings(DEFAULTS, { ntfy: { enabled: true, topic: 'has spaces' } }, key)).toThrow(/topic/)
    expect(() => mergeSettings(DEFAULTS, { leadDays: 12 }, key)).toThrow(/7, 14 or 30/)
  })

  it('seals secrets and never shows them', () => {
    const stored = mergeSettings(DEFAULTS, {
      email: { enabled: true, host: 'smtp.mail.example', from: 'holdings@mail.example', to: 'me@mail.example', user: 'me', password: 'smtp-pass-123' },
      ntfy: { enabled: true, topic: 'holdings-x1', token: 'tk_secret' },
    }, key)
    expect(stored.emailPasswordSealed).not.toContain('smtp-pass-123')
    const shown = JSON.stringify(publicSettings(stored))
    expect(shown).not.toContain('smtp-pass-123')
    expect(shown).not.toContain('tk_secret')
    expect(publicSettings(stored).email.hasPassword).toBe(true)
    // Leaving the password out keeps it; null removes it.
    expect(mergeSettings(stored, { email: { host: 'smtp2.mail.example' } }, key).emailPasswordSealed).toBe(stored.emailPasswordSealed)
    expect(mergeSettings(stored, { email: { password: null } }, key).emailPasswordSealed).toBeNull()
  })
})

describe('sending', () => {
  const message = { title: '2 things need you soon', lines: ['• a', '• b'] }
  const configured = mergeSettings(DEFAULTS, {
    email: { enabled: true, host: 'smtp.mail.example', port: 465, security: 'tls', from: 'holdings@mail.example', to: 'me@mail.example', user: 'me', password: 'pw' },
    webhook: { enabled: true, url: 'https://hooks.example/abc', format: 'slack' },
    ntfy: { enabled: true, server: 'https://ntfy.example/', topic: 'holdings-x1', token: 'tk' },
  }, key)

  it('formats the webhook for Slack, Discord or plain JSON', async () => {
    for (const [format, expected] of [
      ['slack', { text: '*2 things need you soon*\n• a\n• b' }],
      ['discord', { content: '**2 things need you soon**\n• a\n• b' }],
      ['json', { source: 'holdings', title: '2 things need you soon', lines: ['• a', '• b'] }],
    ] as const) {
      const fetch = fakeFetch()
      await send('webhook', { ...configured, webhook: { ...configured.webhook, format } }, message, key, { fetch, transport: fakeTransport().transport })
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(expected)
    }
  })

  it('posts to ntfy with a title and the token', async () => {
    const fetch = fakeFetch()
    await send('ntfy', configured, message, key, { fetch, transport: fakeTransport().transport })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://ntfy.example/holdings-x1')
    expect(init?.headers).toMatchObject({ Title: '2 things need you soon', Authorization: 'Bearer tk' })
    expect(init?.body).toBe('• a\n• b')
  })

  it('sends mail through your server with your login', async () => {
    const { transport, sendMail } = fakeTransport()
    await send('email', configured, message, key, { fetch: fakeFetch(), transport })
    expect(transport).toHaveBeenCalledWith({ host: 'smtp.mail.example', port: 465, secure: true, requireTLS: false, auth: { user: 'me', pass: 'pw' } })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'me@mail.example', subject: '2 things need you soon' }))
  })

  it('explains failures', async () => {
    await expect(send('webhook', configured, message, key, { fetch: fakeFetch(404), transport: fakeTransport().transport })).rejects.toThrow('The webhook answered 404.')
    await expect(send('email', configured, message, key, { fetch: fakeFetch(), transport: fakeTransport(true).transport })).rejects.toThrow(/refused: 535/)
  })
})

describe('the daily check', () => {
  function setup(fetch = fakeFetch()) {
    const store = openStore(':memory:')
    store.putData(JSON.stringify({ records }), 0)
    const notifier = createNotifier({ store, secretKey: key, now: () => new Date(2026, 9, 29, 9), fetch, transport: fakeTransport().transport })
    return { store, notifier, fetch }
  }

  it('does nothing until a channel is on', async () => {
    const { notifier, fetch } = setup()
    expect((await notifier.check()).sent).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends one digest, then nothing new the same day', async () => {
    const { notifier, fetch } = setup()
    notifier.save({ webhook: { enabled: true, url: 'https://hooks.example/abc', format: 'json' } })
    expect((await notifier.check()).sent).toBe(3)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await notifier.check()).sent).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('tries again next time if every channel failed', async () => {
    const { notifier } = setup(fakeFetch(500))
    notifier.save({ webhook: { enabled: true, url: 'https://hooks.example/abc' } })
    const first = await notifier.check()
    expect(first.sent).toBe(0)
    expect(first.failures[0]).toMatch(/answered 500/)
    expect(notifier.settings().lastCheck.failures).toHaveLength(1)
  })

  it('sends a test only to a channel that is on', async () => {
    const { notifier, fetch } = setup()
    await expect(notifier.test('ntfy')).rejects.toThrow(/Turn this on/)
    notifier.save({ ntfy: { enabled: true, topic: 'holdings-x1' } })
    await notifier.test('ntfy')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://ntfy.sh/holdings-x1')
  })
})
