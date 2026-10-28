import { describe, expect, it } from 'vitest'
import { cleanupSuggestions } from './cleanup'
import { fromV1 } from './migrate'

const data = fromV1({
  projects: [
    { id: 'p_live', name: 'Shop', status: 'Production', subscriptionIds: ['s_mail', 's_vercel_a'], serverIds: ['srv_main'] },
    { id: 'p_old', name: 'Old app', status: 'Archived', subscriptionIds: ['s_old_db'], serverIds: ['srv_main'] },
  ],
  servers: [
    { id: 'srv_main', name: 'Main VPS', provider: 'Hetzner', cost: 10, status: 'Active' },
    { id: 'srv_spare', name: 'Spare VPS', provider: 'Hetzner', cost: 6, status: 'Active' },
  ],
  subscriptions: [
    { id: 's_mail', name: 'Postmark', provider: 'Postmark', cost: 15, status: 'Active' },
    { id: 's_vercel_a', name: 'Vercel Pro', provider: 'Vercel', cost: 20, status: 'Active' },
    { id: 's_vercel_b', name: 'Vercel Pro (old team)', provider: 'vercel ', cost: 20, status: 'Active' },
    { id: 's_old_db', name: 'Old database', provider: 'Neon', cost: 19, status: 'Active' },
    { id: 's_figma', name: 'Figma', provider: 'Figma', cost: 15, status: 'Active', keepWithoutProject: true },
    { id: 's_gone', name: 'Old CDN', provider: 'Fastly', cost: 50, status: 'Cancelled', renewalDate: '2026-11-15' },
    { id: 's_free', name: 'Free tier', provider: 'Supabase', cost: 0, status: 'Active' },
  ],
  domains: [{ id: 'd_spare', name: 'spare.example', provider: 'Porkbun', cost: 12, status: 'Active' }],
})

const result = cleanupSuggestions(data, '2026-10-29')
const find = (reason: string, id: string) => result.suggestions.find((item) => item.reason === reason && item.assets.some((asset) => asset.id === id))

describe('cleanupSuggestions', () => {
  it('finds paid items no project uses, with what stopping them saves', () => {
    expect(find('unused', 'srv_spare')?.savingMonthlyUsd).toBe(6)
    expect(find('unused', 's_vercel_b')?.savingMonthlyUsd).toBe(20)
    // Yearly domains count a twelfth a month.
    expect(find('unused', 'd_spare')?.savingMonthlyUsd).toBe(1)
  })

  it('skips free, cancelled and "for everything" items', () => {
    expect(find('unused', 's_free')).toBeUndefined()
    expect(find('unused', 's_gone')).toBeUndefined()
    expect(find('unused', 's_figma')).toBeUndefined()
  })

  it('finds items only archived projects use, but not shared ones', () => {
    expect(find('archived-only', 's_old_db')).toMatchObject({ savingMonthlyUsd: 19, projects: ['Old app'] })
    expect(find('archived-only', 'srv_main')).toBeUndefined()
  })

  it('groups subscriptions with the same provider, without claiming a saving', () => {
    const duplicate = find('duplicate', 's_vercel_a')
    expect(duplicate?.assets.map((asset) => asset.id).sort()).toEqual(['s_vercel_a', 's_vercel_b'])
    expect(duplicate?.savingMonthlyUsd).toBeNull()
  })

  it('flags items marked cancelled that still show a renewal ahead', () => {
    expect(find('cancelled-but-renews', 's_gone')).toBeDefined()
    expect(cleanupSuggestions(data, '2026-12-01').suggestions.some((item) => item.reason === 'cancelled-but-renews')).toBe(false)
  })

  it('adds up only the known savings, and lists the important ones first', () => {
    expect(result.savingMonthlyUsd).toBe(46)
    expect(result.suggestions[0]?.reason).toBe('cancelled-but-renews')
    expect(result.suggestions.at(-1)?.reason).toBe('duplicate')
  })
})
