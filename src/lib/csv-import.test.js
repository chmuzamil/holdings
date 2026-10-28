import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { countLabel, guessMapping, IMPORT_TYPES, parseCost, parseDate, previewImport, templateCsv } from './csv-import'

const load = (text, type, existing) => {
  const [headers, ...rows] = parseCsv(text)
  return previewImport(rows, guessMapping(headers, type), type, existing)
}

describe('guessMapping', () => {
  it('matches common column names, in any order', () => {
    expect(guessMapping(['Notes', 'Domain Name', 'Registrar', 'Expires', 'Price'], 'domains')).toEqual({
      name: 1, provider: 2, cost: 4, renewalDate: -1, expiryDate: 3, status: -1, notes: 0,
    })
  })
})

describe('reading values', () => {
  it('reads ISO-style dates and refuses ones it would have to guess', () => {
    expect(['2026-11-05', '2026/1/5', '2026-11-05T10:00:00Z', '', '05/11/2026', '2026-02-30'].map(parseDate))
      .toEqual(['2026-11-05', '2026-01-05', '2026-11-05', '', null, null])
  })

  it('reads costs with currency signs and thousands separators', () => {
    expect(['12', '$12.50', 'USD 1,200', '1,200.5 usd', '', '-3', 'twelve'].map(parseCost)).toEqual([12, 12.5, 1200, 1200.5, 0, null, null])
  })
})

describe('previewImport', () => {
  it('adds valid domains and skips duplicates of existing ones and within the file', () => {
    const preview = load('domain,registrar,cost,renewal\nShop.example,Porkbun,12,2027-03-14\nnew.example,,10,\nwww.new.example,,10,\nold.example,,9,', 'domains', [{ name: 'old.example' }])
    expect(preview.rows.map((row) => row.status)).toEqual(['add', 'add', 'duplicate-in-file', 'duplicate'])
    expect(preview.rows[0].record).toEqual({ name: 'shop.example', provider: 'Porkbun', cost: 12, renewalDate: '2027-03-14', expiryDate: '', status: 'Active', notes: '' })
    expect(preview.summary).toEqual({ add: 2, duplicate: 2, invalid: 0 })
  })

  it('treats subscriptions as duplicates by name, cost and renewal date', () => {
    const existing = [{ name: 'Postmark', cost: 15, renewalDate: '2026-11-10' }]
    const preview = load('name,cost,renewal date\npostmark,15,2026-11-10\nPostmark,15,2026-12-10\nPostmark,20,2026-11-10', 'subscriptions', existing)
    expect(preview.rows.map((row) => row.status)).toEqual(['duplicate', 'add', 'add'])
  })

  it('explains invalid rows, with their line number', () => {
    const preview = load('domain,cost,renewal,status\nnot a domain,12,2026-11-05,Active\nok.example,lots,05/11/2026,Paused', 'domains')
    expect(preview.rows[0]).toMatchObject({ line: 2, status: 'invalid', errors: ['"not a domain" isn\'t a domain name.'] })
    expect(preview.rows[1].errors).toEqual([
      'Yearly cost (USD) "lots" isn\'t a number.',
      'Renewal date "05/11/2026" isn\'t a date. Use YYYY-MM-DD.',
      'Status "Paused" should be one of Active, Expiring Soon, Expired, Cancelled.',
    ])
    expect(preview.summary.invalid).toBe(2)
  })

  it('rejects rows with anything that looks like a secret, in any column, mapped or not', () => {
    // Built at runtime so the source never holds a string secret scanners would flag.
    const fakeKey = `sk_${'live'}_${'aB3dE5gH7jK9mN1pQ'.repeat(2).slice(0, 24)}`
    const preview = load(`name,notes,extra\nStripe,key is ${fakeKey},\nVPS,,4242 4242 4242 4242`, 'subscriptions')
    expect(preview.rows.map((row) => row.status)).toEqual(['invalid', 'invalid'])
    expect(preview.rows[0].errors[0]).toMatch(/^Notes looks like it contains a .*never stores secrets/)
    expect(preview.rows[1].errors[0]).toMatch(/^Column 3 looks like it contains a card number/)
  })

  it('needs the required field mapped and filled', () => {
    const preview = previewImport([['Porkbun']], { name: -1, provider: 0 }, 'domains')
    expect(preview.rows[0].errors).toContain('Domain is empty.')
  })

  it('reads servers, duplicates by name and IP', () => {
    const preview = load('name,provider,ip,cost\nMain VPS,Hetzner,203.0.113.10,10\nmain vps,Hetzner,203.0.113.10,10\nMain VPS,Hetzner,203.0.113.11,10', 'servers')
    expect(preview.rows.map((row) => row.status)).toEqual(['add', 'duplicate-in-file', 'add'])
  })
})

describe('templateCsv', () => {
  it('has the field names and an example that imports cleanly', () => {
    for (const type of Object.keys(IMPORT_TYPES)) {
      const template = templateCsv(type)
      expect(template.split('\r\n')[0]).toBe(IMPORT_TYPES[type].fields.map((field) => field.label).join(','))
      const [headers, ...rows] = parseCsv(template)
      const mapping = Object.fromEntries(IMPORT_TYPES[type].fields.map((field, index) => [field.key, headers.indexOf(field.label) === index ? index : -1]))
      expect(previewImport(rows, mapping, type).summary).toEqual({ add: 1, duplicate: 0, invalid: 0 })
    }
  })
})

describe('countLabel', () => {
  it('uses the singular for one', () => {
    expect([countLabel('domains', 1), countLabel('domains', 3), countLabel('subscriptions', 1)]).toEqual(['1 domain', '3 domains', '1 subscription'])
  })
})
