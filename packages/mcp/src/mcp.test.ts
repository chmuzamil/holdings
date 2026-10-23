import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMcpServer, PROTOCOL_VERSIONS } from './protocol'
import { fileSource, parseHoldings } from './source'
import { createTools } from './tools'

// A tiny portfolio in the app's export format (all made up).
const EXPORT = {
  format: 'holdings-export',
  version: 1,
  exportedAt: '2026-10-24T08:00:00.000Z',
  records: {
    domains: [
      {
        id: 'd_shop', name: 'shop.example', provider: 'Porkbun', cost: 12, renewalDate: '2026-11-01', status: 'Active',
        connectedServerIds: ['s_main'], subdomains: [{ id: 'sd1', name: 'staging', serverId: 's_main' }],
      },
      { id: 'd_old', name: 'old.example', provider: 'Namecheap', cost: 10, renewalDate: '2026-10-20', status: 'Active' },
    ],
    servers: [{ id: 's_main', name: 'Main VPS', provider: 'Hetzner', cost: 10, renewalDate: '2027-01-01', status: 'Active' }],
    repos: [],
    accounts: [],
    subscriptions: [
      { id: 'sub_mail', name: 'Postmark', provider: 'Postmark', cost: 15, renewalDate: '2026-11-10', status: 'Active' },
      { id: 'sub_eur', name: 'Euro tool', provider: 'Acme', cost: 9, currency: 'EUR', status: 'Active' },
    ],
    keys: [{ id: 'k_card', name: 'Visa ending 4242', keyType: 'Payment card', provider: 'Bank', expiryDate: '2026-12-31', status: 'Active' }],
    projects: [
      {
        id: 'p_shop', name: 'Shopfront', status: 'Production', monthlyRevenueUsd: 420, description: 'The main earner.',
        domainIds: ['d_shop'], serverIds: ['s_main'], subscriptionIds: ['sub_mail'],
      },
      { id: 'p_side', name: 'Sidequest', status: 'Beta', monthlyRevenueUsd: null, serverIds: ['s_main'] },
    ],
  },
}

const NOW = new Date(2026, 9, 24, 12)
let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'holdings-mcp-'))
  file = join(dir, 'export.json')
  writeFileSync(file, JSON.stringify(EXPORT))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function server() {
  return createMcpServer({ name: 'holdings', version: 'test', instructions: 'Test.', tools: createTools(fileSource(file), { now: () => NOW }) })
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await server().handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  const result = (response as { result: { content: { text: string }[]; structuredContent?: Record<string, any>; isError?: boolean } }).result
  return { ...result, data: result.structuredContent ?? {}, text: result.content[0]?.text ?? '' }
}

