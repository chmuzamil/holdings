import { describe, expect, it } from 'vitest'
import { RECORDS_KEY, SETTINGS_KEY, migrateLegacyStorage } from './storage'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    dump: () => Object.fromEntries(data),
  }
}

describe('migrateLegacyStorage', () => {
  it('copies Founder OS data to the new keys and keeps the old ones', () => {
    const storage = memoryStorage({ 'founder-os-records-v2': '{"domains":[]}', 'founder-os-settings-v1': '{"baseCurrency":"EUR"}' })
    migrateLegacyStorage(storage)
    expect(storage.getItem(RECORDS_KEY)).toBe('{"domains":[]}')
    expect(storage.getItem(SETTINGS_KEY)).toBe('{"baseCurrency":"EUR"}')
    expect(storage.getItem('founder-os-records-v2')).toBe('{"domains":[]}')
  })

  it('prefers the newest legacy key', () => {
    const storage = memoryStorage({ 'founder-os-records-v1': 'old', 'founder-os-records-v2': 'newer' })
    migrateLegacyStorage(storage)
    expect(storage.getItem(RECORDS_KEY)).toBe('newer')
  })

  it('never overwrites data already saved under the new keys', () => {
    const storage = memoryStorage({ [RECORDS_KEY]: 'current', 'founder-os-records-v2': 'legacy' })
    migrateLegacyStorage(storage)
    expect(storage.getItem(RECORDS_KEY)).toBe('current')
  })

  it('does nothing on a fresh browser', () => {
    const storage = memoryStorage()
    migrateLegacyStorage(storage)
    expect(storage.dump()).toEqual({})
  })
})
