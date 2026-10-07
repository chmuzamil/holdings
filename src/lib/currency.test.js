import { describe, expect, it, vi } from 'vitest'
import {
  convert,
  currenciesInUse,
  fetchLatestRates,
  formatMoney,
  mergeRates,
  missingRates,
  parseRatesResponse,
  rateFor,
  currencyOptions,
} from './currency'

const rates = { USD: 1, EUR: 0.9, PKR: 280 }

describe('convert', () => {
  it('converts through USD', () => {
    expect(convert(280, 'PKR', 'USD', rates)).toBeCloseTo(1)
    expect(convert(9, 'EUR', 'PKR', rates)).toBeCloseTo(2800)
    expect(convert(5, 'USD', 'USD', rates)).toBe(5)
  })

  it('returns null when a rate is unknown, rather than guessing', () => {
    expect(convert(10, 'GBP', 'USD', rates)).toBeNull()
    expect(convert(10, 'USD', 'GBP', rates)).toBeNull()
  })

  it('treats a missing currency as USD', () => {
    expect(rateFor(undefined, rates)).toBe(1)
  })
})

describe('rates in use', () => {
  const records = {
    domains: [{ currency: 'USD' }, { currency: 'PKR' }],
    subscriptions: [{ currency: 'GBP' }, {}],
  }

  it('lists currencies used by records', () => {
    expect(currenciesInUse(records)).toEqual(['GBP', 'PKR', 'USD'])
  })

  it('finds currencies that have no rate', () => {
    expect(missingRates(records, rates)).toEqual(['GBP'])
  })

  it('also checks the chosen main and second currencies', () => {
    expect(missingRates(records, rates, ['AED', '', 'EUR'])).toEqual(['AED', 'GBP'])
  })

  it('offers common currencies plus any with a rate, USD first', () => {
    const options = currencyOptions({ USD: 1, XAF: 600 })
    expect(options[0]).toBe('USD')
    expect(options).toContain('XAF')
    expect(options).toContain('PKR')
  })
})

describe('fetched rates', () => {
  it('parses an ExchangeRate-API response and ignores junk', () => {
    const parsed = parseRatesResponse({
      result: 'success',
      base_code: 'USD',
      time_last_update_unix: 1791331352,
      rates: { USD: 1, EUR: 0.89, PKR: 276.74, bad: 3, JPY: -1 },
    })
    expect(parsed).toEqual({ ratesPerUsd: { USD: 1, EUR: 0.89, PKR: 276.74 }, date: '2026-10-07' })
  })

  it.each([
    [{ result: 'error', 'error-type': 'unsupported-code' }],
    [{ result: 'success', base_code: 'EUR', rates: {} }],
    [null],
  ])('rejects an unexpected response %#', (json) => {
    expect(() => parseRatesResponse(json)).toThrow()
  })

  it('keeps manual rates the service does not cover', () => {
    expect(mergeRates({ USD: 1, PKR: 280, EUR: 0.8 }, { USD: 1, EUR: 0.9 })).toEqual({ USD: 1, PKR: 280, EUR: 0.9 })
  })

  it('fetches from the documented URL only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', base_code: 'USD', rates: { EUR: 0.9 } }) })
    await fetchLatestRates(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith('https://open.er-api.com/v6/latest/USD')
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
