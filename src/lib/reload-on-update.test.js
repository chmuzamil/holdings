import { describe, expect, it, vi } from 'vitest'
import { handlePreloadError } from './reload-on-update'

function memoryStorage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) }
}

describe('handlePreloadError', () => {
  it('reloads once to load the new version, and stops the error from showing', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    const event = { preventDefault: vi.fn() }
    expect(handlePreloadError(event, { storage, reload, now: 1_000_000 })).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('never loops: a second error right after a reload is left to show', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    handlePreloadError({ preventDefault() {} }, { storage, reload, now: 1_000_000 })
    expect(handlePreloadError({ preventDefault() {} }, { storage, reload, now: 1_010_000 })).toBe(false)
    expect(handlePreloadError({ preventDefault() {} }, { storage, reload, now: 1_100_000 })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does nothing when storage is blocked, since it couldn’t guard against a loop', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const reload = vi.fn()
    expect(handlePreloadError({ preventDefault() {} }, { storage, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
