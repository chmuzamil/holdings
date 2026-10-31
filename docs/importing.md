# Importing your data

A spreadsheet (CSV) or a Holdings export (JSON) is read in your browser; nothing is uploaded anywhere. With the [self-hosted server](self-hosting.md), Holdings can also read what your providers already know (see the end of this page).

## From a spreadsheet (CSV)

**Settings → Import from a spreadsheet (CSV)** adds domains, subscriptions or servers from a CSV file.

1. Choose what's in the file. **Download template** gives you a file with the right columns and one made-up example.
2. Choose your file. Holdings works out the delimiter (comma, semicolon, tab or pipe) and handles quoted cells, line breaks inside quotes, Excel's byte-order mark and Windows line endings.
3. Match the columns. Common names (Domain, Registrar, Price, Renewal, Expires…) are matched for you, and your choices are remembered while the tab is open.
4. Check the rows. Every row says whether it **will be added**, is **already here** (or twice in the file), or has a **problem**, and what the problem is. Nothing is added until you press **Add**.

What counts as a duplicate:

| Type | Same as an existing one when… |
|---|---|
| Domains | the domain name matches (ignoring `www.` and capitals) |
| Subscriptions | name, cost and renewal date all match |
| Servers | name and IP address match |

Values Holdings reads:

- **Costs** in US dollars, like everywhere in Holdings. `$12.50`, `1,200` and `USD 9` are fine.
- **Dates** as `YYYY-MM-DD` (or `YYYY/MM/DD`). Dates like `01/02/2027` are refused because they could mean January or February.
- **Status**: Active, Expiring Soon, Expired or Cancelled. Empty means Active.

**Secrets are never imported.** Every cell, including columns you didn't map, is checked for anything that looks like a real API key, token, private key or card number. A row that has one is left out, with the reason.

## From a Holdings export (JSON)

**Settings → Import JSON** loads a file from **Export JSON**, including exports from older versions of Holdings. It replaces everything in the browser, after asking. Exports also carry your handover pack settings (your name, who it is for, the note and the global runbook), and importing restores them; older exports without them still import. A file that contains anything looking like a real key, token or card number is refused as a whole, with where the problem is, and nothing is changed.

## From your providers (self-hosted)

With the self-hosted server, Holdings can read from the services you already use, with read-only keys where the provider offers them. Your server does the reading; keys are encrypted there and never sent back to the browser.

| What | From | Where in Settings | Setup |
|---|---|---|---|
| Domains, subdomains, server links, expiry and auto-renew | Cloudflare | Import from Cloudflare | [Import from Cloudflare](self-hosting.md#import-from-cloudflare) |
| Domains, expiry and auto-renew | Porkbun, Namecheap, Spaceship | Import from your registrar | [Import from your registrar](self-hosting.md#import-from-your-registrar) |
| Servers with specs, IP, location and price | Hetzner Cloud, DigitalOcean, or your own JSON URL | Import servers | [Import servers](self-hosting.md#import-servers) |
| Monthly revenue per project | Stripe, Lemon Squeezy, Paddle, or your own JSON URL | Revenue from Stripe, More revenue sources | [Revenue from Stripe](self-hosting.md#revenue-from-stripe), [More revenue sources](self-hosting.md#more-revenue-sources) |

The domain and server imports work like the CSV import: press **Check**, see every item as **will add**, **will update** or **up to date**, untick what you don't want, and nothing changes until you press **Import**. Only empty details are filled in, with two exceptions where the provider knows best: the registrar import updates an expiry date that differs (shown as old → new first), and both domain imports update the auto-renew setting. A server's price is only filled in when its cost is 0. Anything that looks like a secret is left out, as everywhere else.

Revenue is different: it isn't imported once. Link products to a project when you edit it, and its monthly revenue follows the provider from then on.
