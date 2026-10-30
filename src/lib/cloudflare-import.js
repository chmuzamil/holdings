import { domainsByName } from './domain-import'
import { findSecretsInRecord } from './secrets'

// Turns what Cloudflare has (from the self-hosted server) into a preview
// against the domains already in Holdings: new domains to add, and existing
// ones where empty details can be filled in. Nothing already entered is
// overwritten. Cloudflare's API doesn't say what a domain costs, so cost is
// left for the owner.

const label = (fullName, domain) => (fullName === domain ? '' : fullName.slice(0, -(domain.length + 1)))

function serverForIp(servers, ip) {
  return servers.find((server) => String(server.ipAddress || '').trim() === ip)
}

/** Subdomains and server links Cloudflare's DNS records describe for one domain. */
export function dnsDetails(domain, servers) {
  const subdomains = []
  const serverIds = new Set()
  for (const record of domain.records) {
    if (record.name !== domain.name && !record.name.endsWith(`.${domain.name}`)) continue
    const name = label(record.name, domain.name)
    const server = record.type === 'CNAME' ? null : serverForIp(servers, record.content)
    if (!name) {
      if (server) serverIds.add(server.id)
      continue
    }
    if (subdomains.some((sub) => sub.name === name)) continue
    subdomains.push({
      id: `sub-cf-${domain.name}-${name}`,
      name,
      serverId: server?.id ?? '',
      notes: record.type === 'CNAME' ? `Points to ${record.content} (Cloudflare)` : `${record.type} ${record.content}${record.proxied ? ', proxied' : ''} (Cloudflare)`,
    })
  }
  return { subdomains, serverIds: [...serverIds] }
}

/**
 * One row per Cloudflare zone: "add" (new domain), "update" (fills in what
 * is missing on an existing one, with a list of what), "same", or
 * "invalid" (something looked like a secret).
 */
export function previewCloudflare(result, records) {
  const servers = records.servers ?? []
  const byName = domainsByName(records.domains)
  return result.domains.map((cf) => {
    const { subdomains, serverIds } = dnsDetails(cf, servers)
    const existing = byName.get(cf.name)
    const notes = [`DNS on Cloudflare${cf.plan ? ` (${cf.plan})` : ''}.`, cf.status && cf.status !== 'active' ? `Zone is ${cf.status} in Cloudflare.` : '', cf.autoRenew === true ? 'Auto-renew is on.' : cf.autoRenew === false ? 'Auto-renew is OFF.' : '']
      .filter(Boolean).join(' ')

    let row
    if (!existing) {
      const record = {
        name: cf.name,
        provider: cf.registrar ?? '',
        cost: 0,
        renewalDate: cf.expiresAt ?? '',
        expiryDate: cf.expiresAt ?? '',
        status: 'Active',
        notes,
        subdomains,
        connectedServerIds: serverIds,
      }
      const what = [cf.registrar && `registrar ${cf.registrar}`, cf.expiresAt && `expires ${cf.expiresAt}`, subdomains.length && `${subdomains.length} subdomain${subdomains.length === 1 ? '' : 's'}`, serverIds.length && 'linked to a server'].filter(Boolean)
      row = { name: cf.name, status: 'add', record, changes: what }
    } else {
      const patch = {}
      const changes = []
      if (!existing.provider && cf.registrar) {
        patch.provider = cf.registrar
        changes.push(`registrar ${cf.registrar}`)
      }
      if (!existing.renewalDate && cf.expiresAt) {
        patch.renewalDate = cf.expiresAt
        changes.push(`renewal date ${cf.expiresAt}`)
      }
      if (!existing.expiryDate && cf.expiresAt) {
        patch.expiryDate = cf.expiresAt
        if (!changes.some((change) => change.startsWith('renewal'))) changes.push(`expiry date ${cf.expiresAt}`)
      }
      const known = new Set((existing.subdomains ?? []).map((sub) => String(sub.name).toLowerCase()))
      const newSubs = subdomains.filter((sub) => !known.has(sub.name))
      if (newSubs.length) {
        patch.subdomains = [...(existing.subdomains ?? []), ...newSubs]
        changes.push(`${newSubs.length} new subdomain${newSubs.length === 1 ? '' : 's'}`)
      }
      const links = new Set(existing.connectedServerIds ?? [])
      const newLinks = serverIds.filter((id) => !links.has(id))
      if (newLinks.length) {
        patch.connectedServerIds = [...links, ...newLinks]
        changes.push('linked to a server')
      }
      row = { name: cf.name, status: changes.length ? 'update' : 'same', id: existing.id, patch, changes }
    }

    // Like every import: nothing that looks like a secret comes in.
    const secrets = findSecretsInRecord({ ...(row.record ?? row.patch), subdomains: undefined })
      .concat(subdomains.flatMap((sub) => findSecretsInRecord(sub)))
    if (secrets.length) return { ...row, status: 'invalid', changes: [`Looks like it contains a ${secrets[0].kind}, so it was left out.`] }
    return row
  })
}
