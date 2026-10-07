// Every cost is stored in US dollars. A second currency is only for display:
// the user picks it, and its rate comes from ExchangeRate-API's free
// endpoint (which requires visible attribution). Rates are stored as
// "1 USD = n units" and refreshed at most once a day.

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD'
export const RATES_SOURCE = 'ExchangeRate-API'
export const RATES_ATTRIBUTION_URL = 'https://www.exchangerate-api.com'
export const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Offered before any rates have been fetched; afterwards every currency the
// service knows is offered.
export const CURRENCIES = [
  'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'KRW',
  'INR', 'PKR', 'BDT', 'AED', 'SAR', 'TRY', 'ILS', 'EGP', 'NGN', 'KES', 'ZAR',
  'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK',
  'IDR', 'MYR', 'PHP', 'THB', 'VND',
]

export const defaultCurrencySettings = {
  secondCurrency: '',
  ratesPerUsd: {},
  ratesFetchedAt: '',
}

// Earlier versions had a USD/PKR switch and converted at a fixed 278 PKR per
// USD. Costs saved in PKR are converted once at that same rate, so totals
// don't move, and PKR stays the second currency.
export const LEGACY_RATES_PER_USD = { PKR: 278 }
export const legacySecondCurrency = 'PKR'

export function rateFor(currency, rates) {
  if (!currency || currency === 'USD') return 1
  const rate = Number(rates?.[currency])
  return rate > 0 ? rate : null
}

export function fromUsd(amount, currency, rates) {
  const rate = rateFor(currency, rates)
  return rate === null ? null : Number(amount || 0) * rate
}

export function ratesAreStale(fetchedAt, now = Date.now()) {
  const time = Date.parse(fetchedAt || '')
  return Number.isNaN(time) || now - time > RATES_MAX_AGE_MS
}

export function currencyOptions(rates) {
  return [...new Set([...CURRENCIES, ...Object.keys(rates || {})])].filter((code) => code !== 'USD').sort()
}

const round2 = (value) => Math.round(value * 100) / 100

// Converts a record saved with a non-USD cost to USD. Records in a currency
// we have no rate for are returned unchanged (still carrying `currency`), so
// nothing is silently mis-valued.
export function migrateRecordToUsd(record, rates = LEGACY_RATES_PER_USD) {
  if (!record || !('currency' in record)) return record
  const { currency, ...rest } = record
  if (!currency || currency === 'USD') return rest
  const rate = Number(rates[currency])
  if (!(rate > 0)) return record
  return { ...rest, cost: round2(Number(record.cost || 0) / rate) }
}

export function unconvertedRecords(records) {
  return Object.values(records).flat().filter((item) => item?.currency && item.currency !== 'USD')
}

export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${Math.round(value)} ${currency}`
  }
}

export function parseRatesResponse(json) {
  if (json?.result !== 'success' || json.base_code !== 'USD' || typeof json.rates !== 'object') {
    throw new Error('Unexpected answer from the rates service.')
  }
  const ratesPerUsd = {}
  Object.entries(json.rates).forEach(([currency, rate]) => {
    if (/^[A-Z]{3}$/.test(currency) && currency !== 'USD' && Number(rate) > 0) ratesPerUsd[currency] = Number(rate)
  })
  return ratesPerUsd
}

export async function fetchLatestRates(fetchImpl = fetch) {
  const response = await fetchImpl(RATES_URL)
  if (!response.ok) throw new Error(`The rates service answered with status ${response.status}.`)
  return parseRatesResponse(await response.json())
}
