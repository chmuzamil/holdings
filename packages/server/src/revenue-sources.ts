import type { FetchLike, ProductRevenue } from './stripe'

// Monthly recurring revenue from Lemon Squeezy, Paddle (Billing), or a
// custom JSON URL (your own script, e.g. for App Store or Google Play
// numbers). Same shape as Stripe revenue, so projects can link products from
// any source. Product ids are prefixed with the source ("paddle:pro_…") so
// they never collide with Stripe's. Holdings only ever reads.

const TIMEOUT_MS = 15_000
const MAX_PAGES = 50
const MAX_CUSTOM_BYTES = 1_000_000

export type RevenueSourceId = 'lemonsqueezy' | 'paddle' | 'custom'
export type Credentials = Record<string, string>

export interface SourceRevenue {
  source: RevenueSourceId
  label: string
  mode: 'live' | 'test'
  checkedAt: string
  products: (ProductRevenue & { source: string })[]
  /** Subscriptions that couldn't be priced (usage-based or tiered). */
  skippedItems: number
  warnings: string[]
}

export class RevenueError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface Source {
  label: string
  fields: string[]
  check(credentials: Credentials): string
  hint(credentials: Credentials): string
  fetch(credentials: Credentials, fetchImpl: FetchLike): Promise<Omit<SourceRevenue, 'source' | 'label' | 'checkedAt'>>
}

// Currencies counted in whole units rather than cents.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const PER_MONTH: Record<string, number> = { day: 365.25 / 12, week: 52 / 12, month: 1, year: 1 / 12 }
const keyEnding = (credentials: Credentials) => `key ending ${(credentials.apiKey ?? '').slice(-4)}`

async function call(label: string, url: string, headers: Record<string, string>, fetchImpl: FetchLike) {
  try {
    return await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new RevenueError(`Couldn’t reach ${label}. Try again in a minute.`, 502)
  }
}

function addMonthly(products: Map<string, ProductRevenue & { source: string }>, source: string, id: string, name: string, currency: string, amount: number, counted: boolean) {
  const entry = products.get(id) ?? { id, name, source, active: true, monthly: {}, subscriptions: 0 }
  entry.monthly[currency] = (entry.monthly[currency] ?? 0) + amount
  if (counted) entry.subscriptions += 1
  products.set(id, entry)
}

function finish(products: Map<string, ProductRevenue & { source: string }>) {
  return [...products.values()]
    .map((product) => ({ ...product, monthly: Object.fromEntries(Object.entries(product.monthly).map(([currency, amount]) => [currency, Math.round(amount)])) }))
    .sort((a, b) => b.subscriptions - a.subscriptions || a.name.localeCompare(b.name))
}

// --- Lemon Squeezy (JSON:API) ---------------------------------------------

const LEMON = 'https://api.lemonsqueezy.com/v1'

