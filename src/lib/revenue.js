// Turns revenue from the self-hosted server (cents, per currency, per
// product, from Stripe, Lemon Squeezy, Paddle or a custom URL) into each
// linked project's monthly revenue in USD.

// These are sent in whole units instead of cents.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

export const SOURCE_LABELS = { stripe: 'Stripe', lemonsqueezy: 'Lemon Squeezy', paddle: 'Paddle', custom: 'your revenue URL' }

export function toMajorUnits(amount, currency) {
  return ZERO_DECIMAL.has(currency) ? amount : amount / 100
}

/** Stripe product ids have no prefix; other sources' ids look like "paddle:pro_…". */
export function sourceOf(productId) {
  const prefix = String(productId).split(':')[0]
  return String(productId).includes(':') && prefix in SOURCE_LABELS ? prefix : 'stripe'
}

/** "Stripe and Paddle", for the sources a project's revenue comes from. */
export function sourceNames(productIds = []) {
  const names = [...new Set(productIds.map((id) => SOURCE_LABELS[sourceOf(id)]))]
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? ''
}

/**
 * Puts every source's products in one list. `loaded` says which sources
 * answered, so a project isn't recalculated from half its products.
 */
export function combineRevenue(stripe, sources = []) {
  const reports = [...(stripe ? [{ ...stripe, source: 'stripe', label: 'Stripe' }] : []), ...sources.filter(Boolean)]
  if (!reports.length) return null
  return {
    checkedAt: reports.map((report) => report.checkedAt).sort().at(-1),
    loaded: reports.map((report) => report.source),
    products: reports.flatMap((report) => report.products.map((product) => ({ ...product, source: report.label }))),
  }
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

/** Monthly USD for a project's linked products, or null if it can't be worked out yet. */
export function projectRevenueUsd(project, revenue, ratesPerUsd) {
  const ids = project.revenueProductIds ?? []
  if (!ids.length || !revenue) return null
  let total = 0
  for (const id of ids) {
    // A source that hasn't answered (yet) would make the total too low.
    if (revenue.loaded && !revenue.loaded.includes(sourceOf(id))) return null
    const product = revenue.products.find((item) => item.id === id)
    if (!product) continue
    const usd = productMonthlyUsd(product, ratesPerUsd)
    if (usd === null) return null
    total += usd
  }
  return Math.round(total * 100) / 100
}

/**
 * Writes revenue into projects linked to products. Returns the same
 * projects array when nothing changed, so React doesn't re-save.
 */
export function applyRevenue(projects, revenue, ratesPerUsd) {
  let changed = false
  const next = projects.map((project) => {
    const usd = projectRevenueUsd(project, revenue, ratesPerUsd)
    if (usd === null || (project.monthlyRevenueUsd === usd && project.revenueSyncedAt === revenue.checkedAt)) return project
    changed = true
    return { ...project, monthlyRevenueUsd: usd, revenueSyncedAt: revenue.checkedAt }
  })
  return changed ? next : projects
}
