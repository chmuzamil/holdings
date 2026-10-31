import { parseArgs } from 'node:util'
import { createMcpServer } from './protocol'
import { checkServerUrl, fileSource, serverSource } from './source'
import { createTools } from './tools'

// holdings-mcp: answers questions about your Holdings portfolio over MCP
// (stdio). Read-only. Usage: node holdings-mcp.js --file holdings-export.json
// stdout carries protocol messages only; everything else goes to stderr.

const VERSION = '0.4.0'
const { values } = parseArgs({ options: { file: { type: 'string' }, url: { type: 'string' }, help: { type: 'boolean' } }, strict: true })
const file = values.file || process.env.HOLDINGS_EXPORT_FILE
const url = values.url || process.env.HOLDINGS_URL
// The token comes from the environment only: command lines are visible to other programs.
const token = process.env.HOLDINGS_TOKEN

function exit(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}

if (values.help || (!file && !url)) {
  exit(`holdings-mcp ${VERSION}: read-only MCP server for Holdings.

Usage:
  node holdings-mcp.js --file <export.json>
  HOLDINGS_TOKEN=hld_… node holdings-mcp.js --url https://holdings.example.com

--file  reads an export (Settings → Export JSON), again whenever it changes.
--url   reads live data from your self-hosted server with an access token
        (Settings → Access tokens), passed in HOLDINGS_TOKEN.
Nothing is ever written.`, values.help ? 0 : 1)
}
if (file && url) exit('Use either --file or --url, not both.')
if (url && !token) exit('Set HOLDINGS_TOKEN to an access token from Settings → Access tokens.')
if (url && checkServerUrl(url)) exit(checkServerUrl(url))

const server = createMcpServer({
  name: 'holdings',
  version: VERSION,
  instructions:
    'Holdings is the owner’s register of side projects and what they run on: domains, servers, repos, accounts, subscriptions, keys and cards, with costs and revenue in US dollars. Use portfolio_overview first, then the other tools for detail. Everything here is read-only.',
  tools: createTools(url ? serverSource(url, token as string) : fileSource(file as string)),
})
server.serve(process.stdin, process.stdout).on('close', () => process.exit(0))
console.error(`holdings-mcp ${VERSION} reading ${url ?? file}`)
