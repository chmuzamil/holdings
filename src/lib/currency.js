// Money is converted through USD. Rates are stored as "1 USD = n units".
// Rates come from the user, or (only when they press the button) from
// ExchangeRate-API's free endpoint, which requires visible attribution.

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD'
export const RATES_SOURCE = 'ExchangeRate-API'
export const RATES_ATTRIBUTION_URL = 'https://www.exchangerate-api.com'

// Common currencies offered in pickers; any currency with a known rate is offered too.
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'KRW',
  'INR', 'PKR', 'BDT', 'AED', 'SAR', 'TRY', 'ILS', 'EGP', 'NGN', 'KES', 'ZAR',
  'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK',
  'IDR', 'MYR', 'PHP', 'THB', 'VND',
]

export const defaultCurrencySettings = {
  baseCurrency: 'USD',
  // Optional currency the top bar can switch totals to. Chosen by the user.
  secondCurrency: '',
  ratesPerUsd: { USD: 1 },
  ratesUpdatedAt: '',
  ratesSource: '',
}

// Earlier versions had a USD/PKR switch with a fixed 278 PKR per USD. Keep
// both for existing installs so nothing changes silently.
export const legacyRatesPerUsd = { USD: 1, PKR: 278 }
export const legacySecondCurrency = 'PKR'

export function currencyOptions(rates) {
  return [...new Set([...CURRENCIES, ...Object.keys(rates || {})])].sort((a, b) =>
    a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
}

export function rateFor(currency, rates) {
  const rate = Number(rates?.[currency || 'USD'])
  return rate > 0 ? rate : null
}

export function convert(amount, from, to, rates) {
  const fromRate = rateFor(from, rates)
  const toRate = rateFor(to, rates)
  if (fromRate === null || toRate === null) return null
  return (Number(amount || 0) / fromRate) * toRate
}

export function currenciesInUse(records) {
  const used = new Set()
  Object.values(records).flat().forEach((item) => {
    if (item?.currency) used.add(item.currency)
  })
  return [...used].sort()
}

export function missingRates(records, rates, extra = []) {
  const wanted = new Set([...currenciesInUse(records), ...extra.filter(Boolean)])
  return [...wanted].sort().filter((currency) => rateFor(currency, rates) === null)
}

export function formatMoney(value, currency) {
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
  const ratesPerUsd = { USD: 1 }
  Object.entries(json.rates).forEach(([currency, rate]) => {
    if (/^[A-Z]{3}$/.test(currency) && Number(rate) > 0) ratesPerUsd[currency] = Number(rate)
  })
  const updated = Number(json.time_last_update_unix)
  const date = updated > 0 ? new Date(updated * 1000).toISOString().slice(0, 10) : ''
  return { ratesPerUsd, date }
}

export async function fetchLatestRates(fetchImpl = fetch) {
  const response = await fetchImpl(RATES_URL)
  if (!response.ok) throw new Error(`The rates service answered with status ${response.status}.`)
  return parseRatesResponse(await response.json())
}

// Fetched rates replace the ones the service covers; manual rates for any
// other currency are kept.
export function mergeRates(current, fetched) {
  return { ...current, ...fetched, USD: 1 }
}
