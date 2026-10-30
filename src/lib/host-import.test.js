import { describe, expect, it } from 'vitest'
import { applyImport } from './domain-import'
import { monthlyUsd, neededCurrencies, previewHosts } from './host-import'

const server = (fields) => ({
  name: '', provider: 'Hetzner', ip: '', ipv6: '', cpu: 2, ramGb: 4, storage: '40 GB', location: 'Falkenstein, DE', plan: 'CX22',
  os: 'Ubuntu 24.04', status: 'running', monthlyCost: 4.51, currency: 'EUR', notes: 'Hetzner Cloud price before VAT.', ...fields,
})

const hetzner = {
  host: 'Hetzner',
  checkedAt: '2026-10-30T10:00:00.000Z',
  warnings: [],
  servers: [
    server({ name: 'web-1', ip: '203.0.113.10', ipv6: '2001:db8:1::/64' }),
    server({ name: 'renamed-at-hetzner', ip: '203.0.113.20' }),
    server({ name: 'Worker', ip: '', status: 'off' }),
    server({ name: 'same', ip: '203.0.113.30' }),
  ],
}

const records = {
  servers: [
    { id: 'srv_a', name: 'Staging box', provider: '', ipAddress: '203.0.113.20', cpu: 0, ramGb: 0, storage: '', os: '', location: '', packageName: '', cost: 9 },
    { id: 'srv_w', name: 'worker', provider: 'Hetzner', ipAddress: '', cpu: 2, ramGb: 4, storage: '40 GB', os: 'Ubuntu 24.04', location: 'Falkenstein, DE', packageName: 'CX22', cost: 0 },
    { id: 'srv_s', name: 'Same', provider: 'Hetzner', ipAddress: '203.0.113.30', cpu: 2, ramGb: 4, storage: '40 GB', os: 'Ubuntu 24.04', location: 'Falkenstein, DE', packageName: 'CX22', cost: 5 },
  ],
}

const rates = { EUR: 0.92 }

describe('monthlyUsd', () => {
  it('converts with the daily rate, and says when it can’t', () => {
    expect(monthlyUsd({ monthlyCost: 12, currency: 'USD' })).toBe(12)
    expect(monthlyUsd({ monthlyCost: 4.51, currency: 'EUR' }, rates)).toBe(4.9)
    expect(monthlyUsd({ monthlyCost: 4.51, currency: 'EUR' }, {})).toBeNull()
    expect(monthlyUsd({ monthlyCost: null, currency: 'USD' })).toBeNull()
    expect(neededCurrencies(hetzner, {})).toEqual(['EUR'])
    expect(neededCurrencies(hetzner, rates)).toEqual([])
  })
})

describe('previewHosts', () => {
  const rows = previewHosts(hetzner, records, rates)

  it('adds new servers with specs, cost in USD and notes', () => {
    expect(rows[0]).toMatchObject({ status: 'add', name: 'web-1', changes: ['CX22', '203.0.113.10', 'Falkenstein, DE', '$4.90 a month (4.51 EUR)'] })
    expect(rows[0].record).toMatchObject({ provider: 'Hetzner', packageName: 'CX22', ipAddress: '203.0.113.10', cpu: 2, ramGb: 4, cost: 4.9, notes: 'Hetzner Cloud price before VAT. IPv6 2001:db8:1::/64.' })
  })

  it('matches by IP first, fills only empty fields and keeps your cost', () => {
    expect(rows[1]).toMatchObject({ status: 'update', id: 'srv_a', name: 'renamed-at-hetzner (your Staging box)' })
    expect(rows[2].name).toBe('Worker')
    expect(rows[1].patch).toEqual({ provider: 'Hetzner', packageName: 'CX22', cpu: 2, ramGb: 4, storage: '40 GB', os: 'Ubuntu 24.04', location: 'Falkenstein, DE' })
    expect(rows[1].changes.at(-1)).toBe('Hetzner lists $4.90 a month (4.51 EUR); yours stays $9.00')
  })

  it('matches by name when there is no IP, and fills a missing cost', () => {
    expect(rows[2]).toMatchObject({ status: 'update', id: 'srv_w', patch: { cost: 4.9 } })
    expect(rows[3]).toMatchObject({ status: 'same', id: 'srv_s' })
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })

  it('keeps the original price in notes when there is no exchange rate', () => {
    const [row] = previewHosts({ ...hetzner, servers: [server({ name: 'new', status: 'off' })] }, { servers: [] }, {})
    expect(row.record).toMatchObject({ cost: 0, notes: 'Hetzner Cloud price before VAT. Costs 4.51 EUR a month. Was off when imported.' })
    expect(row.changes).toContain('4.51 EUR a month (no exchange rate)')
  })

  it('leaves out anything that looks like a secret', () => {
    const card = ['4242', '4242', '4242', '4242'].join(' ')
    expect(previewHosts({ ...hetzner, servers: [server({ name: 'x', notes: card })] }, { servers: [] }, rates)[0]).toMatchObject({ status: 'invalid' })
  })

  it('applies the chosen rows as servers', () => {
    const servers = applyImport(records.servers, rows, 'servers', new Date('2026-10-30T10:00:00Z'))
    expect(servers[0].id).toMatch(/^servers-/)
    expect(servers.find((item) => item.id === 'srv_a')).toMatchObject({ name: 'Staging box', cost: 9, cpu: 2, editedAt: '2026-10-30T10:00:00.000Z' })
  })
})