async function lemon(apiKey: string, path: string, fetchImpl: FetchLike) {
  const response = await call('Lemon Squeezy', `${LEMON}${path}`, { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}` }, fetchImpl)
  const body = (await response.json().catch(() => ({}))) as { data?: any; meta?: { page?: { lastPage?: number } }; errors?: { detail?: string }[] }
  if (response.status === 401) throw new RevenueError('Lemon Squeezy didn’t accept this API key. It may have expired or been deleted.', 400)
  if (!response.ok) throw new RevenueError(body.errors?.[0]?.detail ? `Lemon Squeezy says: ${body.errors[0].detail}` : `Lemon Squeezy answered ${response.status}.`, 502)
  return body
}

async function lemonAll(apiKey: string, path: string, fetchImpl: FetchLike) {
  const items: any[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const join = path.includes('?') ? '&' : '?'
    const body = await lemon(apiKey, `${path}${join}page[number]=${page}&page[size]=100`, fetchImpl)
    items.push(...(Array.isArray(body.data) ? body.data : []))
    if (page >= (body.meta?.page?.lastPage ?? 1)) break
  }
  return items
}

const lemonSqueezy: Source = {
  label: 'Lemon Squeezy',
  fields: ['apiKey'],
  check({ apiKey = '' }) {
    return /^[A-Za-z0-9._-]{40,2000}$/.test(apiKey) ? '' : 'Paste a Lemon Squeezy API key (Settings → API).'
  },
  hint: keyEnding,
  async fetch({ apiKey = '' }, fetchImpl) {
    const [stores, productList, subscriptions] = await Promise.all([
      lemonAll(apiKey, '/stores', fetchImpl),
      lemonAll(apiKey, '/products', fetchImpl),
      lemonAll(apiKey, '/subscriptions?filter[status]=active', fetchImpl),
    ])
    const currencyByStore = new Map(stores.map((store) => [String(store.id), String(store.attributes?.currency ?? 'USD').toUpperCase()]))
    const products = new Map<string, ProductRevenue & { source: string }>()
    for (const product of productList) {
      const id = `lemonsqueezy:${product.id}`
      products.set(id, { id, name: String(product.attributes?.name ?? product.id), source: 'Lemon Squeezy', active: product.attributes?.status !== 'draft', monthly: {}, subscriptions: 0 })
    }

    // Prices hold the amount and interval; read each one used once.
    const prices = new Map<string, any>()
    for (const priceId of new Set(subscriptions.map((sub) => String(sub.attributes?.first_subscription_item?.price_id ?? '')).filter(Boolean))) {
      prices.set(priceId, (await lemon(apiKey, `/prices/${encodeURIComponent(priceId)}`, fetchImpl)).data?.attributes)
    }

    let skippedItems = 0
    let test = false
    for (const subscription of subscriptions) {
      const attributes = subscription.attributes ?? {}
      if (attributes.test_mode) test = true
      const item = attributes.first_subscription_item ?? {}
      const price = prices.get(String(item.price_id ?? ''))
      const perMonth = PER_MONTH[price?.renewal_interval_unit ?? '']
      if (!price || typeof price.unit_price !== 'number' || price.scheme !== 'standard' || !perMonth) {
        skippedItems += 1
        continue
      }
      const amount = (price.unit_price * (item.quantity ?? 1) * perMonth) / (price.renewal_interval_quantity || 1)
      const id = `lemonsqueezy:${attributes.product_id}`
      addMonthly(products, 'Lemon Squeezy', id, String(attributes.product_name ?? id), currencyByStore.get(String(attributes.store_id)) ?? 'USD', amount, true)
    }
    return { mode: test ? 'test' : 'live', products: finish(products), skippedItems, warnings: [] }
  },
}

// --- Paddle Billing ------------------------------------------------------

async function paddleAll(apiKey: string, path: string, fetchImpl: FetchLike, optional = false) {
  const base = apiKey.startsWith('pdl_sdbx_') ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
  const items: any[] = []
  let url: string | null = `${base}${path}${path.includes('?') ? '&' : '?'}per_page=200`
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await call('Paddle', url, { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }, fetchImpl)
    const body = (await response.json().catch(() => ({}))) as { data?: any[]; meta?: { pagination?: { next?: string; has_more?: boolean } }; error?: { detail?: string } }
    if (response.status === 401) throw new RevenueError('Paddle didn’t accept this API key. It may have been revoked or mistyped.', 400)
    if (response.status === 403) {
      if (optional) return null
      throw new RevenueError('This API key can’t read subscriptions. Give it the subscription.read permission in Paddle.', 400)
    }
    if (!response.ok) throw new RevenueError(body.error?.detail ? `Paddle says: ${body.error.detail}` : `Paddle answered ${response.status}.`, 502)
    items.push(...(Array.isArray(body.data) ? body.data : []))
    // Only follow Paddle's own next link.
    const next = body.meta?.pagination?.has_more ? body.meta.pagination.next : null
    url = next && next.startsWith(base) ? next : null
  }
  return items
}

const paddle: Source = {
  label: 'Paddle',
  fields: ['apiKey'],
  check({ apiKey = '' }) {
    return /^[A-Za-z0-9_]{30,200}$/.test(apiKey) ? '' : 'Paste a Paddle Billing API key (Developer tools → Authentication).'
  },
  hint: keyEnding,
  async fetch({ apiKey = '' }, fetchImpl) {
    const [subscriptions, productList] = await Promise.all([
      paddleAll(apiKey, '/subscriptions?status=active', fetchImpl),
      paddleAll(apiKey, '/products?status=active', fetchImpl, true),
    ])
    const products = new Map<string, ProductRevenue & { source: string }>()
    for (const product of productList ?? []) {
      const id = `paddle:${product.id}`
      products.set(id, { id, name: String(product.name ?? product.id), source: 'Paddle', active: true, monthly: {}, subscriptions: 0 })
    }
    let skippedItems = 0
    for (const subscription of subscriptions ?? []) {
      const counted = new Set<string>()
      for (const item of Array.isArray(subscription.items) ? subscription.items : []) {
        if (item.recurring === false || item.status === 'inactive') continue
        const price = item.price ?? {}
        const amount = Number(price.unit_price?.amount)
        const perMonth = PER_MONTH[price.billing_cycle?.interval ?? '']
        if (!price.product_id || !Number.isFinite(amount) || !perMonth) {
          skippedItems += 1
          continue
        }
        const id = `paddle:${price.product_id}`
        const currency = String(price.unit_price?.currency_code ?? subscription.currency_code ?? 'USD').toUpperCase()
        addMonthly(products, 'Paddle', id, String(item.product?.name ?? products.get(id)?.name ?? price.product_id), currency, (amount * (item.quantity ?? 1) * perMonth) / (price.billing_cycle.frequency || 1), !counted.has(id))
        counted.add(id)
      }
    }
    const warnings = productList === null ? ['Products without subscribers need the product.read permission on the key to show up.'] : []
    return { mode: apiKey.startsWith('pdl_sdbx_') ? 'test' : 'live', products: finish(products), skippedItems, warnings }
  },
}

// --- Custom JSON URL -----------------------------------------------------

/** Reads the custom format: {"products": [{"id", "name", "monthlyRevenue", "currency", "subscriptions"}]}. */
export function parseCustomRevenue(body: unknown) {
  const list = Array.isArray(body) ? body : (body as { products?: unknown })?.products
  if (!Array.isArray(list)) throw new RevenueError('The URL answered, but not with a list of products. Expected {"products": [ … ]}.', 400)
  const products = new Map<string, ProductRevenue & { source: string }>()
  for (const item of list.slice(0, 500)) {
    const rawId = typeof item?.id === 'string' || typeof item?.id === 'number' ? String(item.id).trim().slice(0, 100) : ''
    const revenue = typeof item?.monthlyRevenue === 'string' ? Number.parseFloat(item.monthlyRevenue) : item?.monthlyRevenue
    if (!rawId || typeof revenue !== 'number' || !Number.isFinite(revenue) || revenue < 0) continue
    const currency = typeof item.currency === 'string' && /^[A-Za-z]{3}$/.test(item.currency) ? item.currency.toUpperCase() : 'USD'
    const id = `custom:${rawId}`
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 200) : rawId
    // Stored like Stripe: in cents (whole units for zero-decimal currencies).
    addMonthly(products, 'Custom', id, name, currency, ZERO_DECIMAL.has(currency) ? revenue : revenue * 100, false)
    const subscriptions = Number(item.subscriptions)
    if (Number.isInteger(subscriptions) && subscriptions > 0) products.get(id)!.subscriptions += subscriptions
  }
  return finish(products)
}

const custom: Source = {
  label: 'Custom URL',
  fields: ['url', 'token'],
  check({ url = '', token = '' }) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return 'Enter the full URL, starting with https://.'
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'The URL must start with https:// or http://.'
    if (parsed.username || parsed.password) return 'Put the password in the token field, not in the URL.'
    if (token && !/^[\x21-\x7e]{8,500}$/.test(token)) return 'The token can’t contain spaces.'
    return ''
  },
  hint({ url = '' }) {
    return `URL on ${new URL(url).host}`
  },
  async fetch({ url = '', token = '' }, fetchImpl) {
    const response = await call('that URL', url, { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, fetchImpl)
    if (response.status === 401 || response.status === 403) throw new RevenueError(`The URL answered ${response.status}: check the token.`, 400)
    if (!response.ok) throw new RevenueError(`The URL answered ${response.status}.`, 400)
    const raw = await response.text()
    if (raw.length > MAX_CUSTOM_BYTES) throw new RevenueError('The answer is larger than 1 MB.', 400)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      throw new RevenueError('The URL didn’t answer with JSON.', 400)
    }
    return { mode: 'live', products: parseCustomRevenue(body), skippedItems: 0, warnings: [] }
  },
}

export const REVENUE_SOURCES: Record<RevenueSourceId, Source> = { lemonsqueezy: lemonSqueezy, paddle, custom }

export function isRevenueSource(value: unknown): value is RevenueSourceId {
  return typeof value === 'string' && Object.hasOwn(REVENUE_SOURCES, value)
}

export function cleanRevenueCredentials(id: RevenueSourceId, input: unknown): Credentials {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return Object.fromEntries(REVENUE_SOURCES[id].fields.map((field) => [field, typeof source[field] === 'string' ? (source[field] as string).trim() : '']))
}

/** Monthly recurring revenue per product from one source, before discounts and tax. */
export async function fetchSourceRevenue(id: RevenueSourceId, credentials: Credentials, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<SourceRevenue> {
  const source = REVENUE_SOURCES[id]
  const result = await source.fetch(credentials, fetchImpl)
  return { source: id, label: source.label, checkedAt: new Date(now).toISOString(), ...result }
}
