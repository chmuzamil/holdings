# Self-hosting the server

Holdings works without a server: everything stays in your browser. The optional server adds:

- a login (password, plus an optional 6-digit code from an authenticator app),
- your data saved on your own machine, so it follows you between browsers,
- domain lookups (DNS and registration dates).

It is one Node.js process with one SQLite file. Nothing is sent to anyone else.

## With Docker

```bash
git clone https://github.com/chmuzamil/holdings.git
cd holdings
docker compose up -d
docker compose logs holdings
```

The image is built from this repo on your machine. Data is kept in the `holdings-data` volume, so updating is:

```bash
git pull
docker compose up -d --build
```

By default the port is only open to the machine itself (`127.0.0.1:8080`). Put a reverse proxy with HTTPS in front, for example Caddy:

```
holdings.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

and set `HOLDINGS_TRUST_PROXY: "true"` in `docker-compose.yml`. On a trusted home network without HTTPS, change the port to `"8080:8080"` and set `HOLDINGS_SECURE_COOKIES: "false"`. If you forget, the login screen tells you which one to change.

**Backups:** the volume holds `holdings.db` and `secret.key`. Copy both, for example:

```bash
docker compose exec holdings node -e "new (require('node:sqlite').DatabaseSync)('/data/holdings.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp holdings:/data/backup.db ./holdings-backup.db
docker compose cp holdings:/data/secret.key ./holdings-secret.key
docker compose exec holdings rm /data/backup.db
```

Keep `holdings-secret.key` as safe as the database: together they unlock the two-step login secret.

**Export** from Settings works too, and gives you a plain JSON file.

## Without Docker

You need Node.js 22.13 or newer.

```bash
npm ci
npm run build
npm run build:server
HOLDINGS_STATIC_DIR=dist npm run server
```

On the first start the log prints a setup code:

```
  No login yet. Open Holdings and create one with this setup code:

      ABCD-EFGH-JKLM
```

Open the panel, enter that code and choose a password of at least 12 characters. The code is only needed once.

## Settings

All settings are environment variables.

| Variable | Default | What it does |
|---|---|---|
| `HOLDINGS_PORT` | `8080` | Port to listen on. |
| `HOLDINGS_HOST` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` inside a container. |
| `HOLDINGS_DATA_DIR` | `./data` | Where the database and key file live. Back this folder up. |
| `HOLDINGS_STATIC_DIR` | not set | The built app (`dist`). Without it, only the API is served. |
| `HOLDINGS_SECURE_COOKIES` | `true` | Login cookies are sent over HTTPS only. Set `false` only for plain HTTP on a trusted network. `http://localhost` works either way. |
| `HOLDINGS_TRUST_PROXY` | `false` | Set `true` behind a reverse proxy (nginx, Caddy) so failed logins are counted per real visitor. |
| `HOLDINGS_SECRET_KEY` | generated | 64 hex characters. Encrypts the authenticator secret. If not set, a key is created in `secret.key` in the data folder. |
| `HOLDINGS_SETUP_CODE` | random | Fix the first-run setup code instead of reading it from the log. |

Put it behind HTTPS (for example nginx or Caddy) before using it over the internet.

## Revenue from Stripe

The server can read each product's monthly recurring revenue from Stripe, so your projects show real numbers. It is read-only: Holdings only accepts a restricted key, never a secret key.

1. In Stripe, open **Developers → API keys → Create restricted key**.
2. Give it **Read** access to **Subscriptions** and **Products**. Leave everything else at None.
3. Paste the key (it starts with `rk_live_`) in Holdings under **Settings → Revenue from Stripe**.

What it counts: active subscriptions, turned into a monthly amount (a yearly plan counts a twelfth each month), before discounts and tax. One-off payments, and metered or tiered prices, aren't included. The key is encrypted on your server and is never sent back to the browser. Only your server talks to `api.stripe.com`, and at most once every 10 minutes unless you press refresh.

## Import from Cloudflare

The server can read your Cloudflare zones and bring them in as domains: subdomains from your A, AAAA and CNAME records (linked to a server when the IP matches one you track), and the expiry date and whether auto-renew is on for domains registered at Cloudflare. It is read-only.

1. In Cloudflare, open **My Profile → API Tokens → Create Token → Custom token**.
2. Add the permissions **Zone → Zone → Read** and **Zone → DNS → Read**. For expiry dates, also add **Account → Registrar → Read** (only useful for domains registered at Cloudflare).
3. Paste the token in Holdings under **Settings → Import from Cloudflare**. The Global API Key is refused: it can change everything in your account.

Press **Check Cloudflare** to see each zone as "Will add", "Will fill in" (only empty fields: registrar, dates, new subdomains, server links) or "Up to date". Untick what you don't want, then import. Nothing you entered is overwritten, and cost is left for you because Cloudflare's API doesn't say what a domain costs. Anything that looks like a key or card number is left out.

The token is encrypted on your server and never sent back to the browser. Only your server talks to `api.cloudflare.com`, and only when you press Check Cloudflare. Disconnect deletes the token.

## Notifications

