import type { FetchLike } from './stripe'

// Read-only import of servers: Hetzner Cloud, DigitalOcean droplets, or any
// other host through a custom JSON URL (your own script or inventory) in the
// format described in docs/self-hosting.md. Holdings only ever reads.

const TIMEOUT_MS = 15_000
const MAX_SERVERS = 500
const MAX_CUSTOM_BYTES = 1_000_000

export type HostId = 'hetzner' | 'digitalocean' | 'custom'
export type Credentials = Record<string, string>

export interface HostServer {
  name: string
  provider: string
  ip: string
  ipv6: string
  cpu: number
  ramGb: number
  storage: string
  location: string
  plan: string
  os: string
  /** As the host reports it, e.g. "running" or "off". */
  status: string
  /** Monthly price in `currency`, or null when unknown. */
  monthlyCost: number | null
  currency: string
  notes: string
}

export interface HostImport {
  host: string
  checkedAt: string
  servers: HostServer[]
  warnings: string[]
}

export class HostError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface Host {
  label: string
  fields: string[]
  check(credentials: Credentials): string
  verify(credentials: Credentials, fetchImpl: FetchLike): Promise<void>
  list(credentials: Credentials, fetchImpl: FetchLike): Promise<HostServer[]>
  hint(credentials: Credentials): string
}

const text = (value: unknown, max = 200) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '')
const number = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places
const tokenEnding = (credentials: Credentials) => `token ending ${(credentials.token ?? '').slice(-4)}`

async function call(label: string, url: string, headers: Record<string, string>, fetchImpl: FetchLike) {
  try {
    return await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new HostError(`Couldn’t reach ${label}. Try again in a minute.`, 502)
  }
}

// --- Hetzner Cloud -------------------------------------------------------

const HETZNER = 'https://api.hetzner.cloud/v1'

async function hetznerPage(token: string, page: number, perPage: number, fetchImpl: FetchLike) {
  const response = await call('Hetzner', `${HETZNER}/servers?page=${page}&per_page=${perPage}`, { Authorization: `Bearer ${token}` }, fetchImpl)
  const body = (await response.json().catch(() => ({}))) as { servers?: any[]; meta?: { pagination?: { next_page?: number | null } }; error?: { message?: string } }
  if (response.status === 401) throw new HostError('Hetzner didn’t accept this token. It may have been deleted or mistyped.', 400)
  if (response.status === 403) throw new HostError('This token can’t read servers. Create it in the project that has your servers.', 400)
  if (!response.ok) throw new HostError(body.error?.message ? `Hetzner says: ${body.error.message}` : `Hetzner answered ${response.status}.`, 502)
  return { servers: Array.isArray(body.servers) ? body.servers : [], next: body.meta?.pagination?.next_page ?? null }
}

function hetznerServer(server: any): HostServer {
  const type = server.server_type ?? {}
  const locationName = server.datacenter?.location?.name
  const price = (Array.isArray(type.prices) ? type.prices : []).find((entry: any) => entry.location === locationName)
  const location = server.datacenter?.location
  return {
    name: text(server.name),
    provider: 'Hetzner',
    ip: text(server.public_net?.ipv4?.ip, 45),
    ipv6: text(server.public_net?.ipv6?.ip, 60),
    cpu: number(type.cores) ?? 0,
    ramGb: number(type.memory) ?? 0,
    storage: number(type.disk) ? `${number(type.disk)} GB` : '',
    location: [location?.city, location?.country].filter(Boolean).join(', '),
    plan: text(type.name, 60).toUpperCase(),
    os: text(server.image?.description ?? server.image?.name),
    status: text(server.status, 30),
    monthlyCost: number(price?.price_monthly?.net) === null ? null : round(number(price.price_monthly.net)!),
    currency: 'EUR',
    notes: 'Hetzner Cloud price before VAT.',
  }
}

const hetznerHost: Host = {
  label: 'Hetzner',
  fields: ['token'],
  check({ token = '' }) {
    return /^[A-Za-z0-9]{40,100}$/.test(token) ? '' : 'Paste a Hetzner Cloud API token (Project → Security → API tokens).'
  },
  async verify({ token = '' }, fetchImpl) {
    await hetznerPage(token, 1, 1, fetchImpl)
  },
  async list({ token = '' }, fetchImpl) {
    const servers: HostServer[] = []
    for (let page: number | null = 1; page && servers.length < MAX_SERVERS;) {
      const result = await hetznerPage(token, page, 50, fetchImpl)
      servers.push(...result.servers.map(hetznerServer))
      page = result.next
    }
    return servers
  },
  hint: tokenEnding,
}

// --- DigitalOcean --------------------------------------------------------

const DIGITALOCEAN = 'https://api.digitalocean.com/v2'

async function dropletPage(token: string, page: number, perPage: number, fetchImpl: FetchLike) {
  const response = await call('DigitalOcean', `${DIGITALOCEAN}/droplets?page=${page}&per_page=${perPage}`, { Authorization: `Bearer ${token}` }, fetchImpl)
  const body = (await response.json().catch(() => ({}))) as { droplets?: any[]; links?: { pages?: { next?: string } }; message?: string }
  if (response.status === 401) throw new HostError('DigitalOcean didn’t accept this token. It may have expired, been deleted or mistyped.', 400)
  if (response.status === 403) throw new HostError('This token can’t read droplets. Give it the droplet:read scope.', 400)
  if (!response.ok) throw new HostError(body.message ? `DigitalOcean says: ${body.message}` : `DigitalOcean answered ${response.status}.`, 502)
  return { droplets: Array.isArray(body.droplets) ? body.droplets : [], hasNext: Boolean(body.links?.pages?.next) }
}

