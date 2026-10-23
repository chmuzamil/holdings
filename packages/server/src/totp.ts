import { createHmac, randomBytes } from 'node:crypto'

// Time-based one-time passwords (RFC 6238), as used by authenticator apps:
// SHA-1, 6 digits, 30-second steps.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Not base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac[hmac.length - 1] as number) & 15
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(binary).padStart(DIGITS, '0')
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS)
}

/**
 * Checks a code against the previous, current and next step (to allow for
 * clock drift). Returns the matching step, or null. Callers store the step
 * and reject any code at or before it, so a code can't be used twice.
 */
export function verifyTotp(secret: string, code: string, { now = Date.now(), lastUsedStep = -1 } = {}): number | null {
  const clean = String(code).replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const step = currentStep(now)
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate <= lastUsedStep) continue
    if (totpCode(secret, candidate) === clean) return candidate
  }
  return null
}

export function otpauthUri(secret: string, account: string, issuer = 'Holdings'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
