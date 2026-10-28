# Importing your data

Everything is read in your browser. Nothing is uploaded anywhere.

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

**Settings → Import JSON** loads a file from **Export JSON**, including exports from older versions of Holdings. It replaces everything in the browser, after asking. A file that contains anything looking like a real key, token or card number is refused as a whole, with where the problem is, and nothing is changed.