function droplet(server: any): HostServer {
  const v4 = Array.isArray(server.networks?.v4) ? server.networks.v4 : []
  const v6 = Array.isArray(server.networks?.v6) ? server.networks.v6 : []
  const publicIp = (list: any[]) => text(list.find((network) => network.type === 'public')?.ip_address, 60)
  const disk = number(server.disk)
  const memory = number(server.memory)
  return {
    name: text(server.name),
    provider: 'DigitalOcean',
    ip: publicIp(v4),
    ipv6: publicIp(v6),
    cpu: number(server.vcpus) ?? 0,
    ramGb: memory ? round(memory / 1024, 1) : 0,
    storage: disk ? `${disk} GB` : '',
    location: text(server.region?.name),
    plan: text(server.size_slug ?? server.size?.slug, 60),
    os: [text(server.image?.distribution), text(server.image?.name)].filter(Boolean).join(' '),
    status: text(server.status, 30),
    monthlyCost: number(server.size?.price_monthly),
    currency: 'USD',
    notes: '',
  }
}

const digitaloceanHost: Host = {
  label: 'DigitalOcean',
  fields: ['token'],
  check({ token = '' }) {
    return /^[A-Za-z0-9_]{40,100}$/.test(token) ? '' : 'Paste a DigitalOcean API token (API → Tokens → Generate New Token).'
  },
  async verify({ token = '' }, fetchImpl) {
    await dropletPage(token, 1, 1, fetchImpl)
  },
  async list({ token = '' }, fetchImpl) {
    const servers: HostServer[] = []
    for (let page = 1; servers.length < MAX_SERVERS; page += 1) {
      const result = await dropletPage(token, page, 200, fetchImpl)
      servers.push(...result.droplets.map(droplet))
      if (!result.hasNext || !result.droplets.length) break
    }
    return servers
  },
  hint: tokenEnding,
}

// --- Custom JSON URL -----------------------------------------------------

/** Reads the custom format: {"servers": [...]} or a bare array. */
export function parseCustomServers(body: unknown): HostServer[] {
  const list = Array.isArray(body) ? body : (body as { servers?: unknown })?.servers
  if (!Array.isArray(list)) throw new HostError('The URL answered, but not with a list of servers. Expected {"servers": [ … ]}.', 400)
  return list
    .filter((item) => item && typeof item === 'object' && text(item.name))
    .slice(0, MAX_SERVERS)
    .map((item: any): HostServer => ({
      name: text(item.name),
      provider: text(item.provider, 80),
      ip: text(item.ip ?? item.ipAddress, 45),
      ipv6: text(item.ipv6, 60),
      cpu: number(item.cpu) ?? 0,
      ramGb: number(item.ramGb) ?? 0,
      storage: text(item.storage, 80),
      location: text(item.location),
      plan: text(item.plan, 80),
      os: text(item.os),
      status: text(item.status, 30),
      monthlyCost: number(item.monthlyCost),
      currency: /^[A-Z]{3}$/.test(text(item.currency).toUpperCase()) ? text(item.currency).toUpperCase() : 'USD',
      notes: text(item.notes, 500),
    }))
}

async function fetchCustom({ url = '', token = '' }: Credentials, fetchImpl: FetchLike) {
  const response = await call('that URL', url, token ? { Authorization: `Bearer ${token}` } : {}, fetchImpl)
  if (response.status === 401 || response.status === 403) throw new HostError(`The URL answered ${response.status}: check the token.`, 400)
  if (!response.ok) throw new HostError(`The URL answered ${response.status}.`, 400)
  const raw = await response.text()
  if (raw.length > MAX_CUSTOM_BYTES) throw new HostError('The answer is larger than 1 MB.', 400)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new HostError('The URL didn’t answer with JSON.', 400)
  }
  return parseCustomServers(body)
}

const customHost: Host = {
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
  async verify(credentials, fetchImpl) {
    await fetchCustom(credentials, fetchImpl)
  },
  list: fetchCustom,
  hint({ url = '' }) {
    return `URL on ${new URL(url).host}`
  },
}

export const HOSTS: Record<HostId, Host> = {
  hetzner: hetznerHost,
  digitalocean: digitaloceanHost,
  custom: customHost,
}

export function isHost(value: unknown): value is HostId {
  return typeof value === 'string' && Object.hasOwn(HOSTS, value)
}

/** Keeps only the fields this host uses, trimmed. */
export function cleanHostCredentials(id: HostId, input: unknown): Credentials {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return Object.fromEntries(HOSTS[id].fields.map((field) => [field, typeof source[field] === 'string' ? (source[field] as string).trim() : '']))
}

/** Reads every server. */
export async function fetchHost(id: HostId, credentials: Credentials, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<HostImport> {
  const host = HOSTS[id]
  const servers = (await host.list(credentials, fetchImpl)).slice(0, MAX_SERVERS)
  const warnings = servers.length >= MAX_SERVERS ? [`Only the first ${MAX_SERVERS} servers were read.`] : []
  return { host: host.label, checkedAt: new Date(now).toISOString(), servers, warnings }
}
