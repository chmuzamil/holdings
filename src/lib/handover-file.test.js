import { describe, expect, it } from 'vitest'
import { decryptHandover, encryptHandover, handoverFileHtml, lockedHandoverFile } from './handover-file'

const secretText = '<h1>If Sam is unavailable</h1><p>The Main VPS renews on 2026-10-30.</p>'
const passphrase = 'correct horse battery staple'

describe('handover encryption', () => {
  it('round-trips with the right passphrase', async () => {
    const payload = await encryptHandover(secretText, passphrase)
    expect(payload).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000 })
    expect(await decryptHandover(payload, passphrase)).toBe(secretText)
  })

  it('refuses a wrong passphrase', async () => {
    const payload = await encryptHandover(secretText, passphrase)
    await expect(decryptHandover(payload, 'wrong passphrase!!')).rejects.toThrow()
  })

  it('refuses a tampered file', async () => {
    const payload = await encryptHandover(secretText, passphrase)
    const bytes = Uint8Array.from(atob(payload.data), (char) => char.charCodeAt(0))
    bytes[0] ^= 1
    const tampered = { ...payload, data: btoa(String.fromCharCode(...bytes)) }
    await expect(decryptHandover(tampered, passphrase)).rejects.toThrow()
  })

  it('uses a fresh salt and IV every time', async () => {
    const [a, b] = await Promise.all([encryptHandover(secretText, passphrase), encryptHandover(secretText, passphrase)])
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('rejects short passphrases', async () => {
    await expect(encryptHandover(secretText, 'short')).rejects.toThrow('at least 12')
  })
})

describe('handoverFileHtml', () => {
  it('contains only ciphertext, not the plain text', async () => {
    const html = handoverFileHtml(await encryptHandover(secretText, passphrase), { owner: 'Sam <x>' })
    expect(html).not.toContain('Main VPS renews')
    expect(html).toContain('<title>Handover from Sam &lt;x&gt;</title>')
    expect(html).toContain('const decryptHandover = async function decryptHandover')
  })

  it('embeds a decrypt function that works on its own', async () => {
    const payload = await encryptHandover(secretText, passphrase)
    const html = handoverFileHtml(payload)
    const source = html.match(/const decryptHandover = ([\s\S]*?);\ndocument\.getElementById/)[1]
    const embedded = new Function(`return (${source})`)()
    expect(await embedded(payload, passphrase)).toBe(secretText)
  })
})

describe('lockedHandoverFile', () => {
  it('builds the locked file the server accepts, without the plain text', async () => {
    const { fromV1 } = await import('@holdings/core')
    const data = fromV1({ domains: [{ id: 'd1', name: 'secret-plan.example', renewalDate: '2026-12-01', status: 'Active' }] })
    const html = await lockedHandoverFile(data, { owner: 'Sam', recipient: 'Sara', message: '' }, passphrase)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('decryptHandover')
    expect(html).not.toContain('secret-plan.example')
  })
})
