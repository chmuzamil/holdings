# Self-hosting the server

Holdings works without a server: everything stays in your browser. The optional server adds:

- a login (password, plus an optional 6-digit code from an authenticator app),
- your data saved on your own machine, so it follows you between browsers,
- domain lookups (DNS and registration dates).

It is one Node.js process with one SQLite file. Nothing is sent to anyone else.

> Docker setup is coming next. Until then, run it with Node.js 22.13 or newer.

## Run it

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

## Two-step login

After signing in, turn on two-step login in Settings. Scan the QR code with any authenticator app (1Password, Bitwarden, Google Authenticator, Aegis, and others), then enter a code to confirm.

## Locked out?

If you lose your password or your authenticator, stop the server and run:

```bash
npm run server -- --reset-login
```

This removes the login and signs out every device. **Your data is kept.** Start the server again and create a new login with the new setup code from the log.

## How it protects you

- Passwords are hashed with scrypt. Login cookies are random, `HttpOnly` and `SameSite=Strict`, and only their hash is stored.
- After 10 wrong attempts from one address, that address waits 15 minutes.
- Each authenticator code works once.
- Changes need a same-site request header, so other websites can't act as you.
- Saving checks a version number, so two open tabs can't silently overwrite each other.
