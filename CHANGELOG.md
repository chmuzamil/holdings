# Changelog

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
