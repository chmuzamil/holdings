// Read-only Stripe revenue. Uses a restricted key with read access to
// subscriptions and products, so Holdings can't change anything in Stripe.

const API = 'https://api.stripe.com/v1'
const PAGE_LIMIT = 100
const MAX_PAGES = 50
const TIMEOUT_MS = 15_000

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface ProductRevenue {
  id: string
  name: string
  active: boolean
  /** Monthly recurring revenue in the smallest currency unit (cents), by currency. */
  monthly: Record<string, number>
  subscriptions: number
}

export interface StripeRevenue {
  mode: 'live' | 'test'
  checkedAt: string
  products: ProductRevenue[]
  /** Subscription items that couldn't be priced (metered or tiered prices). */
  skippedItems: number
}

/** Returns an error message, or '' for a usable restricted key. */
export function checkStripeKey(key: string): string {
  const value = key.trim()
  if (/^sk_(live|test)_/.test(value)) {
    return 'That is a secret key, which can change your Stripe account. Create a restricted key with read access to Subscriptions and Products instead.'
  }
  if (/^pk_(live|test)_/.test(value)) return 'That is a publishable key. Create a restricted key (it starts with rk_).'
  if (!/^rk_(live|test)_[A-Za-z0-9]{10,}$/.test(value)) return 'Paste a Stripe restricted key. It starts with rk_live_ or rk_test_.'
  return ''
}

export function keyHint(key: string): string {
  return `${key.startsWith('rk_live_') ? 'live' : 'test'} key ending ${key.slice(-4)}`
}

export class StripeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function get(key: string, path: string, params: Record<string, string>, fetchImpl: FetchLike) {
  const url = `${API}${path}?${new URLSearchParams(params)}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new StripeError('Couldn’t reach Stripe. Try again in a minute.', 502)
  }
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
  if (response.status === 401) throw new StripeError('Stripe didn’t accept this key. It may have been deleted or rolled.', 400)
  if (response.status === 403) {
    throw new StripeError('This key can’t read subscriptions and products. Give it read access to both in Stripe.', 400)
  }
  if (!response.ok) throw new StripeError(json?.error?.message || `Stripe answered ${response.status}.`, 502)
  return json as { data: Record<string, unknown>[]; has_more: boolean }
}

async function listAll(key: string, path: string, params: Record<string, string>, fetchImpl: FetchLike) {
  const items: Record<string, unknown>[] = []
  let after = ''
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await get(key, path, { ...params, limit: String(PAGE_LIMIT), ...(after ? { starting_after: after } : {}) }, fetchImpl)
    items.push(...result.data)
    if (!result.has_more || !result.data.length) break
    after = String(result.data[result.data.length - 1]?.id ?? '')
  }
  return items
}

/** Monthly amount for one subscription item, or null if it can't be known up front. */
export function monthlyAmount(item: { quantity?: number; price?: Record<string, unknown> }): { currency: string; amount: number } | null {
  const price = item.price
  const recurring = price?.recurring as { interval?: string; interval_count?: number; usage_type?: string } | undefined
  const unit = price?.unit_amount
  if (!price || !recurring || recurring.usage_type === 'metered' || typeof unit !== 'number') return null
  const count = recurring.interval_count || 1
  const perMonth = { day: 365.25 / 12, week: 52 / 12, month: 1, year: 1 / 12 }[recurring.interval ?? '']
  if (!perMonth) return null
  return { currency: String(price.currency).toUpperCase(), amount: (unit * (item.quantity ?? 1) * perMonth) / count }
}

/**
 * Monthly recurring revenue per product from active subscriptions, before
 * discounts and tax. One-off payments aren't included.
 */
export async function fetchStripeRevenue(key: string, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<StripeRevenue> {
  const [subscriptions, products] = await Promise.all([
    listAll(key, '/subscriptions', { status: 'active' }, fetchImpl),
    listAll(key, '/products', {}, fetchImpl),
  ])

  const byProduct = new Map<string, ProductRevenue>()
  for (const product of products) {
    const id = String(product.id)
    byProduct.set(id, { id, name: String(product.name || id), active: product.active !== false, monthly: {}, subscriptions: 0 })
  }

  let skippedItems = 0
  for (const subscription of subscriptions) {
    const items = ((subscription.items as { data?: Record<string, unknown>[] })?.data ?? []) as { quantity?: number; price?: Record<string, unknown> }[]
    const counted = new Set<string>()
    for (const item of items) {
      const productId = String(item.price?.product ?? '')
      const amount = monthlyAmount(item)
      if (!productId || !amount) {
        skippedItems += 1
        continue
      }
      const entry = byProduct.get(productId) ?? { id: productId, name: productId, active: true, monthly: {}, subscriptions: 0 }
      entry.monthly[amount.currency] = (entry.monthly[amount.currency] ?? 0) + amount.amount
      if (!counted.has(productId)) entry.subscriptions += 1
      counted.add(productId)
      byProduct.set(productId, entry)
    }
  }

  const round = (monthly: Record<string, number>) => Object.fromEntries(Object.entries(monthly).map(([currency, amount]) => [currency, Math.round(amount)]))
  return {
    mode: key.startsWith('rk_live_') ? 'live' : 'test',
    checkedAt: new Date(now).toISOString(),
    products: [...byProduct.values()]
      .map((product) => ({ ...product, monthly: round(product.monthly) }))
      .sort((a, b) => b.subscriptions - a.subscriptions || a.name.localeCompare(b.name)),
    skippedItems,
  }
}
