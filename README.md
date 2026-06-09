# Founder OS

**Your personal command center for domains, servers, repos, accounts, and renewals.**

Founder OS is a private personal dashboard for founders, indie hackers, developers, and freelancers who manage a lot of digital assets. It helps track domains, VPS/servers, GitHub repositories, online accounts, subscriptions, prices, expiry dates, and renewal dates in one clean dashboard.

![Founder OS dashboard](https://img.shields.io/badge/status-active-22c55e?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square)

## Overview

Founder OS is built to feel like a polished open-source SaaS dashboard while staying useful as a personal founder workspace. It starts with mock data and a frontend-only login gate, with a simple structure that can later be connected to Supabase Auth and database tables.

Live demo:

```text
https://founder-os.maker.example
```

## Features

- Dashboard cards for domains, servers, repos, accounts, costs, renewals, and attention items
- Modules for domains, VPS/servers, GitHub repos, accounts, and subscriptions
- Domain notes for usage context, pointing details, or internal reminders
- VPS/server IP address and notes for hosting context
- Add, edit, and delete records
- Delete confirmation modal
- Search, status filter, and sorting by renewal date, expiry date, or cost
- Status badges for `Active`, `Expiring Soon`, `Expired`, and `Cancelled`
- Renewal reminders and attention highlighting
- Monthly and yearly cost calculations
- USD and PKR currency support with a dashboard reporting toggle
- Private login screen powered by environment variables
- Empty states for clean first-run usage
- Responsive desktop and mobile layouts
- Browser storage persistence for records on the same device
- Optional Supabase persistence with browser storage fallback
- GitHub repository auto-fetch by username or personal access token

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

Update the login values:

```bash
VITE_LOGIN_EMAIL=founder@example.com
VITE_LOGIN_PASSWORD=change-me
VITE_LOGIN_NAME=Founder
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

## Environment Variables

| Variable | Description |
| --- | --- |
| `VITE_LOGIN_EMAIL` | Email used by the frontend mock login |
| `VITE_LOGIN_PASSWORD` | Password used by the frontend mock login |
| `VITE_LOGIN_NAME` | Display name shown in the app |
| `VITE_SUPABASE_URL` | Supabase project URL for cloud persistence |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for the dashboard client |

> Important: Vite frontend environment variables are bundled into the browser build. This login is useful for demos and private prototypes, but it is not secure authentication. Use Supabase Auth or another server-backed auth provider before storing sensitive data.

## Data Model

Founder OS currently keeps records in local React state using module arrays:

- `domains`
- `servers`
- `repos`
- `accounts`
- `subscriptions`

Each record tracks a name, provider, cost, currency, renewal date, expiry date, and status. Domain records support notes for where the domain is used or pointed. VPS/server records support IP addresses and notes for hosting context. Costs support `USD` and `PKR`; dashboard totals normalize records through a simple exchange-rate map before displaying them in the selected reporting currency.

Records are persisted to browser `localStorage`, so changes survive refreshes, Nginx reloads, and redeploys on the same browser/device. When Supabase env variables are configured, records also sync to the `founder_os_records` table.

Run `supabase-schema.sql` in the Supabase SQL editor to create the table.

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

## Roadmap

- Supabase Auth
- Supabase Auth with private row-level security
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
