// Safety checks for a domain, from its last real DNS/registry lookup. Each
// check says what was found and, when it isn't fine, what to do. Nothing is
// scored or guessed: without a lookup every check is "unknown".
//
// status: 'pass' | 'warn' | 'fail' | 'tip' (worth doing, not a problem) | 'unknown'

const DAY_MS = 24 * 60 * 60 * 1000

function values(lookup, type) {
  const value = lookup?.dns?.[type]?.value
  return Array.isArray(value) ? value : []
}

// TXT answers come back as arrays of chunks per record.
const txt = (lookup, type) => values(lookup, type).map((record) => (Array.isArray(record) ? record.join('') : String(record)))

function transferLock(lookup, registrar) {
  const whois = lookup.whois
  if (!whois || whois.error) return { status: 'unknown', detail: 'The registry didn’t answer.' }
  const status = (whois.status || []).map((item) => String(item).toLowerCase())
  if (status.some((item) => item.includes('transfer prohibited'))) return { status: 'pass', detail: 'Transfer lock is on.' }
  return {
    status: 'warn',
    detail: 'Transfer lock is off.',
    action: `Turn on transfer lock (also called registrar lock) at ${registrar ? registrar.replace(/\.$/, '') : 'your registrar'}. It stops the domain being moved away without you.`,
  }
}

function dnssec(lookup) {
  const signed = lookup.whois?.dnssec
  if (signed === true) return { status: 'pass', detail: 'Signed with DNSSEC.' }
  if (signed === false) {
    return {
      status: 'tip',
      detail: 'Not signed with DNSSEC.',
      action: 'Turn on DNSSEC at your DNS provider and add its DS record at your registrar. Many do both in one click.',
    }
  }
  return { status: 'unknown', detail: 'The registry didn’t say. Check again to include this.' }
}

function nameservers(lookup) {
  const list = values(lookup, 'ns').length ? values(lookup, 'ns') : lookup.whois?.nameservers || []
  if (list.length >= 2) return { status: 'pass', detail: `${list.length} nameservers.` }
  if (list.length === 1) return { status: 'warn', detail: 'Only one nameserver.', action: 'Use at least two, so the domain keeps working if one is down.' }
  return { status: 'fail', detail: 'No nameservers found.', action: 'Set nameservers at your registrar, or the domain won’t resolve.' }
}

// No MX only means the domain doesn't receive mail. It may still send (through
// SES, Postmark…), so the advice never assumes it doesn't.
function spf(lookup, name, receivesMail) {
  const records = txt(lookup, 'txt').filter((record) => record.toLowerCase().startsWith('v=spf1'))
  if (records.length > 1) {
    return { status: 'warn', detail: 'More than one SPF record.', action: 'Merge them into one. With two, mail servers treat SPF as broken.' }
  }
  const record = records[0]?.toLowerCase()
  if (!record) {
    return receivesMail
      ? { status: 'warn', detail: 'No SPF record.', action: `Add a TXT record on ${name} listing who may send its mail, so others can’t pretend to be you.` }
      : { status: 'warn', detail: 'No SPF record.', action: `If ${name} never sends mail, add a TXT record on it: v=spf1 -all, so nobody can send mail as it. If it does, list the services that send for it.` }
  }
  if (/\+all\b/.test(record)) return { status: 'fail', detail: 'SPF lets anyone send as this domain (+all).', action: 'End the record with -all or ~all instead.' }
  if (/\?all\b/.test(record)) return { status: 'warn', detail: 'SPF is neutral (?all), so it protects nothing.', action: 'End the record with -all or ~all.' }
  return { status: 'pass', detail: `SPF: ${records[0]}` }
}

function dmarc(lookup, name, receivesMail) {
  if (!lookup.dns?.dmarc) return { status: 'unknown', detail: 'Not checked yet. Check again to include this.' }
  const record = txt(lookup, 'dmarc').find((item) => item.toLowerCase().startsWith('v=dmarc1'))
  if (!record) {
    return {
      status: 'warn',
      detail: 'No DMARC record.',
      action: `Add a TXT record on _dmarc.${name}: v=DMARC1; p=quarantine${receivesMail ? '' : ' (or p=reject if it never sends mail)'}`,
    }
  }
  const policy = /\bp\s*=\s*(\w+)/i.exec(record)?.[1]?.toLowerCase()
  if (policy === 'reject' || policy === 'quarantine') return { status: 'pass', detail: `DMARC policy is ${policy}.` }
  return {
    status: 'warn',
    detail: 'DMARC only reports (p=none); fake mail still gets through.',
    action: 'Once your own mail passes, change it to p=quarantine, then p=reject.',
  }
}

function registration(lookup, now) {
  const expires = lookup.whois?.expires
  if (!expires) return { status: 'unknown', detail: 'The registry didn’t give an expiry date.' }
  const days = Math.floor((Date.parse(expires) - now.getTime()) / DAY_MS)
  const date = String(expires).slice(0, 10)
  if (days < 0) return { status: 'fail', detail: `Registration expired on ${date}.`, action: 'Renew it now, before someone else registers it.' }
  if (days < 30) return { status: 'warn', detail: `Registration ends on ${date} (${days} days).`, action: 'Renew it, or turn on auto-renew.' }
  return { status: 'pass', detail: `Registered until ${date}.` }
}

const CHECKS = [
  ['transfer-lock', 'Transfer lock', (lookup, record) => transferLock(lookup, lookup.whois?.registrar || record.provider)],
  ['registration', 'Registration', (lookup, record, now) => registration(lookup, now)],
  ['nameservers', 'Nameservers', (lookup) => nameservers(lookup)],
  ['spf', 'SPF (who may send mail)', (lookup, record, now, mail) => spf(lookup, record.name, mail)],
  ['dmarc', 'DMARC (what to do with fake mail)', (lookup, record, now, mail) => dmarc(lookup, record.name, mail)],
  ['dnssec', 'DNSSEC', (lookup) => dnssec(lookup)],
]

export function getDomainRisks(record, now = new Date()) {
  const lookup = record?.lookup
  if (!lookup?.checkedAt) {
    return {
      checkedAt: '',
      problems: 0,
      checks: CHECKS.map(([key, label]) => ({ key, label, status: 'unknown', detail: 'Run a DNS check to see this.' })),
    }
  }
  const receivesMail = values(lookup, 'mx').length > 0
  const checks = CHECKS.map(([key, label, run]) => ({ key, label, ...run(lookup, record, now, receivesMail) }))
  return {
    checkedAt: String(lookup.checkedAt).slice(0, 10),
    problems: checks.filter((check) => check.status === 'warn' || check.status === 'fail').length,
    checks,
  }
}
