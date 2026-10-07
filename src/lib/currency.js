// Money is converted through USD. Rates are stored as "1 USD = n units".
// Rates come from the user, or (only when they press the button) from the
// European Central Bank reference rates via frankfurter.dev.

export const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD'

// Currencies the ECB publishes, plus common ones it doesn't (which need a manual rate).
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'KRW',
  'INR', 'PKR', 'BDT', 'AED', 'SAR', 'TRY', 'ILS', 'EGP', 'NGN', 'KES', 'ZAR',
  'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK',
  'IDR', 'MYR', 'PHP', 'THB', 'VND',
]

export const defaultCurrencySettings = {
  baseCurrency: 'USD',
  ratesPerUsd: { USD: 1 },
  ratesUpdatedAt: '',
  ratesSource: '',
}

// Earlier versions converted PKR at a fixed 278 per USD. Keep that for
// existing installs so their totals don't change silently.
export const legacyRatesPerUsd = { USD: 1, PKR: 278 }

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

export function missingRates(records, rates) {
  return currenciesInUse(records).filter((currency) => rateFor(currency, rates) === null)
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
  if (json?.base !== 'USD' || typeof json.rates !== 'object') {
    throw new Error('Unexpected answer from the rates service.')
  }
  const ratesPerUsd = { USD: 1 }
  Object.entries(json.rates).forEach(([currency, rate]) => {
    if (/^[A-Z]{3}$/.test(currency) && Number(rate) > 0) ratesPerUsd[currency] = Number(rate)
  })
  return { ratesPerUsd, date: json.date || '' }
}

export async function fetchLatestRates(fetchImpl = fetch) {
  const response = await fetchImpl(RATES_URL)
  if (!response.ok) throw new Error(`The rates service answered with status ${response.status}.`)
  return parseRatesResponse(await response.json())
}

// Fetched rates replace the ones the service covers; manual rates for other
// currencies (e.g. PKR) are kept.
export function mergeRates(current, fetched) {
  return { ...current, ...fetched, USD: 1 }
}
