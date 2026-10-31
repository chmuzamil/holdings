# Hosting the public demo

The demo is the normal app built with `VITE_DEMO=true` (see `.env.demo`). It opens with a made-up portfolio, shows a "this is a demo" banner with a link to the repo, and turns off DNS checks. Because `.env.demo` also sets `VITE_SITE_URL`, the demo build gets link-preview tags (`og.png`), a canonical URL, a sitemap and a robots.txt that allows indexing. Set it to your own address if you host a public copy. Other builds get a robots.txt that keeps search engines out. It is plain static files: no server code, no database. Each visitor's changes stay in their own browser.

The last two lines of `.env.demo` add the Umami tracker that counts visits to holdings.chaudhery.com, plus three events: `demo_open`, and `github_click` and `self_host_docs_click` for the links in the banner and About. Remove them, or point them at your own Umami, if you host a public copy. Without them the build has no tracker. If you keep a tracker, add its origin to `script-src` and `connect-src` in the policy below, for example `script-src 'self' https://t.chaudhery.com` and `connect-src 'self' https://open.er-api.com https://api.github.com https://t.chaudhery.com`.

## Build

```bash
npm ci
npm run build:demo
```

Upload the contents of `dist/` to your server, for example to `/srv/holdings-demo/current`.

Or build and publish in one step over SSH:

```bash
scripts/deploy-demo.sh <ssh-host> /srv/holdings-demo
```

Each deploy goes into `/srv/holdings-demo/releases/<timestamp>`, and `/srv/holdings-demo/current` is switched to it in one step, so visitors never see a half-uploaded site. The three newest releases are kept. The examples below point at `/srv/holdings-demo/current`.

The build assumes it is served from the root of a domain or subdomain (for example `demo.yourdomain.com`). To serve it from a sub-path, build with `npx vite build --mode demo --base=/holdings/`.

## Recommended headers

The app only needs to talk to its own origin, plus two services when a visitor presses a button: `open.er-api.com` (exchange rates, only after choosing a second currency) and `api.github.com` (repo import). This policy allows exactly that and was tested against the demo build:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

## What the configs below do

- Serve `index.html` at `/` without caching, so a new deploy shows up straight away.
- Cache the hashed files in `/assets/` for a year, and other files (icons, `og.png`, `robots.txt`) for a day.
- Return a real 404 for any other path. The app has no other routes (pages are `#hash` links), so this avoids soft-404 copies of the home page.
- Send the security headers on every response. `Referrer-Policy: strict-origin-when-cross-origin` still lets GitHub see that visitors came from your demo.

## Caddy

```caddyfile
demo.yourdomain.com {
	root * /srv/holdings-demo/current
	encode zstd gzip
	file_server

	header {
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Content-Type-Options "nosniff"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}

	@index path / /index.html
	header @index Cache-Control "no-cache"

	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"

	@static path /favicon.svg /apple-touch-icon.png /og.png /robots.txt /sitemap.xml
	header @static Cache-Control "public, max-age=86400"
}
```

## nginx

In nginx, a `location` that adds any header of its own drops the headers set at `server` level. Keep the security headers in a snippet and include it in every location:

```nginx
# /etc/nginx/snippets/holdings-headers.conf
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

```nginx
server {
    listen 443 ssl http2;
    server_name demo.yourdomain.com;
    # ssl_certificate / ssl_certificate_key: your certificates

    root /srv/holdings-demo/current;
    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    location = / {
        include snippets/holdings-headers.conf;
        add_header Cache-Control "no-cache";
        try_files /index.html =404;
    }

    location /assets/ {
        include snippets/holdings-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        include snippets/holdings-headers.conf;
        add_header Cache-Control "public, max-age=86400";
        try_files $uri =404;
    }
}
```

## Updating

Rebuild and replace the files. Visitors who already opened the demo keep their own copy of the demo data in their browser. "Reset the demo" in the banner brings back the original data.
