import http from 'node:http'
import { cleanDomain, createRateLimiter, lookupDomain, validateDomain } from './domain-lookup.mjs'

const port = Number(process.env.HOLDINGS_API_PORT || process.env.FOUNDER_OS_API_PORT || 4180)
// HOLDINGS_ALLOWED_ORIGIN: leave unset to serve same-origin only (through the Vite dev proxy or your
// reverse proxy). Set it to one exact origin to allow cross-origin calls.
const allowedOrigin = process.env.HOLDINGS_ALLOWED_ORIGIN || process.env.FOUNDER_OS_ALLOWED_ORIGIN || ''
const allowRequest = createRateLimiter({ limit: 30, windowMs: 60_000 })

function sendJson(request, response, status, body) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (allowedOrigin && request.headers.origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin
    headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers.Vary = 'Origin'
  }
  response.writeHead(status, headers)
  response.end(status === 204 ? undefined : JSON.stringify(body))
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(request, response, 204)
    return
  }

  const url = new URL(request.url, 'http://localhost')
  const isLookupPath = url.pathname === '/api/domain-lookup' || url.pathname === '/domain-lookup'
  if (request.method !== 'GET' || !isLookupPath) {
    sendJson(request, response, 404, { error: 'Not found' })
    return
  }

  if (!allowRequest(request.socket.remoteAddress || 'unknown')) {
    sendJson(request, response, 429, { error: 'Too many lookups. Wait a minute and try again.' })
    return
  }

  const domain = cleanDomain(url.searchParams.get('domain'))
  const invalid = validateDomain(domain)
  if (invalid) {
    sendJson(request, response, 400, { error: invalid })
    return
  }

  try {
    sendJson(request, response, 200, await lookupDomain(domain))
  } catch (error) {
    console.error(`Lookup failed for ${domain}:`, error)
    sendJson(request, response, 500, { error: 'Lookup failed. Try again later.' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Domain lookup API listening on http://127.0.0.1:${port}`)
})
