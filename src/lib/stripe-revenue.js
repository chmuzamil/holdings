// Turns Stripe revenue from the server (cents, per currency, per product) into
// each linked project's monthly revenue in USD.

// Stripe sends these in whole units instead of cents.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

export function toMajorUnits(amount, currency) {
  return ZERO_DECIMAL.has(currency) ? amount : amount / 100
}

/** Currencies in the revenue that we can't turn into USD with these rates. */
export function missingRates(revenue, ratesPerUsd = {}) {
  const currencies = new Set((revenue?.products ?? []).flatMap((product) => Object.keys(product.monthly)))
  return [...currencies].filter((currency) => currency !== 'USD' && !(ratesPerUsd[currency] > 0))
}

/** Monthly USD for one product, or null if a currency can't be converted. */
export function productMonthlyUsd(product, ratesPerUsd = {}) {
  let total = 0
  for (const [currency, amount] of Object.entries(product.monthly)) {
    const major = toMajorUnits(amount, currency)
    if (currency === 'USD') total += major
    else if (ratesPerUsd[currency] > 0) total += major / ratesPerUsd[currency]
    else return null
  }
  return Math.round(total * 100) / 100
}

/** Monthly USD for a project's linked products, or null if it can't be worked out. */
export function projectStripeRevenueUsd(project, revenue, ratesPerUsd) {
  const ids = project.stripeProductIds ?? []
  if (!ids.length || !revenue) return null
  let total = 0
  for (const id of ids) {
    const product = revenue.products.find((item) => item.id === id)
    if (!product) continue
    const usd = productMonthlyUsd(product, ratesPerUsd)
    if (usd === null) return null
    total += usd
  }
  return Math.round(total * 100) / 100
}

/**
 * Writes Stripe revenue into projects linked to Stripe products. Returns the
 * same projects array when nothing changed, so React doesn't re-save.
 */
export function applyStripeRevenue(projects, revenue, ratesPerUsd) {
  let changed = false
  const next = projects.map((project) => {
    const usd = projectStripeRevenueUsd(project, revenue, ratesPerUsd)
    if (usd === null || (project.monthlyRevenueUsd === usd && project.revenueSyncedAt === revenue.checkedAt)) return project
    changed = true
    return { ...project, monthlyRevenueUsd: usd, revenueSyncedAt: revenue.checkedAt }
  })
  return changed ? next : projects
}