describe('protocol', () => {
  it('agrees a protocol version and lists read-only tools', async () => {
    const mcp = server()
    const init = (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })) as any
    expect(init.result.protocolVersion).toBe('2025-06-18')
    expect(init.result.capabilities).toEqual({ tools: { listChanged: false } })
    const unknown = (await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })) as any
    expect(unknown.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])

    const list = (await mcp.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })) as any
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'portfolio_overview', 'list_projects', 'get_project', 'list_items', 'upcoming_renewals', 'what_breaks_if',
    ])
    expect(list.result.tools.every((tool: any) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint)).toBe(true)
  })

  it('ignores notifications and reports unknown methods and tools', async () => {
    const mcp = server()
    expect(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(((await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' })) as any).error.code).toBe(-32601)
    expect(((await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delete_everything' } })) as any).error.code).toBe(-32602)
    expect(((await mcp.handle({ id: 3, method: 'ping' })) as any).error.code).toBe(-32600)
    expect(((await mcp.handle({ jsonrpc: '2.0', id: 4, method: 'ping' })) as any).result).toEqual({})
  })

  it('speaks newline-delimited JSON over streams', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    server().serve(input, output)
    const lines: string[] = []
    output.on('data', (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean)))
    input.write('{"jsonrpc":"2.0","id":7,"method":"ping"}\n')
    input.write('not json\n')
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    await new Promise((resolve) => setTimeout(resolve, 50))
    // Responses may arrive in any order; JSON-RPC matches them by id.
    const responses = lines.map((line) => JSON.parse(line))
    expect(responses).toHaveLength(2)
    expect(responses).toContainEqual({ jsonrpc: '2.0', id: 7, result: {} })
    expect(responses).toContainEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  })
})

describe('tools', () => {
  it('portfolio_overview matches the app’s numbers', async () => {
    const { data } = await callTool('portfolio_overview')
    // Domains are yearly: 12/12 + 10/12; server 10; Postmark 15; the EUR cost is left out like in the app.
    expect(data.monthlyUsd).toEqual({ cost: 26.83, revenue: 420, profit: 393.17, notInAnyProject: 0.83 })
    expect(data.items).toEqual({ total: 6, byKind: { domain: 2, server: 1, subscription: 2, card: 1 } })
    expect(data.projectsTrackingRevenue).toBe(1)
    expect(data.nextRenewals[0]).toMatchObject({ name: 'old.example', overdue: true, daysLeft: -4 })
  })

  it('list_projects splits shared costs and keeps unknown revenue as null', async () => {
    const { data } = await callTool('list_projects')
    expect(data.projects).toEqual([
      expect.objectContaining({ name: 'Shopfront', status: 'production', monthlyCostUsd: 21, monthlyRevenueUsd: 420, monthlyProfitUsd: 399 }),
      expect.objectContaining({ name: 'Sidequest', status: 'beta', monthlyCostUsd: 5, monthlyRevenueUsd: null, monthlyProfitUsd: null }),
    ])
    expect((await callTool('list_projects', { status: 'beta' })).data.projects).toHaveLength(1)
  })

  it('get_project finds a project by partial name and explains its costs', async () => {
    const { data } = await callTool('get_project', { project: 'shop' })
    expect(data.name).toBe('Shopfront')
    expect(data.costLines).toContainEqual({ name: 'Main VPS', kind: 'server', monthlyUsd: 5, sharePct: 50, sharedByProjects: 2 })
    expect(data.dependencies).toContain('shop.example points to Main VPS')
    expect(data.dependencies).toContain('staging.shop.example points to Main VPS')
  })

  it('says what it could have meant when a name doesn’t match', async () => {
    const result = await callTool('get_project', { project: 'nope' })
    expect(result.isError).toBe(true)
    expect(result.text).toBe('No project called "nope". Known projects: Shopfront, Sidequest.')
  })

  it('list_items filters by kind and text', async () => {
    expect((await callTool('list_items', { kind: 'domain' })).data.total).toBe(2)
    expect((await callTool('list_items', { query: 'hetzner' })).data.items[0]).toMatchObject({ name: 'Main VPS', projects: ['Shopfront', 'Sidequest'] })
    expect((await callTool('list_items', { kind: 'spaceship' })).isError).toBe(true)
  })

  it('upcoming_renewals looks ahead and includes overdue items', async () => {
    const { data } = await callTool('upcoming_renewals', { days: 30 })
    expect(data.items.map((item: { name: string }) => item.name)).toEqual(['old.example', 'shop.example', 'Postmark'])
    const later = await callTool('upcoming_renewals', { days: 90 })
    expect(later.data.items.at(-1)).toMatchObject({ name: 'Main VPS', renewsOn: '2027-01-01' })
    expect(later.data.items).toContainEqual(expect.objectContaining({ name: 'Visa ending 4242', expiresOn: '2026-12-31' }))
    expect((await callTool('upcoming_renewals', { days: 9999 })).isError).toBe(true)
  })

  it('what_breaks_if follows dependencies to projects and revenue', async () => {
    const { data } = await callTool('what_breaks_if', { item: 'main vps' })
    expect(data.affectedProjects.map((project: { name: string }) => project.name).sort()).toEqual(['Shopfront', 'Sidequest'])
    expect(data.monthlyRevenueAtRiskUsd).toBe(420)
    expect(data.projectsWithUnknownRevenue).toBe(1)
    expect(data.affectedItems).toContainEqual({ name: 'shop.example', kind: 'domain', because: 'shop.example points to Main VPS' })
  })
})

describe('the export file', () => {
  it('is read again when it changes', async () => {
    const load = fileSource(file)
    expect((await load()).projects).toHaveLength(2)
    const changed = { ...EXPORT, records: { ...EXPORT.records, projects: [EXPORT.records.projects[0]] } }
    writeFileSync(file, JSON.stringify(changed))
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    expect((await load()).projects).toHaveLength(1)
  })

  it('explains a missing or wrong file', async () => {
    const result = await createMcpServer({ name: 'h', version: 't', instructions: '', tools: createTools(fileSource(join(dir, 'missing.json'))) })
      .handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'portfolio_overview' } }) as any
    expect(result.result.isError).toBe(true)
    expect(result.result.content[0].text).toMatch(/Can't find .*Export JSON/)
    expect(() => parseHoldings('{"hello":1}')).toThrow(/No Holdings records/)
    expect(() => parseHoldings('nope')).toThrow(/not valid JSON/)
  })
})
