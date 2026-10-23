import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

// Serves the built app. Same headers as the hosted demo (docs/hosting-the-demo.md).
export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://open.er-api.com https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

export async function serveStatic(root: string, pathname: string, request: IncomingMessage, response: ServerResponse) {
  const base = resolve(root)
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return notFound(response)
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const file = resolve(join(base, relative))
  if (!file.startsWith(base + sep) || decoded.includes('\0')) return notFound(response)

  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return notFound(response)

  const cache = relative === 'index.html'
    ? 'no-cache'
    : relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cache,
  })
  if (request.method === 'HEAD') return response.end()
  createReadStream(file).pipe(response)
}

function notFound(response: ServerResponse) {
  response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}
