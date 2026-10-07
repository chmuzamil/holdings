# Contributing to Holdings

Thanks for helping. Holdings is small and young, so issues that describe a real problem you have with your side projects are just as valuable as code.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Keep pull requests focused: one change per PR, with a clear description of what and why.

## Setup

```bash
npm ci
npm run dev     # http://localhost:5173
npm run api     # optional: DNS/registry lookups
```

Before opening a PR, make sure these pass. CI runs the same checks:

```bash
npm run lint
npm test
npm run build
```

Add or update tests for any logic you change. Tests live next to the code (`*.test.js`).

## Rules

- **Fictional data only.** The repo is public. Demo data, tests, screenshots and docs must use reserved names: `*.example` domains (RFC 2606), documentation IPs `192.0.2.x`, `198.51.100.x`, `203.0.113.x` (RFC 5737), and no real email addresses. `src/lib/seed-data.test.js` checks the demo data.
- **Never store secrets.** Holdings tracks *metadata* about keys, cards and accounts (name, provider, expiry), never the secret itself.
- **No new third-party calls without discussion.** Anything that sends data to another service must be opt-in, documented in the README's privacy section, and allowed in the CSP in `docs/hosting-the-demo.md`.
- **Plain language in the UI.** Short sentences, no jargon where a normal word works.
- **No invented data.** If the app doesn't know something (a date, a status), it says so instead of guessing.

## Commit messages

A short summary line in the imperative ("Add expiry radar"), then a blank line and a few lines on what changed and why if it isn't obvious.
