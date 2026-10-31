import { describe, expect, it } from 'vitest'
import { autoRenewLabel, autoRenewValue, normalizeDomainRecord } from './domain-helpers'
import { getAttentionItems } from './intelligence-helpers'

const inDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const records = (domains) => ({ domains, servers: [], repos: [], projects: [], accounts: [], subscriptions: [] })
const attention = (domain) => getAttentionItems(records([domain]), []).filter((item) => item.id.startsWith('autorenew-off'))

describe('auto-renew on domains', () => {
  it('keeps on, off or not sure, so older data loads as not sure', () => {
    expect(normalizeDomainRecord({ name: 'a.example', autoRenew: 'off' }).autoRenew).toBe('off')
    expect(normalizeDomainRecord({ name: 'a.example', autoRenew: 'maybe' }).autoRenew).toBe('')
    expect(normalizeDomainRecord({ name: 'a.example' }).autoRenew).toBe('')
    expect([autoRenewLabel('on'), autoRenewLabel('off'), autoRenewLabel('')]).toEqual(['On', 'Off', 'Not sure'])
    expect([autoRenewValue(true), autoRenewValue(false), autoRenewValue(null)]).toEqual(['on', 'off', ''])
  })

  it('warns when auto-renew is off and the domain expires within 60 days, urgently within 30', () => {
    const base = { id: 'd1', name: 'shop.example', provider: 'Porkbun', status: 'Active', autoRenew: 'off' }
    expect(attention({ ...base, expiryDate: inDays(20) })[0]).toMatchObject({ priority: 'critical', label: 'Auto-renew is off', detail: 'shop.example' })
    expect(attention({ ...base, expiryDate: inDays(20) })[0].action).toMatch(/Expires in 20 days .* at Porkbun\./)
    expect(attention({ ...base, expiryDate: inDays(45) })[0].priority).toBe('warning')
  })

  it('stays quiet when auto-renew is on or unknown, the domain is far off, expired or cancelled', () => {
    const base = { id: 'd1', name: 'shop.example', status: 'Active', expiryDate: inDays(20) }
    expect(attention({ ...base, autoRenew: 'on' })).toEqual([])
    expect(attention({ ...base, autoRenew: '' })).toEqual([])
    expect(attention({ ...base, autoRenew: 'off', expiryDate: inDays(90) })).toEqual([])
    expect(attention({ ...base, autoRenew: 'off', expiryDate: inDays(-3) })).toEqual([])
    expect(attention({ ...base, autoRenew: 'off', status: 'Cancelled' })).toEqual([])
  })
})

describe('one reminder per domain', () => {
  it('skips the plain renewal reminder for a domain already warned about auto-renew', () => {
    const domain = { id: 'd1', name: 'shop.example', status: 'Active', autoRenew: 'off', renewalDate: inDays(20), expiryDate: inDays(20) }
    const items = getAttentionItems(records([domain]), [{ ...domain, moduleKey: 'domains' }]).filter((item) => item.recordId === 'd1' && item.moduleKey === 'domains' && item.label !== 'DNS not checked yet')
    expect(items.map((item) => item.label)).toEqual(['Auto-renew is off'])
    const on = { ...domain, autoRenew: 'on' }
    expect(getAttentionItems(records([on]), [{ ...on, moduleKey: 'domains' }]).map((item) => item.label)).toContain('Renews in 20 days')
  })
})