The server can tell you when something is about to renew or expire: domains, servers, subscriptions, certificates, API keys and payment cards. It checks once a day (from 8:00 server time) and sends one message listing what reached a milestone: 30, 14 or 7 days ahead (you choose), then 7 days, 1 day, and overdue. Each milestone is sent once.

Everything is off until you turn it on in **Settings → Notifications**. Use any or all of:

| Channel | What you need |
|---|---|
| **Email** | Your own mail server or provider's SMTP details (host, port, login). The password is encrypted on your server and never shown again. |
| **Webhook** | A Slack or Discord incoming webhook, or any address that accepts JSON. |
| **ntfy** | A topic on [ntfy.sh](https://ntfy.sh) or your own ntfy server, for push notifications on your phone. Anyone who knows a public topic can read it, so pick one that is hard to guess, or use a token. |

Each channel has a **Send test** button. Messages go only to the addresses you enter.

## Domain watch

Every DNS check (the button on a domain) already compares the result with the previous one and lists what changed in the domain's details. With the server you can also run it on a schedule:

1. Open **Settings → Domain watch** and turn it on.
2. Choose how often: every 6 or 12 hours, once a day, every 3 days or once a week.

The server checks every domain that isn't cancelled, keeps its own history (it doesn't change your saved data), and sends new changes to the notification channels you turned on. Each change is sent once. Nameserver changes, registry status changes, a removed transfer lock and an expiry date moving earlier are marked as important and also appear on the Attention page. If a registry doesn't answer, nothing is reported for it: a missing answer never looks like a removed lock.

## Calendar subscription

The Expiry page can always download a calendar file. With the server you can also **subscribe**, so your calendar app picks up new renewals by itself:

1. Open **Settings → Calendar subscription**, choose a project (or all) and how many days ahead to be reminded, and press **Make a link**.
2. Copy the link (it is shown only once) and add it in your calendar app as a subscription ("Add from URL" in Google Calendar, "New Calendar Subscription" in Apple Calendar, "Subscribe from web" in Outlook).

The link carries its own token. It can read the calendar and nothing else: not your data, not your settings. Only its hash is stored. **Make a new link** replaces it (the old one stops working) and **Turn off** removes it. Your calendar app needs to reach your server for this, so it only works if Holdings is reachable from where the app runs.

## Uptime status (Uptime Kuma or Gatus)

If you already run [Uptime Kuma](https://github.com/louislam/uptime-kuma) or [Gatus](https://github.com/TwiN/gatus), Holdings can show **Up** or **Down** next to your servers, domains and projects. It is off until you turn it on in **Settings → Uptime status**.

- **Uptime Kuma**: enter its address and the name of a status page (the part after `/status/`). Only monitors on that status page are shown.
- **Gatus**: enter its address.

Holdings reads the public status page data (no login or API key), from your server at most once a minute while Holdings is open. Monitors named like one of your servers, domains or projects are linked for you; link the rest in the list below the switch. Linked items then show **Up**, **Down**, **Checking** or **In maintenance**, and anything down appears on the Attention page.

## Dead-man's switch

If something happens to you, your projects keep running only until the next bill. The dead-man's switch makes sure someone you trust gets your handover file (what you run, where it's registered, what to do) if you stop checking in.

It is off until you turn it on in **Settings → Dead-man's switch**. You need:

1. **Email notifications** turned on, because the file is sent by email through your own mail server.
2. **The person you trust**: their name and email, and an optional note.
3. **A locked handover file.** Your browser builds it from your current data and locks it with a passphrase (AES-256-GCM). Only the locked file is uploaded. Give the person the passphrase yourself, in person or on paper: the server never has it, so the file is useless to anyone else.

How it works:

- Choose how often to check in (14, 30, 60 or 90 days) and how long to wait after a missed check-in (7, 14 or 30 days).
- Signing in, saving changes, or pressing **Check in** all count, so normal use keeps it quiet.
- When a check-in is due you get reminders on every notification channel you use: when it falls due, halfway through the waiting time, and the day before. Each has a one-click check-in link, so you don't need to sign in.
- If the waiting time ends without a check-in, your contact gets one email with the locked file and your note, and you are told it was sent. If sending fails, it tries again every hour and tells you.
- Check in afterwards and the switch is on again from that moment.

Keep the file current: when your data changes, lock and upload it again (Settings shows how old it is).

## Two-step login

After signing in, turn on two-step login in Settings. Scan the QR code with any authenticator app (1Password, Bitwarden, Google Authenticator, Aegis, and others), then enter a code to confirm.

## Locked out?

If you lose your password or your authenticator, run:

```bash
# Docker
docker compose run --rm holdings node server.js --reset-login
docker compose restart holdings

# Without Docker: stop the server first
npm run server -- --reset-login
```

This removes the login and signs out every device. **Your data is kept.** Start the server again and create a new login with the new setup code from the log.

## How it protects you

- Passwords are hashed with scrypt. Login cookies are random, `HttpOnly` and `SameSite=Strict`, and only their hash is stored.
- After 10 wrong attempts from one address, that address waits 15 minutes.
- Each authenticator code works once.
- Changes need a same-site request header, so other websites can't act as you.
- Saving checks a version number, so two open tabs can't silently overwrite each other.
