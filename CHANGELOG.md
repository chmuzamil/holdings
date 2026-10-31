# Changelog

## Unreleased

### Added
- **Published Docker image**: `ghcr.io/chmuzamil/holdings`, for amd64 and arm64, for every release. `docker-compose.yml` uses it, so self-hosting no longer needs a clone and a build; building from source still works.
- **Auto-renew on domains**: On, Off or Not sure, in the domain form and details. The Cloudflare and registrar imports fill it in (the registrar's answer wins, shown as a change before it is applied) instead of writing it into the notes. A domain with auto-renew off that expires within 60 days appears on the Attention page (urgent within 30 days) instead of a plain renewal reminder. In the AI agent connection it is part of the domain's details.

### Fixed
- The Attention page showed "DNS not checked yet" as "dNS not checked yet".

## 0.4.0 (2026-10-31)

Less typing: bring in what you already have from Cloudflare, your registrar, your server host and your payment provider, read-only and only after you have seen every change.

### Changed
- Projects link revenue products in one list (`revenueProductIds`) for every source. Links saved as `stripeProductIds` are moved over when the data loads, so older exports keep their revenue.

### Added
- **More revenue sources** (self-hosted, optional): Lemon Squeezy, Paddle Billing (subscription.read key) and a custom JSON URL, next to Stripe. A project can link products from any of them, and its monthly revenue adds them up, in USD. The custom URL is the way in for App Store, Google Play, RevenueCat or anything else; docs/self-hosting.md has the format and how to build it. A project's revenue only updates once every source it uses has answered.
- **Import from Cloudflare** (self-hosted, optional): connect a read-only API token in Settings and your zones come in as domains, with subdomains from your DNS records (linked to your servers by IP) and, for domains registered at Cloudflare, the expiry date and whether auto-renew is on. Every zone is shown first as will add, will update or up to date; only empty fields are filled, and nothing is added until you confirm. The Global API Key is refused, and the token is stored encrypted on your server.
- **Import from your registrar** (self-hosted, optional): connect Porkbun (read-only key), Spaceship (domains:read key) or Namecheap in Settings and import your domains with their expiry dates. An expiry date in Holdings that differs from the registrar's is offered as a change (old → new); everything else is only filled in when empty. Auto-renew off and transfer lock off are pointed out. Nothing changes until you confirm, and keys are stored encrypted on your server.
- **Import servers** (self-hosted, optional): connect Hetzner Cloud (Read token), DigitalOcean (droplet:read token) or a custom JSON URL for any other host, and import servers with specs, IP, location and monthly price. Servers you already track are matched by IP or name; only empty details are filled in, and a different price is pointed out but your cost is kept. Euro and other prices are converted to USD with the daily rate. The custom URL format is in docs/self-hosting.md.

## 0.3.0 (2026-10-29)

Holdings watches for you: it tells you what needs doing, what changed and what you could stop paying for, and can hand over if you can't.

### Added
- **Uptime status** (self-hosted, optional): connect your Uptime Kuma status page or Gatus in Settings. Monitors named like a server, domain or project are linked for you; link the rest by hand. Linked items show Up, Down, Checking or In maintenance, refreshed every minute, and down items appear on the Attention page.
- **Runbooks**: an optional "If I'm unavailable, do this" field in Markdown for each project and one for everything (on the Handover page), with a warning not to put secrets there; the secret detector enforces it. Runbooks go into the handover pack (rendered safely: no raw HTML, no scripts, links only http, https and mailto) and the exit pack. The handover file's encryption is unchanged and it still opens offline. The JSON export now includes the handover settings (name, recipient, note and global runbook), and importing restores them.
- **CSV import** (Settings) for domains, subscriptions and servers: works out the delimiter, matches columns (remembered for the session), shows every row as will add, already here or problem (with the reason), and adds nothing until you confirm. Duplicates: domain name for domains; name, cost and renewal date for subscriptions; name and IP for servers. Templates to download. Parsed in the browser; handles quoted cells, line breaks inside quotes, BOM and CRLF. Rows with anything that looks like a key, token or card number are left out.
- **Domain change watch**: each DNS/registry check is compared with the last one, and changes to nameservers, registry status, expiry, DNSSEC and the transfer lock are kept (last 20 per domain) and shown in the domain's details. Nameserver changes, status changes, a removed transfer lock and an earlier expiry are marked important and appear on the Attention page for two weeks. Self-hosted: optional scheduled checks (every 6 hours to once a week) that send new changes once to the notification channels you turned on.
- **Project stages**: idea, building, launched, maintenance, paused, archived. Older projects get a stage from their status (Archived stays archived). The Projects page shows a stage badge and filters by stage, and the stage and when it changed are saved.
- **Last worked on**: taken from the newest push to a linked GitHub repo, or a date you set (in the project form, or "Worked on it today" in its details).
- **Stale project** clean-up suggestion: not archived, no activity for 90 days (change it in Settings), still costing money, with the monthly saving. Stage and last activity also appear in the exit pack, handover pack and MCP output.
- **Calendar (.ics)**: on the Expiry page, download renewals and expiries (all, or one project's) with an optional reminder N days before (7 by default), or add a single item with "Add to calendar". Events are all-day and keep the same ID, so importing again updates them. Self-hosted: a private subscription link in Settings, with its own token that opens the calendar and nothing else, and can be replaced or turned off.
- **Clean-up suggestions** on the Insights page: paid items no project uses, items only archived projects use, several subscriptions with the same provider, and items marked cancelled that still show a renewal, with the possible monthly saving. Items that are for everything can be marked so they stop showing up, and shown again later.
- MCP server: `cleanup_suggestions` tool.
- **Notifications** (self-hosted, all optional): email through your own SMTP, a webhook (Slack, Discord or JSON) and ntfy. Each has its own switch in Settings, and its fields appear when you turn it on. A daily check sends reminders when something reaches 30, 7 or 1 day before renewing or expiring, or is overdue, each once.
- **Dead-man's switch** (self-hosted, optional): if you stop checking in, the person you trust gets your locked handover file by email. Signing in or saving counts as a check-in; reminders come with a one-click check-in link. The file is locked in your browser and the server never has the passphrase.
- Settings shows the installed version and build, with links to what is new and the source.

## 0.2.1 (2026-10-29)

Bug fixes, and the first v0.3 feature: domain safety checks.

### Added
- **Domain safety checks**: transfer lock, registration ending, nameservers, SPF, DMARC and DNSSEC, each with what to do next. Shown in a domain's details, with a count on its card. DKIM isn't checked (it needs your mail provider's selector).
- The DNS check now also reads the domain's DMARC record and whether the registry says it is signed with DNSSEC.

### Changed
- The project form and Projects page use the stage instead of the older status. The status is still saved and kept in step, so older exports and tools read it as before.
- Demo repos link to the hosted demo instead of a placeholder GitHub organisation.

### Fixed
- JSON import now refuses a file that contains anything looking like a real key, token or card number, instead of loading it.
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
