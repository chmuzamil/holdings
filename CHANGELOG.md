# Changelog

## Unreleased

### Added
- **Clean-up suggestions** on the Insights page: paid items no project uses, items only archived projects use, several subscriptions with the same provider, and items marked cancelled that still show a renewal, with the possible monthly saving. Items that are for everything can be marked so they stop showing up, and shown again later.
- MCP server: `cleanup_suggestions` tool.
- Settings shows the installed version and build, with links to what is new and the source.

## 0.2.1 (2026-10-29)

Bug fixes, and the first v0.3 feature: domain safety checks.

### Added
- **Domain safety checks**: transfer lock, registration ending, nameservers, SPF, DMARC and DNSSEC, each with what to do next. Shown in a domain's details, with a count on its card. DKIM isn't checked (it needs your mail provider's selector).
- The DNS check now also reads the domain's DMARC record and whether the registry says it is signed with DNSSEC.

### Changed
- Demo repos link to the hosted demo instead of a placeholder GitHub organisation.

### Fixed
- A repo could disappear from its project when an imported GitHub repo and a hand-added record for the same URL were merged. Links now move to the record that is kept, and links from both copies are kept.
- The Import JSON button could not be reached with the keyboard, and its icon sat above the text.

## 0.2.0 (2026-10-24)

The founder's asset register: what each project costs and earns, what breaks if something stops, and an optional self-hosted server.

### Added
- **Project ledger**: monthly cost, revenue and profit per project. Shared servers and subscriptions are split between the projects using them; costs not in any project are shown separately.
- **"What breaks if…"**: pick a server, domain, account or payment card and see the affected projects, subdomains and revenue at risk.
- **Keys & cards and the expiry radar**: API keys, tokens, certificates and cards tracked by name and date (never the secret), and one list of everything that renews or expires.
- **Handover pack** (a passphrase-locked file for someone you trust, opens offline) and **exit pack** (asset register and transfer checklist for selling a project).
- **Self-hosted server** (optional): one Docker container with Node and SQLite. Password login with optional two-step codes, data saved on your server with conflict protection, domain lookups. See docs/self-hosting.md.
- **Stripe revenue** (self-hosted): connect a read-only restricted key and link products to projects; monthly recurring revenue fills in automatically.
- **MCP server** (read-only) for Claude, Cursor and other agents, reading an export or live data with a read-only access token. See docs/mcp.md.
- Saving anything that looks like a real API key, token or card number is refused.
- `@holdings/core`: the data model, cost engine, ledger and impact analysis, shared by the app, server and MCP server.

### Changed
- New look: own colour tokens, typography (IBM Plex Sans, self-hosted) and logo.
- Plain-language copy throughout, and numbers that are only ever real (no made-up scores or trends).
- Keyboard and screen reader support: focus handling in dialogs and menus, skip link, labelled controls.
- Phone layouts and long names no longer overflow cards.
- The public demo has link previews and is code-split for a lighter first load.

### Fixed
- Settings fields had no visible border.


## 0.1.0 (2026-10-07)

First release under the name Holdings (formerly Founder OS).

### Added
- Export and import all data as JSON.
- Fictional demo portfolio, loaded only when you ask for it, and a `build:demo` mode for hosting a public demo.
- Optional second display currency, with its rate fetched daily from ExchangeRate-API.
- Timeline built from real dates only.
- Domain health from real DNS/registry lookups (records, nameservers, MX, SPF).
- Links to pages via the URL hash (for example `#domains`).
- Tests (Vitest) and CI (lint, test, build).

### Changed
- Renamed to Holdings. Browser data saved under the old name is copied over automatically.
- All costs are stored in US dollars. Old PKR costs are converted once at the previous fixed rate.
- The domain lookup API is same-origin by default, validates input, rate-limits and times out.

### Removed
- Supabase login and sync. Data now lives in the browser.
- The plain-text GitHub token column and the `VITE_GITHUB_TOKEN` build-time fallback.
- Made-up timeline events, health history and domain statuses.
- Domain icons loaded from a third-party service (they leaked your domain list).
