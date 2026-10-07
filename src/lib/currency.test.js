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
})

describe('fetched rates', () => {
  it('parses a frankfurter response and ignores junk', () => {
    const parsed = parseRatesResponse({ base: 'USD', date: '2026-10-07', rates: { EUR: 0.89, GBP: 0.76, bad: 3, JPY: -1 } })
    expect(parsed).toEqual({ ratesPerUsd: { USD: 1, EUR: 0.89, GBP: 0.76 }, date: '2026-10-07' })
  })

  it('rejects an unexpected response', () => {
    expect(() => parseRatesResponse({ base: 'EUR', rates: {} })).toThrow()
  })

  it('keeps manual rates the service does not cover', () => {
    expect(mergeRates({ USD: 1, PKR: 280, EUR: 0.8 }, { USD: 1, EUR: 0.9 })).toEqual({ USD: 1, PKR: 280, EUR: 0.9 })
  })

  it('fetches from the documented URL only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ base: 'USD', rates: { EUR: 0.9 } }) })
    await fetchLatestRates(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?base=USD')
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
