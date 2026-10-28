import { describe, expect, it } from 'vitest'
import { buildExport, exportFileName, findImportSecrets, parseImport, parseImportFile } from './data-transfer'
import { findSecretsInRecord } from './secrets'

const records = {
  domains: [{ id: 'd1', name: 'shopfront.example' }],
  servers: [{ id: 's1', name: 'Main VPS' }],
  repos: [],
  projects: [],
  accounts: [],
  subscriptions: [],
  keys: [],
}

describe('buildExport', () => {
  it('wraps records in a versioned envelope', () => {
    const now = new Date('2026-10-07T12:00:00Z')
    const result = buildExport(records, now)
    expect(result).toMatchObject({ format: 'holdings-export', version: 1, exportedAt: '2026-10-07T12:00:00.000Z' })
    expect(result.records.domains).toHaveLength(1)
  })

  it('fills in missing modules with empty lists', () => {
    expect(buildExport({ domains: [] }).records.subscriptions).toEqual([])
  })
})

describe('parseImport', () => {
  it('round-trips an export', () => {
    const text = JSON.stringify(buildExport(records))
    expect(parseImport(text)).toEqual(records)
  })

  it('accepts a bare records object', () => {
    const parsed = parseImport(JSON.stringify({ domains: [{ id: 'd1' }] }))
    expect(parsed.domains).toEqual([{ id: 'd1' }])
    expect(parsed.servers).toEqual([])
  })

  it('drops items without an id', () => {
    const parsed = parseImport(JSON.stringify({ domains: [{ id: 'd1' }, { name: 'no id' }, null] }))
    expect(parsed.domains).toEqual([{ id: 'd1' }])
  })

  it.each([
    ['not json', 'This file is not valid JSON.'],
    ['[]', 'No records found in this file.'],
    ['{"hello": 1}', 'No records found in this file.'],
    ['{"domains": "x"}', '"domains" should be a list.'],
  ])('rejects %s', (text, message) => {
    expect(() => parseImport(text)).toThrow(message)
  })
})

describe('exportFileName', () => {
  it('uses the date', () => {
    expect(exportFileName(new Date('2026-10-07T23:00:00Z'))).toBe('holdings-export-2026-10-07.json')
  })
})

describe('findImportSecrets', () => {
  it('finds secrets anywhere in an import, and names where', () => {
    const card = ['4242', '4242', '4242', '4242'].join(' ')
    const imported = {
      domains: [{ id: 'd1', name: 'shop.example', notes: 'fine' }],
      keys: [{ id: 'k1', name: 'Visa', notes: `number ${card}` }],
    }
    expect(findImportSecrets(imported, findSecretsInRecord)).toEqual([{ module: 'Key or card', name: 'Visa', field: 'notes', kind: 'card number' }])
    expect(findImportSecrets({ domains: imported.domains }, findSecretsInRecord)).toEqual([])
  })
})

describe('handover settings in the export', () => {
  const handover = { owner: 'Sam', recipient: 'Sara', message: 'Call the accountant first.', runbook: '1. Renew shop.example' }

  it('exports and imports the note and global runbook', () => {
    const text = JSON.stringify(buildExport(records, new Date(), { handover: { ...handover, extra: 'dropped' } }))
    expect(parseImportFile(text)).toEqual({ records, handover })
  })

  it('leaves them out when empty, and older exports without them still import', () => {
    expect(buildExport(records, new Date(), { handover: { owner: '', runbook: '' } })).not.toHaveProperty('handover')
    expect(parseImportFile(JSON.stringify(buildExport(records)))).toEqual({ records, handover: null })
    expect(parseImportFile(JSON.stringify({ format: 'holdings-export', version: 1, records, handover: 'nonsense' })).handover).toBeNull()
  })

  it('checks them for secrets too', () => {
    const card = ['4242', '4242', '4242', '4242'].join(' ')
    const hits = findImportSecrets({ domains: [] }, findSecretsInRecord, { ...handover, runbook: `card ${card}` })
    expect(hits).toEqual([{ module: 'Handover pack', name: 'settings', field: 'runbook', kind: 'card number' }])
  })
})
