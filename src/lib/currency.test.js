import { describe, expect, it, vi } from 'vitest'
import {
  currencyOptions,
  fetchLatestRates,
  formatMoney,
  fromUsd,
  migrateRecordToUsd,
  parseRatesResponse,
  rateFor,
  ratesAreStale,
  unconvertedRecords,
} from './currency'

const rates = { EUR: 0.9, PKR: 280 }

describe('fromUsd', () => {
  it('converts dollars into the chosen currency', () => {
    expect(fromUsd(10, 'PKR', rates)).toBe(2800)
    expect(fromUsd(10, 'USD', rates)).toBe(10)
  })

  it('returns null when the rate is not known yet', () => {
    expect(fromUsd(10, 'GBP', rates)).toBeNull()
  })

  it('treats no currency as USD', () => {
    expect(rateFor('', rates)).toBe(1)
  })
})

describe('ratesAreStale', () => {
  const now = Date.parse('2026-10-07T12:00:00Z')

  it.each([
    ['', true],
    ['not a date', true],
    ['2026-10-06T11:00:00Z', true],
    ['2026-10-07T06:00:00Z', false],
  ])('%s -> %s', (fetchedAt, stale) => {
    expect(ratesAreStale(fetchedAt, now)).toBe(stale)
  })
})

describe('migrateRecordToUsd', () => {
  it('converts old PKR costs at the old fixed rate and drops the currency field', () => {
    expect(migrateRecordToUsd({ id: 'a', cost: 2780, currency: 'PKR' })).toEqual({ id: 'a', cost: 10 })
  })

  it('rounds to cents', () => {
    expect(migrateRecordToUsd({ id: 'a', cost: 1000, currency: 'PKR' }).cost).toBe(3.6)
  })

  it('just drops a USD currency field', () => {
    expect(migrateRecordToUsd({ id: 'a', cost: 5, currency: 'USD' })).toEqual({ id: 'a', cost: 5 })
  })

  it('leaves records without a currency alone', () => {
    const record = { id: 'a', cost: 5 }
    expect(migrateRecordToUsd(record)).toBe(record)
  })

  it('keeps a currency it cannot convert, so it can be flagged', () => {
    const record = { id: 'a', cost: 5, currency: 'XYZ' }
    expect(migrateRecordToUsd(record)).toBe(record)
    expect(unconvertedRecords({ domains: [record, { id: 'b', cost: 1 }] })).toEqual([record])
  })
})

describe('rates service', () => {
  it('parses an ExchangeRate-API response and ignores junk', () => {
    const parsed = parseRatesResponse({
      result: 'success',
      base_code: 'USD',
      rates: { USD: 1, EUR: 0.89, PKR: 276.74, bad: 3, JPY: -1 },
    })
    expect(parsed).toEqual({ EUR: 0.89, PKR: 276.74 })
  })

  it.each([
    [{ result: 'error', 'error-type': 'unsupported-code' }],
    [{ result: 'success', base_code: 'EUR', rates: {} }],
    [null],
  ])('rejects an unexpected response %#', (json) => {
    expect(() => parseRatesResponse(json)).toThrow()
  })

  it('fetches from the documented URL only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', base_code: 'USD', rates: { EUR: 0.9 } }) })
    expect(await fetchLatestRates(fetchImpl)).toEqual({ EUR: 0.9 })
    expect(fetchImpl).toHaveBeenCalledWith('https://open.er-api.com/v6/latest/USD')
  })

  it('reports HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    await expect(fetchLatestRates(fetchImpl)).rejects.toThrow('429')
  })
})

describe('currencyOptions', () => {
  it('offers common currencies plus any the service knows, never USD', () => {
    const options = currencyOptions({ XAF: 600 })
    expect(options).toContain('XAF')
    expect(options).toContain('PKR')
    expect(options).not.toContain('USD')
  })
})

describe('formatMoney', () => {
  it('shows a dash for unknown amounts', () => {
    expect(formatMoney(null, 'USD')).toBe('—')
  })

  it('falls back for codes Intl does not know', () => {
    expect(formatMoney(12.4, 'XYZ1')).toBe('12 XYZ1')
  })
})
