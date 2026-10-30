import { findSecretsInRecord } from './secrets'

// Turns servers from Hetzner, DigitalOcean or a custom URL (read by the
// self-hosted server) into a preview against the servers already in
// Holdings. A server matches by public IP, or else by name. Empty details
// are filled in; nothing already entered is overwritten. Costs are stored
// in USD, so other currencies are converted with the app's daily rate.

const money = (usd) => `$${usd.toFixed(2)}`

/** Monthly cost in USD, or null when the currency can't be converted. */
export function monthlyUsd(server, ratesPerUsd = {}) {
  if (server.monthlyCost === null || server.monthlyCost === undefined) return null
  if (server.currency === 'USD') return server.monthlyCost
  const rate = Number(ratesPerUsd[server.currency])
  return rate > 0 ? Math.round((server.monthlyCost / rate) * 100) / 100 : null
}

/** Currencies the preview needs a rate for. */
export function neededCurrencies(result, ratesPerUsd = {}) {
  return [...new Set(result.servers.filter((server) => server.monthlyCost !== null && server.currency !== 'USD').map((server) => server.currency))]
    .filter((currency) => !(Number(ratesPerUsd[currency]) > 0))
}

function costText(server, usd) {
  if (usd === null) return server.monthlyCost === null ? '' : `${server.monthlyCost} ${server.currency} a month (no exchange rate)`
  return server.currency === 'USD' ? `${money(usd)} a month` : `${money(usd)} a month (${server.monthlyCost} ${server.currency})`
}

/**
 * One row per server: "add", "update" (with what changes), "same", or
 * "invalid" (something looked like a secret).
 */
export function previewHosts(result, records, ratesPerUsd = {}) {
  const existing = records.servers ?? []
  const byIp = new Map(existing.filter((server) => server.ipAddress).map((server) => [String(server.ipAddress).trim(), server]))
  const byName = new Map(existing.map((server) => [String(server.name).trim().toLowerCase(), server]))
  return result.servers.map((server, index) => {
    const match = (server.ip && byIp.get(server.ip)) || byName.get(server.name.toLowerCase())
    const usd = monthlyUsd(server, ratesPerUsd)
    const key = `${server.ip || server.name}-${index}`
    const provider = server.provider || ''

    let row
    if (!match) {
      const notes = [
        server.notes,
        server.ipv6 && `IPv6 ${server.ipv6}.`,
        usd === null && server.monthlyCost !== null && `Costs ${server.monthlyCost} ${server.currency} a month.`,
        server.status && !['running', 'active'].includes(server.status) && `Was ${server.status} when imported.`,
      ].filter(Boolean).join(' ')
      const record = {
        name: server.name,
        provider,
        packageName: server.plan,
        ipAddress: server.ip,
        cpu: server.cpu,
        ramGb: server.ramGb,
        storage: server.storage,
        bandwidth: '',
        os: server.os,
        location: server.location,
        hostedServices: [],
        connectedProjectIds: [],
        cost: usd ?? 0,
        renewalDate: '',
        expiryDate: '',
        status: 'Active',
        notes,
      }
      const changes = [server.plan, server.ip, server.location, costText(server, usd)].filter(Boolean)
      row = { key, name: server.name, status: 'add', record, changes }
    } else {
      const patch = {}
      const changes = []
      const fill = (field, value, label) => {
        if (!match[field] && value) {
          patch[field] = value
          changes.push(label)
        }
      }
      fill('provider', provider, `provider ${provider}`)
      fill('ipAddress', server.ip, `IP ${server.ip}`)
      fill('packageName', server.plan, `plan ${server.plan}`)
      fill('cpu', server.cpu, `${server.cpu} CPU`)
      fill('ramGb', server.ramGb, `${server.ramGb} GB RAM`)
      fill('storage', server.storage, `storage ${server.storage}`)
      fill('os', server.os, server.os)
      fill('location', server.location, server.location)
      fill('cost', usd, costText(server, usd))
      const info = []
      if (usd !== null && Number(match.cost) > 0 && Math.abs(Number(match.cost) - usd) >= 0.01) {
        info.push(`${result.host} lists ${costText(server, usd)}; yours stays ${money(Number(match.cost))}`)
      }
      // Show which server it matched when the names differ.
      const name = match.name && match.name.toLowerCase() !== server.name.toLowerCase() ? `${server.name} (your ${match.name})` : server.name
      row = { key, name, status: changes.length ? 'update' : 'same', id: match.id, patch, changes: [...changes, ...info] }
    }

    // Like every import: nothing that looks like a secret comes in.
    const secrets = findSecretsInRecord(row.record ?? row.patch)
    if (secrets.length) return { ...row, status: 'invalid', changes: [`Looks like it contains a ${secrets[0].kind}, so it was left out.`] }
    return row
  })
}
