# Ask an AI agent about your portfolio (MCP)

Holdings includes a small [MCP](https://modelcontextprotocol.io) server, so Claude, Cursor and other agents can answer questions like:

- "What renews in the next two weeks, and which projects does it affect?"
- "Which project makes the least money for what it costs?"
- "What breaks if my Hetzner server goes down?"
- "What am I paying for that I could cancel?"
- "Which domains are paid with the card that expires in December?"

It is **read-only**: it has no tools that change anything, and it never writes to your files. It runs on your machine and only reads the file you point it at. Nothing is sent anywhere except to the agent you connect it to.

## Set it up

1. Build it (once, and again after updating):

   ```bash
   npm ci
   npm run build:mcp
   ```

   This creates `packages/mcp/dist/holdings-mcp.js`, a single file with no dependencies. It needs Node.js 22 or newer.

2. In Holdings, open **Settings → Export JSON** and save the file somewhere permanent, for example `~/holdings/holdings-export.json`. Export again whenever you want the agent to see newer data; the server notices the change.

3. Add it to your agent. Use full paths.

   **Claude Code**

   ```bash
   claude mcp add holdings -- node /path/to/holdings/packages/mcp/dist/holdings-mcp.js --file /path/to/holdings-export.json
   ```

   **Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`) and most other clients:

   ```json
   {
     "mcpServers": {
       "holdings": {
         "command": "node",
         "args": ["/path/to/holdings/packages/mcp/dist/holdings-mcp.js", "--file", "/path/to/holdings-export.json"]
       }
     }
   }
   ```

## Tools

| Tool | What it answers |
|---|---|
| `portfolio_overview` | Monthly cost, revenue and profit, cost not in any project, item counts, the next renewals. |
| `list_projects` | Each project's monthly cost (shared items split), revenue, profit and margin. |
| `get_project` | One project in detail: cost lines, every item it uses, how they depend on each other. |
| `list_items` | Domains, servers, repos, accounts, subscriptions, keys, certificates and cards, filtered by kind or text. |
| `upcoming_renewals` | What renews or expires in the next N days, including anything overdue. |
| `cleanup_suggestions` | Paid items you may not need (no project uses them, only archived projects do, duplicates), with the possible saving. |
| `what_breaks_if` | What stops if one item stops, which projects are affected and the revenue at risk. |

All amounts are in US dollars, the same numbers the app shows. Holdings stores metadata only (names, providers, dates, costs), never passwords, keys or card numbers, so there are none to leak.

## With the self-hosted server

If you run the [self-hosted server](self-hosting.md), the MCP server can read your live data instead of an export:

1. In Holdings, open **Settings → Access tokens for AI agents**, name a token (for example "Claude on my laptop") and create it. Copy it: it is shown only once.
2. Add the MCP server with `--url` and the token in the `HOLDINGS_TOKEN` environment variable:

   ```bash
   claude mcp add holdings -e HOLDINGS_TOKEN=hld_… -- node /path/to/holdings/packages/mcp/dist/holdings-mcp.js --url https://holdings.example.com
   ```

   ```json
   {
     "mcpServers": {
       "holdings": {
         "command": "node",
         "args": ["/path/to/holdings/packages/mcp/dist/holdings-mcp.js", "--url", "https://holdings.example.com"],
         "env": { "HOLDINGS_TOKEN": "hld_…" }
       }
     }
   }
   ```

A token can only read your data: it can't save changes, see or change your login, or touch Stripe. Settings shows when each token was last used, and deleting one cuts access straight away. The token is only ever sent over HTTPS (or to `localhost`), and only its hash is stored on the server. It goes in an environment variable rather than on the command line, because other programs on your computer can see command lines.
