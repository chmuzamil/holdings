// Holdings stores where a key lives and when it expires, never the key
// itself. These checks catch a secret or card number pasted into a field by
// mistake, before it is saved to the browser (or an export file).

const PATTERNS = [
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Stripe key', /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}\b/],
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{32,}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
]

function luhn(digits) {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** A card number: 13–19 digits (spaces or dashes allowed) that pass the Luhn check. */
function findCardNumber(text) {
  for (const match of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = match[0].replace(/[ -]/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true
  }
  return false
}

/** Long random-looking strings, as most API keys are. */
function looksRandom(text) {
  for (const [token] of text.matchAll(/[A-Za-z0-9_\-+/=]{32,}/g)) {
    if (/^\d+$/.test(token) || /^https?/i.test(token)) continue
    const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((re) => re.test(token)).length
    if (classes === 3) return true
  }
  return false
}

/** Returns what kind of secret the text seems to contain, or '' if none. */
export function findSecret(text) {
  const value = String(text ?? '')
  if (!value) return ''
  for (const [name, pattern] of PATTERNS) {
    if (pattern.test(value)) return name
  }
  if (findCardNumber(value)) return 'card number'
  if (looksRandom(value)) return 'key or token'
  return ''
}

/** Checks every text field of a record. Returns [{ field, kind }]. */
export function findSecretsInRecord(record) {
  return Object.entries(record)
    .filter(([, value]) => typeof value === 'string')
    .map(([field, value]) => ({ field, kind: findSecret(value) }))
    .filter((hit) => hit.kind)
}
