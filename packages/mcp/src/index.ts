import { parseArgs } from 'node:util'
import { createMcpServer } from './protocol'
import { fileSource } from './source'
import { createTools } from './tools'

// holdings-mcp: answers questions about your Holdings portfolio over MCP
// (stdio). Read-only. Usage: node holdings-mcp.js --file holdings-export.json
// stdout carries protocol messages only; everything else goes to stderr.

const VERSION = '0.2.0'
const { values } = parseArgs({ options: { file: { type: 'string' }, help: { type: 'boolean' } }, strict: true })
const file = values.file || process.env.HOLDINGS_EXPORT_FILE

if (values.help || !file) {
  console.error(`holdings-mcp ${VERSION}: read-only MCP server for Holdings.

Usage: node holdings-mcp.js --file <export.json>

Export your data from Holdings (Settings → Export JSON) and point --file at it.
The file is read again whenever it changes. Nothing is ever written.`)
  process.exit(values.help ? 0 : 1)
}

const server = createMcpServer({
  name: 'holdings',
  version: VERSION,
  instructions:
    'Holdings is the owner’s register of side projects and what they run on: domains, servers, repos, accounts, subscriptions, keys and cards, with costs and revenue in US dollars. Use portfolio_overview first, then the other tools for detail. Everything here is read-only.',
  tools: createTools(fileSource(file)),
})
server.serve(process.stdin, process.stdout).on('close', () => process.exit(0))
console.error(`holdings-mcp ${VERSION} reading ${file}`)
