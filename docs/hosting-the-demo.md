# Hosting the public demo

The demo is the normal app built with `VITE_DEMO=true`. It opens with a made-up portfolio, shows a "this is a demo" banner, and turns off DNS checks. It is plain static files: no server code, no database. Each visitor's changes stay in their own browser.

## Build

```bash
npm ci
npm run build:demo
```

Upload the contents of `dist/` to your server, for example to `/srv/holdings-demo`.

The build assumes it is served from the root of a domain or subdomain (for example `demo.yourdomain.com`). To serve it from a sub-path, build with `npx vite build --mode demo --base=/holdings/`.

## Recommended headers

The app only needs to talk to its own origin, plus two services when a visitor presses a button: `open.er-api.com` (exchange rates, only after choosing a second currency) and `api.github.com` (repo import). This policy allows exactly that and was tested against the demo build:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

## Caddy

```caddyfile
demo.yourdomain.com {
	root * /srv/holdings-demo
	encode zstd gzip
	try_files {path} /index.html
	file_server

	header {
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		Referrer-Policy "no-referrer"
		X-Content-Type-Options "nosniff"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}

	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name demo.yourdomain.com;
    # ssl_certificate / ssl_certificate_key: your certificates

    root /srv/holdings-demo;
    index index.html;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

## Updating

Rebuild and replace the files. Visitors who already opened the demo keep their own copy of the demo data in their browser. "Reset the demo" in the banner brings back the original data.
