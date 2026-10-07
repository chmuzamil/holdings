import { describe, expect, it } from 'vitest'
import { buildExport, exportFileName, parseImport } from './data-transfer'

const records = {
  domains: [{ id: 'd1', name: 'shopfront.example' }],
  servers: [{ id: 's1', name: 'Main VPS' }],
  repos: [],
  projects: [],
  accounts: [],
  subscriptions: [],
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
