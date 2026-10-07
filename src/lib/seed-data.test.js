import { describe, expect, it } from 'vitest'
import { getSeedRecords } from './seed-data'

const now = new Date('2026-10-07T12:00:00Z')
const seed = getSeedRecords(now)
const text = JSON.stringify(seed)

describe('demo data', () => {
  it('only uses reserved .example domains', () => {
    const hosts = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) || []
    const real = hosts.filter((host) => !/\.example$/i.test(host) && !/^github\.com$/i.test(host))
    expect(real).toEqual([])
  })

  it('only uses TEST-NET IP addresses', () => {
    const ips = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []
    expect(ips.length).toBeGreaterThan(0)
    ips.forEach((ip) => expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./))
  })

  it('contains no email addresses', () => {
    expect(text).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  })

  it('only links to records that exist', () => {
    const ids = new Set(Object.values(seed).flat().map((item) => item.id))
    const linkKeys = /^(domainIds|repoIds|serverIds|subscriptionIds|connected\w+Ids)$/
    Object.values(seed).flat().forEach((item) => {
      Object.entries(item).forEach(([key, value]) => {
        if (linkKeys.test(key)) value.forEach((id) => expect(ids, `${item.id}.${key}`).toContain(id))
      })
      ;(item.subdomains || []).forEach((sub) => {
        if (sub.serverId) expect(ids).toContain(sub.serverId)
      })
    })
  })

  it('moves its dates along with today', () => {
    const later = getSeedRecords(new Date('2027-01-01T12:00:00Z'))
    expect(later.domains[0].renewalDate).not.toBe(seed.domains[0].renewalDate)
    expect(seed.domains[0].renewalDate).toBe('2026-10-16')
  })
})
