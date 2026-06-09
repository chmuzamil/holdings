# Founder OS

**Your personal command center for domains, servers, repos, accounts, and renewals.**

Founder OS is a private personal dashboard for founders, indie hackers, developers, and freelancers who manage a lot of digital assets. It helps track domains, VPS/servers, GitHub repositories, online accounts, subscriptions, prices, expiry dates, and renewal dates in one clean dashboard.

![Founder OS dashboard](https://img.shields.io/badge/status-active-22c55e?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square)

## Overview

Founder OS is built to feel like a polished open-source SaaS dashboard while staying useful as a personal founder workspace. It starts with mock asset data, Supabase Auth, optional Supabase persistence, and a simple structure that can grow into a full private operating dashboard.

Live demo:

```text
https://founder-os.maker.example
```

## Features

- Dashboard cards for domains, servers, repos, accounts, costs, renewals, and attention items
- Modules for domains, VPS/servers, GitHub repos, accounts, and subscriptions
- Domain notes for usage context, pointing details, or internal reminders
- Domain subdomain tracking and VPS/server attachment
- VPS/server IP address and notes for hosting context
- Add, edit, and delete records
- Delete confirmation modal
- Search, status filter, and sorting by renewal date, expiry date, or cost
- Status badges for `Active`, `Expiring Soon`, `Expired`, and `Cancelled`
- Renewal reminders and attention highlighting
- Monthly and yearly cost calculations
- USD and PKR currency support with a dashboard reporting toggle
- Private login screen powered by Supabase Auth
- Empty states for clean first-run usage
- Responsive desktop and mobile layouts
- Browser storage persistence for records on the same device
- Optional Supabase persistence with browser storage fallback
- GitHub repository auto-fetch by username or personal access token
- Self-hosted DNS and RDAP lookup API for domain records

## Demo Data

The app includes sample records for:

- `shopfront.example`
- `maker.example`
- `PakDataKit repo`
- `TrendPulse / NewsBite`
- `Main VPS`
- `OpenRouter`
- `GitHub`
- `Supabase`

## Tech Stack

- React
- Vite
- Lucide React
- CSS modules-style plain CSS

## Getting Started

Clone the repo and install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your Supabase project values:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run the self-hosted domain lookup API:

```bash
npm run api
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL for cloud persistence |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for Auth and dashboard persistence |

Create at least one user in Supabase Auth before logging into Founder OS.

## Data Model

Founder OS currently keeps records in local React state using module arrays:

- `domains`
- `servers`
- `repos`
- `accounts`
- `subscriptions`

Each record tracks a name, provider, cost, currency, renewal date, expiry date, and status. Domain records support notes, subdomains, and attached VPS/server references for where the domain is used or pointed. VPS/server records support IP addresses and notes for hosting context. Costs support `USD` and `PKR`; dashboard totals normalize records through a simple exchange-rate map before displaying them in the selected reporting currency.

Records are persisted to browser `localStorage`, so changes survive refreshes, Nginx reloads, and redeploys on the same browser/device. When Supabase env variables are configured, records also sync to the `founder_os_records` table.

Run `supabase-schema.sql` in the Supabase SQL editor to create the records table.

## GitHub Auto-Fetch

The Settings page includes fields for:

- GitHub username
- REST API base URL
- Personal access token

Without a token, Founder OS fetches public repositories from:

```text
https://api.github.com/users/{username}/repos
```

With a token, Founder OS fetches repositories available to the token from:

```text
https://api.github.com/user/repos
```

> Token note: storing a GitHub token in browser storage is convenient for a private prototype, but it is not ideal for production. For stronger security, move GitHub sync to a Supabase Edge Function or another backend so the token is never stored in the browser.

## DNS and WHOIS Lookup

Founder OS includes a small self-hosted API at `server/domain-api.mjs`.

It provides:

- DNS records: `A`, `AAAA`, `CNAME`, `MX`, `NS`, `TXT`, `SOA`
- WHOIS-style structured data through RDAP
- Registrar, status, nameserver, created, updated, and expiry details where available

In production, proxy `/api/domain-lookup` to the Node API service. The Domains module has a refresh button per domain that saves lookup results into the domain record.

## Roadmap

- Private row-level security tied to Supabase user IDs
- CSV import/export
- Reminder notifications
- GitHub repository metadata sync
- GitHub API repo import using a personal access token
- Deployment guide for Nginx/VPS hosting

## Not Included

Founder OS intentionally does not include:

- Client module
- SSL monitoring
- Backup module

## License

MIT
