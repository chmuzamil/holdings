import { describe, expect, it, vi } from 'vitest'
import { openStore } from './db'
import { createUptime, readGatus, readKuma } from './uptime'

// Shapes as returned by Uptime Kuma's public status page API.
const KUMA_PAGE = {
  config: { slug: 'main', title: 'Main' },
  publicGroupList: [
    { id: 1, name: 'Servers', monitorList: [{ id: 3, name: 'Main VPS' }, { id: 4, name: 'Staging VPS' }] },
    { id: 2, name: 'Sites', monitorList: [{ id: 7, name: 'shopfront.example' }, { id: 8, name: 'New monitor' }] },
  ],
}
const KUMA_BEATS = {
  heartbeatList: {
    3: [{ status: 0, time: '2026-10-29 07:58:00.000' }, { status: 1, time: '2026-10-29 08:00:00.000' }],
    4: [{ status: 1, time: '2026-10-29 07:59:00.000' }, { status: 0, time: '2026-10-29 08:00:00.000' }],
    7: [{ status: 3, time: '2026-10-29 08:00:00.000' }],
  },
  uptimeList: { '3_24': 0.9986, '4_24': 0.91 },
}
// Shape as returned by Gatus' /api/v1/endpoints/statuses.
const GATUS = [
  {
    name: 'api',
    group: 'shopfront',
    key: 'shopfront_api',
    results: [
      { success: true, timestamp: '2026-10-29T08:00:00Z' },
      { success: false, timestamp: '2026-10-29T07:55:00Z' },
      { success: true, timestamp: '2026-10-29T07:50:00Z' },
      { success: true, timestamp: '2026-10-29T07:45:00Z' },
    ],
  },
  { name: 'docs', group: '', key: '_docs', results: [] },
]

describe('reading status pages', () => {
  it('reads Uptime Kuma monitors with their latest heartbeat and 24-hour uptime', () => {
    expect(readKuma(KUMA_PAGE, KUMA_BEATS)).toEqual([
      { key: 'kuma:3', name: 'Main VPS', group: 'Servers', status: 'up', checkedAt: '2026-10-29T08:00:00.000Z', uptime: 0.9986 },
      { key: 'kuma:4', name: 'Staging VPS', group: 'Servers', status: 'down', checkedAt: '2026-10-29T08:00:00.000Z', uptime: 0.91 },
      { key: 'kuma:7', name: 'shopfront.example', group: 'Sites', status: 'maintenance', checkedAt: '2026-10-29T08:00:00.000Z', uptime: null },
      { key: 'kuma:8', name: 'New monitor', group: 'Sites', status: 'unknown', checkedAt: null, uptime: null },
    ])
  })

  it('reads Gatus endpoints, using the newest result whatever the order', () => {
    expect(readGatus(GATUS)).toEqual([
      { key: 'gatus:shopfront_api', name: 'api', group: 'shopfront', status: 'up', checkedAt: '2026-10-29T08:00:00.000Z', uptime: 0.75 },
      { key: 'gatus:_docs', name: 'docs', group: '', status: 'unknown', checkedAt: null, uptime: null },
    ])
  })

  it('copes with empty or unexpected answers', () => {
    expect(readKuma({}, {})).toEqual([])
    expect(readGatus({ error: 'nope' })).toEqual([])
  })
})

function fakeStatusPage() {
  return vi.fn(async (url: string) => {
    const body = url.endsWith('/api/status-page/main') ? KUMA_PAGE
      : url.endsWith('/api/status-page/heartbeat/main') ? KUMA_BEATS
        : url.endsWith('/api/v1/endpoints/statuses') ? GATUS
          : null
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 })
  })
}

describe('uptime settings', () => {
  function setup(fetch = fakeStatusPage()) {
    let clock = 0
    const uptime = createUptime({ store: openStore(':memory:'), fetch, now: () => clock })
    return { uptime, fetch, tick: (ms: number) => { clock += ms } }
  }

  it('is off by default and fetches nothing', async () => {
    const { uptime, fetch } = setup()
    expect(await uptime.status()).toMatchObject({ settings: { enabled: false }, monitors: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks the status page before turning on', async () => {
    const { uptime } = setup()
    await expect(uptime.save({ enabled: true, kind: 'kuma', url: 'not a url', slug: 'main' })).rejects.toThrow(/full address/)
    await expect(uptime.save({ enabled: true, kind: 'kuma', url: 'https://status.example', slug: '' })).rejects.toThrow(/status page name/)
    await expect(uptime.save({ enabled: true, kind: 'kuma', url: 'https://status.example', slug: 'wrong' })).rejects.toThrow(/Nothing found/)
    const on = await uptime.save({ enabled: true, kind: 'kuma', url: 'https://status.example/', slug: 'main' })
    expect(on.settings).toMatchObject({ enabled: true, url: 'https://status.example' })
    expect(on.monitors).toHaveLength(4)
  })

  it('works with Gatus too', async () => {
    const { uptime } = setup()
    const on = await uptime.save({ enabled: true, kind: 'gatus', url: 'https://gatus.example' })
    expect(on.monitors.map((monitor) => monitor.name)).toEqual(['api', 'docs'])
  })

  it('keeps links to Holdings items, and drops empty ones', async () => {
    const { uptime } = setup()
    await uptime.save({ enabled: true, kind: 'kuma', url: 'https://status.example', slug: 'main' })
    const saved = await uptime.save({ links: { 'kuma:3': 'server_main', 'kuma:4': '' } })
    expect(saved.settings.links).toEqual({ 'kuma:3': 'server_main' })
  })

  it('reads the page at most once a minute', async () => {
    const { uptime, fetch, tick } = setup()
    await uptime.save({ enabled: true, kind: 'gatus', url: 'https://gatus.example' })
    // Turning it on read the page once, and that answer is reused.
    expect(fetch).toHaveBeenCalledTimes(1)
    await uptime.status()
    await uptime.status()
    expect(fetch).toHaveBeenCalledTimes(1)
    tick(61_000)
    await uptime.status()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows the last known monitors as unknown when the page stops answering', async () => {
    let up = true
    const fetch = vi.fn(async () => (up ? new Response(JSON.stringify(GATUS)) : new Response('down', { status: 502 })))
    const { uptime, tick } = setup(fetch)
    await uptime.save({ enabled: true, kind: 'gatus', url: 'https://gatus.example' })
    up = false
    tick(61_000)
    const status = await uptime.status()
    expect(status.error).toBe('It answered 502.')
    expect(status.monitors.map((monitor) => monitor.status)).toEqual(['unknown', 'unknown'])
  })
})

describe('Kuma times', () => {
  it('accepts both time formats and ignores bad ones', () => {
    const page = { publicGroupList: [{ name: 'G', monitorList: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }] }] }
    const beats = {
      heartbeatList: {
        1: [{ status: 1, time: '2026-10-29T08:00:00.000Z' }],
        2: [{ status: 1, time: '2026-10-29T10:00:00+02:00' }],
        3: [{ status: 1, time: 'not a time' }],
      },
    }
    expect(readKuma(page, beats).map((monitor) => monitor.checkedAt)).toEqual(['2026-10-29T08:00:00.000Z', '2026-10-29T08:00:00.000Z', null])
  })
})
