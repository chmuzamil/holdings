import { describe, expect, it } from 'vitest'
import { statusByItem, suggestLinks } from './uptime'

const monitors = [
  { key: 'kuma:3', name: 'Main VPS', status: 'up' },
  { key: 'kuma:4', name: 'shopfront.example', status: 'down' },
  { key: 'kuma:5', name: 'Something else', status: 'up' },
]

describe('uptime links', () => {
  it('maps linked items to their monitor, ignoring links to monitors that are gone', () => {
    expect(statusByItem(monitors, { 'kuma:3': 'server_main', 'kuma:9': 'server_old' })).toEqual({ server_main: monitors[0] })
  })

  it('suggests links by matching names, without touching existing links', () => {
    const items = [{ id: 'server_main', name: 'main vps' }, { id: 'domain_shop', name: 'Shopfront.example' }]
    expect(suggestLinks(monitors, items)).toEqual({ 'kuma:3': 'server_main', 'kuma:4': 'domain_shop' })
    expect(suggestLinks(monitors, items, { 'kuma:3': 'something' })).toEqual({ 'kuma:4': 'domain_shop' })
  })
})
