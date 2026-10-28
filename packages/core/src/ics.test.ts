import { describe, expect, it } from 'vitest'
import { buildCalendar, calendarEvents, escapeText, foldLine, utf8Length } from './ics'
import { fromV1 } from './migrate'

const data = fromV1({
  projects: [{ id: 'p1', name: 'Shop', domainIds: ['d1'] }, { id: 'p2', name: 'News', subscriptionIds: ['s1'] }],
  domains: [{ id: 'd1', name: 'shop.example', provider: 'Porkbun', cost: 12, renewalDate: '2026-11-05', expiryDate: '2026-11-20', status: 'Active' }],
  subscriptions: [
    { id: 's1', name: 'Mail, Inc; "Pro"', provider: 'Postmark', cost: 15, renewalDate: '2026-11-10', status: 'Active' },
    { id: 's2', name: 'Gone', cost: 5, renewalDate: '2026-11-11', status: 'Cancelled' },
  ],
  keys: [{ id: 'k1', name: 'Visa ending 4242', keyType: 'Payment card', expiryDate: '2026-12-31', status: 'Active' }],
})
const NOW = new Date('2026-10-29T10:00:00Z')

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf')
  })
})

describe('utf8Length', () => {
  it('counts bytes like UTF-8', () => {
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4)
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds at 75 octets with CRLF and a space', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`)
    const lines = folded.split('\r\n')
    expect(lines.every((line) => utf8Length(line) <= 75)).toBe(true)
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true)
    expect(lines.map((line, index) => (index ? line.slice(1) : line)).join('')).toBe(`DESCRIPTION:${'x'.repeat(200)}`)
  })

  it('counts bytes, not characters, and never splits a character', () => {
    const line = `SUMMARY:${'é€😀'.repeat(20)}`
    const lines = foldLine(line).split('\r\n')
    expect(lines.every((part) => utf8Length(part) <= 75)).toBe(true)
    expect(lines.map((part, index) => (index ? part.slice(1) : part)).join('')).toBe(line)
  })
})

describe('calendarEvents', () => {
  it('lists renewals and expiries, skipping cancelled items', () => {
    expect(calendarEvents(data).map((event) => `${event.date} ${event.summary}`)).toEqual([
      '2026-11-05 shop.example renews',
      '2026-11-10 Mail, Inc; "Pro" renews',
      '2026-11-20 shop.example expires',
      '2026-12-31 Visa ending 4242 expires',
    ])
  })

  it('can hold one item', () => {
    expect(calendarEvents(data, { assetId: 'd1' }).map((event) => event.uid)).toEqual(['d1-renews@holdings.local', 'd1-expires@holdings.local'])
  })

  it('filters by project', () => {
    expect(calendarEvents(data, { projectId: 'p2' }).map((event) => event.uid)).toEqual(['s1-renews@holdings.local'])
  })
})

describe('buildCalendar', () => {
  const ics = buildCalendar(data, { alarmDays: 7, now: NOW })

  it('is a valid calendar with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(ics.split('\r\n').every((line) => utf8Length(line) <= 75)).toBe(true)
  })

  it('uses all-day dates', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101')
  })

  it('escapes text', () => {
    expect(ics).toContain('SUMMARY:Mail\\, Inc\\; "Pro" renews')
  })

  it('adds a reminder N days before, or none', () => {
    expect(ics.match(/TRIGGER:-P7D/g)).toHaveLength(4)
    expect(buildCalendar(data, { now: NOW })).not.toContain('VALARM')
  })

  it('keeps UIDs stable, so a changed date updates the same event', () => {
    const moved = fromV1({ domains: [{ id: 'd1', name: 'shop.example', renewalDate: '2027-11-05', status: 'Active' }] })
    const later = buildCalendar(moved, { now: new Date('2027-01-01T00:00:00Z') })
    expect(later).toContain('UID:d1-renews@holdings.local')
    expect(ics).toContain('UID:d1-renews@holdings.local')
    expect(buildCalendar(data, { alarmDays: 7, now: NOW })).toBe(ics)
  })
})
