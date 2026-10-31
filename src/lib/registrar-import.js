import { autoRenewValue } from './domain-helpers'
import { domainsByName } from './domain-import'
import { findSecretsInRecord } from './secrets'

// Turns a registrar's domain list (from the self-hosted server) into a
// preview against the domains already in Holdings. The registrar is the
// source of truth for when a domain expires, so a different expiry date is
// offered as a change (shown before and after); everything else is only
// filled in when empty. Cost is left for the owner.

function notesFor(registrar, domain) {
  return [
    `Registered at ${registrar}.`,
    domain.locked === false ? 'Transfer lock is off.' : '',
  ].filter(Boolean).join(' ')
}

/**
 * One row per registrar domain: "add", "update" (with a list of changes),
 * "same", or "invalid" (something looked like a secret).
 */
export function previewRegistrar(result, records) {
  const byName = domainsByName(records.domains)
  const registrar = result.registrar
  return result.domains.map((domain) => {
    const existing = byName.get(domain.name)
    const expires = domain.expiresAt
    // When an update switches auto-renew to off, its change already says so.
    const switchesOff = existing && existing.autoRenew !== 'off'
    const warnings = [domain.autoRenew === false && !switchesOff && 'auto-renew is OFF', domain.locked === false && 'transfer lock is off'].filter(Boolean)

    let row
    if (!existing) {
      const record = {
        name: domain.name,
        provider: registrar,
        cost: 0,
        renewalDate: expires ?? '',
        expiryDate: expires ?? '',
        status: 'Active',
        autoRenew: autoRenewValue(domain.autoRenew),
        notes: notesFor(registrar, domain),
        subdomains: [],
        connectedServerIds: [],
      }
      row = { name: domain.name, status: 'add', record, changes: [expires && `expires ${expires}`, ...warnings].filter(Boolean) }
    } else {
      const patch = {}
      const changes = []
      if (!existing.provider) {
        patch.provider = registrar
        changes.push(`registrar ${registrar}`)
      }
      if (expires && existing.expiryDate !== expires) {
        patch.expiryDate = expires
        changes.push(existing.expiryDate ? `expiry ${existing.expiryDate} → ${expires}` : `expiry date ${expires}`)
        // A renewal date that was empty, or kept equal to the expiry, follows it.
        if (!existing.renewalDate || existing.renewalDate === existing.expiryDate) {
          patch.renewalDate = expires
          if (existing.renewalDate) changes.push(`renewal ${existing.renewalDate} → ${expires}`)
        }
      } else if (expires && !existing.renewalDate) {
        patch.renewalDate = expires
        changes.push(`renewal date ${expires}`)
      }
      // Like the expiry date, the registrar knows whether it auto-renews.
      const autoRenew = autoRenewValue(domain.autoRenew)
      if (autoRenew && (existing.autoRenew || '') !== autoRenew) {
        patch.autoRenew = autoRenew
        changes.push(`auto-renew ${autoRenew}`)
      }
      row = { name: domain.name, status: changes.length ? 'update' : 'same', id: existing.id, patch, changes: changes.length ? [...changes, ...warnings] : warnings }
    }

    // Like every import: nothing that looks like a secret comes in.
    const secrets = findSecretsInRecord(row.record ?? row.patch)
    if (secrets.length) return { ...row, status: 'invalid', changes: [`Looks like it contains a ${secrets[0].kind}, so it was left out.`] }
    return row
  })
}
