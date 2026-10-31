import { describe, expect, it } from 'vitest'
import { applyDomainImport } from './domain-import'
import { previewRegistrar } from './registrar-import'

const porkbun = {
  registrar: 'Porkbun',
  checkedAt: '2026-10-30T10:00:00.000Z',
  warnings: [],
  domains: [
    { name: 'new.example', expiresAt: '2027-01-15', autoRenew: false, locked: false, nameservers: [] },
    { name: 'moved.example', expiresAt: '2027-05-01', autoRenew: true, locked: true, nameservers: [] },
    { name: 'manual.example', expiresAt: '2027-05-01', autoRenew: true, locked: true, nameservers: [] },
    { name: 'blank.example', expiresAt: '2027-02-02', autoRenew: null, locked: null, nameservers: [] },
    { name: 'same.example', expiresAt: '2027-03-03', autoRenew: true, locked: true, nameservers: [] },
  ],
}

const records = {
  domains: [
    { id: 'd_moved', name: 'moved.example', provider: 'Namecheap', renewalDate: '2026-05-01', expiryDate: '2026-05-01' },
    { id: 'd_manual', name: 'manual.example', provider: 'Porkbun', renewalDate: '2026-04-20', expiryDate: '2026-05-01', autoRenew: 'on' },
    { id: 'd_blank', name: 'www.blank.example', provider: '', renewalDate: '', expiryDate: '' },
    { id: 'd_same', name: 'same.example', provider: 'Porkbun', renewalDate: '2027-03-03', expiryDate: '2027-03-03', autoRenew: 'on' },
  ],
}

describe('previewRegistrar', () => {
  const rows = previewRegistrar(porkbun, records)

  it('adds new domains with the registrar, dates and warnings in plain words', () => {
    expect(rows[0]).toMatchObject({ status: 'add', changes: ['expires 2027-01-15', 'auto-renew is OFF', 'transfer lock is off'] })
    expect(rows[0].record).toMatchObject({
      provider: 'Porkbun', cost: 0, renewalDate: '2027-01-15', expiryDate: '2027-01-15',
      autoRenew: 'off', notes: 'Registered at Porkbun. Transfer lock is off.',
    })
  })

  it('updates a stale expiry, moving the renewal date only if it followed the expiry', () => {
    expect(rows[1]).toMatchObject({ status: 'update', id: 'd_moved', patch: { expiryDate: '2027-05-01', renewalDate: '2027-05-01' } })
    expect(rows[1].changes).toEqual(['expiry 2026-05-01 → 2027-05-01', 'renewal 2026-05-01 → 2027-05-01', 'auto-renew on'])
    expect(rows[1].patch).not.toHaveProperty('provider')
    expect(rows[2].patch).toEqual({ expiryDate: '2027-05-01' })
  })

  it('fills in empty fields, matching www. names, and leaves up-to-date domains alone', () => {
    expect(rows[3]).toMatchObject({ status: 'update', id: 'd_blank', patch: { provider: 'Porkbun', expiryDate: '2027-02-02', renewalDate: '2027-02-02' } })
    expect(rows[4]).toMatchObject({ status: 'same', changes: [] })
  })

  it('leaves out anything that looks like a secret', () => {
    const card = ['4242', '4242', '4242', '4242'].join(' ')
    expect(previewRegistrar({ ...porkbun, registrar: card }, { domains: [] })[0]).toMatchObject({ status: 'invalid' })
  })

  it('applies the chosen rows', () => {
    const domains = applyDomainImport(records.domains, rows.filter((row) => row.name !== 'new.example'), new Date('2026-10-30T10:00:00Z'))
    expect(domains.map((domain) => domain.expiryDate)).toEqual(['2027-05-01', '2027-05-01', '2027-02-02', '2027-03-03'])
    expect(domains[1].renewalDate).toBe('2026-04-20')
  })
})

describe('auto-renew from the registrar', () => {
  const result = (autoRenew) => ({ ...porkbun, domains: [{ name: 'same.example', expiresAt: '2027-03-03', autoRenew, locked: true, nameservers: [] }] })
  const existing = (autoRenew) => ({ domains: [{ id: 'd_same', name: 'same.example', provider: 'Porkbun', renewalDate: '2027-03-03', expiryDate: '2027-03-03', autoRenew }] })

  it('updates auto-renew when the registrar says otherwise, saying it once', () => {
    expect(previewRegistrar(result(false), existing('on'))[0]).toMatchObject({ status: 'update', patch: { autoRenew: 'off' }, changes: ['auto-renew off'] })
    expect(previewRegistrar(result(true), existing(''))[0]).toMatchObject({ status: 'update', patch: { autoRenew: 'on' } })
  })

  it('keeps warning while auto-renew stays off, and leaves it alone when the registrar doesn’t say', () => {
    expect(previewRegistrar(result(false), existing('off'))[0]).toMatchObject({ status: 'same', changes: ['auto-renew is OFF'] })
    expect(previewRegistrar(result(null), existing('on'))[0]).toMatchObject({ status: 'same', changes: [] })
  })
})
