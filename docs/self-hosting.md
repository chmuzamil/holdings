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
