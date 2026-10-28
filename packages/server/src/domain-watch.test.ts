import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { openStore } from './db'
import { createDomainWatch } from './domain-watch'
import { createNotifier } from './notify'

const answer = (ns: string[], status = ['client transfer prohibited'], at = new Date().toISOString()) => ({
  checkedAt: at,
  dns: { ns: { value: ns } },
  whois: { status, expires: '2027-06-01T00:00:00Z', dnssec: true },
})

function setup({ webhook = true, webhookStatus = 200 } = {}) {
  let clock = Date.UTC(2026, 9, 1)
  const store = openStore(':memory:')
  store.putData(JSON.stringify({ records: { domains: [
    { id: 'd1', name: 'shop.example', status: 'Active' },
    { id: 'd2', name: 'old.example', status: 'Cancelled' },
  ] } }), 0)
  const answers: Record<string, unknown> = { 'shop.example': answer(['ns1.a.example', 'ns2.a.example']) }
  const lookup = vi.fn(async (name: string) => {
    if (!answers[name]) throw new Error('lookup failed')
    return { ...(answers[name] as object), checkedAt: new Date(clock).toISOString() }
  })
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok', { status: webhookStatus }))
  const notifier = createNotifier({ store, secretKey: randomBytes(32), now: () => new Date(clock), fetch, transport: vi.fn() as never })
  if (webhook) notifier.save({ webhook: { enabled: true, url: 'https://hooks.example/abc', format: 'json' } })
  const watch = createDomainWatch({ store, notifier, lookup, now: () => clock })
  const sentLines = () => fetch.mock.calls.flatMap(([, init]) => (JSON.parse(String(init?.body)).lines as string[]))
  return { watch, lookup, answers, fetch, sentLines, tick: (hours: number) => { clock += hours * 3600_000 } }
}

describe('scheduled domain watch', () => {
  it('is off until turned on', () => {
    const { watch } = setup()
    expect(watch.view().settings).toEqual({ enabled: false, intervalHours: 24 })
    expect(() => watch.save({ intervalHours: 5 })).toThrow(/6, 12 or 24/)
    expect(watch.save({ enabled: true, intervalHours: 12 }).settings).toEqual({ enabled: true, intervalHours: 12 })
  })

  it('checks active domains, reports changes once, and keeps a history', async () => {
    const { watch, lookup, answers, fetch, sentLines, tick } = setup()
    const first = await watch.run()
    expect(first).toMatchObject({ checked: 1, changes: 0 })
    expect(lookup).toHaveBeenCalledWith('shop.example')
    expect(lookup).not.toHaveBeenCalledWith('old.example')

    tick(24)
    answers['shop.example'] = answer(['ns1.evil.example', 'ns2.evil.example'], ['active'])
    const second = await watch.run()
    expect(second.changes).toBe(2)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sentLines()).toEqual([
      '⚠ shop.example: Nameservers changed from ns1.a.example, ns2.a.example to ns1.evil.example, ns2.evil.example.',
      '⚠ shop.example: Transfer lock was removed. Someone could move the domain away.',
    ])
    expect(watch.view().changes['shop.example']).toHaveLength(2)

    // Same state again: nothing new, nothing sent.
    tick(24)
    expect((await watch.run()).changes).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('tries again next time if every channel failed, but never sends twice once delivered', async () => {
    const { watch, answers, tick } = setup({ webhookStatus: 500 })
    await watch.run()
    tick(24)
    answers['shop.example'] = answer(['ns1.b.example', 'ns2.b.example'])
    const failed = await watch.run()
    expect(failed.failures[0]).toMatch(/answered 500/)
    expect(failed.notified).toBe(0)
  })

  it('does not queue changes up while no channel is on', async () => {
    const { watch, answers, tick } = setup({ webhook: false })
    await watch.run()
    tick(24)
    answers['shop.example'] = answer(['ns1.b.example', 'ns2.b.example'])
    expect((await watch.run()).changes).toBe(1)
    expect(watch.view().changes['shop.example']).toHaveLength(1)
  })

  it('skips a domain whose lookup fails, without losing its snapshot', async () => {
    const { watch, answers, tick } = setup()
    await watch.run()
    tick(24)
    delete answers['shop.example']
    expect((await watch.run()).failed).toEqual(['shop.example'])
    tick(24)
    answers['shop.example'] = answer(['ns1.a.example', 'ns2.a.example'])
    expect((await watch.run()).changes).toBe(0)
  })

  it('runs on its interval only when on', async () => {
    const { watch, lookup, tick } = setup()
    const stop = watch.start(60_000_000)
    expect(lookup).not.toHaveBeenCalled()
    stop()
    watch.save({ enabled: true, intervalHours: 6 })
    const stopAgain = watch.start(60_000_000)
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1))
    stopAgain()
    tick(1)
    const stopThird = watch.start(60_000_000)
    stopThird()
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})
