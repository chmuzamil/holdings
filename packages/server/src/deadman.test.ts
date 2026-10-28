import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { openStore } from './db'
import { createDeadman } from './deadman'
import { createNotifier } from './notify'

const FILE = '<!doctype html><html><script>const decryptHandover = async function decryptHandover() {}</script></html>'
const DAY = 24 * 60 * 60 * 1000
const START = Date.UTC(2026, 9, 1, 12)

function setup({ email = true, failMail = false } = {}) {
  let clock = START
  const store = openStore(':memory:')
  const mails: { to: string; subject: string; text: string; attachments?: { filename: string; content: string }[] }[] = []
  const transport = vi.fn(() => ({
    sendMail: vi.fn(async (mail: (typeof mails)[number]) => {
      if (failMail && mail.attachments) throw new Error('550 mailbox unavailable')
      mails.push(mail)
    }),
  }))
  const notifier = createNotifier({ store, secretKey: randomBytes(32), now: () => new Date(clock), fetch: vi.fn(), transport })
  if (email) notifier.save({ email: { enabled: true, host: 'smtp.mail.example', from: 'holdings@mail.example', to: 'owner@mail.example' } })
  const deadman = createDeadman({ store, notifier, now: () => new Date(clock) })
  return { deadman, mails, at: (days: number) => { clock = START + days * DAY } }
}

function armed(options?: Parameters<typeof setup>[0]) {
  const context = setup(options)
  context.deadman.saveFile(FILE)
  context.deadman.configure({ enabled: true, contactName: 'Sara', contactEmail: 'sara@mail.example', note: 'The passphrase is in the blue notebook.', appUrl: 'https://holdings.example' })
  return context
}

const linkIn = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? ''

describe('turning it on', () => {
  it('needs email, a contact and a locked file', () => {
    const { deadman } = setup({ email: false })
    expect(() => deadman.configure({ enabled: true, contactEmail: 'sara@mail.example' })).toThrow(/email notifications first/)
    const ready = setup()
    expect(() => ready.deadman.configure({ enabled: true, contactEmail: 'nope' })).toThrow(/person you trust/)
    expect(() => ready.deadman.configure({ enabled: true, contactEmail: 'sara@mail.example' })).toThrow(/handover file first/)
    ready.deadman.saveFile(FILE)
    expect(ready.deadman.configure({ enabled: true, contactEmail: 'sara@mail.example' }).enabled).toBe(true)
  })

  it('only accepts a locked handover file', () => {
    const { deadman } = setup()
    expect(() => deadman.saveFile('<html>plain text</html>')).toThrow(/locked handover file/)
    expect(deadman.saveFile(FILE).hasFile).toBe(true)
  })

  it('stays off by default and does nothing', async () => {
    const { deadman, mails, at } = setup()
    at(400)
    expect(await deadman.check()).toEqual({ action: 'none' })
    expect(mails).toEqual([])
  })
})

describe('the timeline (check in every 30 days, 14 days grace)', () => {
  it('reminds the owner with a link, then sends the file to the contact once', async () => {
    const { deadman, mails, at } = armed()
    at(29)
    expect((await deadman.check()).action).toBe('none')

    at(30)
    expect(await deadman.check()).toMatchObject({ action: 'reminded', stage: 'due' })
    expect(mails.at(-1)).toMatchObject({ to: 'owner@mail.example', subject: 'Check in to Holdings' })
    expect(mails.at(-1)?.text).toContain('goes to Sara on 2026-11-14')
    expect(mails.at(-1)?.text).toContain('https://holdings.example/api/deadman/checkin?token=')
    expect((await deadman.check()).action).toBe('none')

    at(37)
    expect(await deadman.check()).toMatchObject({ stage: 'halfway' })
    at(43)
    expect(await deadman.check()).toMatchObject({ stage: 'last' })
    expect(mails.at(-1)?.subject).toBe('Last reminder: check in to Holdings today')

    at(44)
    expect(await deadman.check()).toEqual({ action: 'sent' })
    const sent = mails.find((mail) => mail.to === 'sara@mail.example')
    expect(sent?.subject).toBe('A handover file has been left for you')
    expect(sent?.text).toContain('The passphrase is in the blue notebook.')
    expect(sent?.attachments?.[0]).toMatchObject({ filename: 'handover.html', content: FILE })
    expect(mails.at(-1)).toMatchObject({ to: 'owner@mail.example', subject: 'Your handover file was sent' })

    at(60)
    expect((await deadman.check()).action).toBe('none')
    expect(mails.filter((mail) => mail.to === 'sara@mail.example')).toHaveLength(1)
  })

  it('resets when the owner checks in, from the link or by using Holdings', async () => {
    const { deadman, mails, at } = armed()
    at(30)
    await deadman.check()
    const token = linkIn(mails.at(-1)?.text ?? '')
    expect(deadman.checkInWithLink('made-up')).toBeNull()
    expect(deadman.checkInWithLink(token)).toEqual({ wasTriggered: false })
    // The link works once: checking in clears it.
    expect(deadman.checkInWithLink(token)).toBeNull()
    at(59)
    expect((await deadman.check()).action).toBe('none')
    expect(deadman.view().dueAt).toBe(new Date(START + 60 * DAY).toISOString())

    at(89)
    deadman.touch()
    at(100)
    expect((await deadman.check()).action).toBe('none')
  })

  it('tries again if sending fails, and tells the owner', async () => {
    const { deadman, mails, at } = armed({ failMail: true })
    at(44)
    expect(await deadman.check()).toMatchObject({ action: 'failed', error: expect.stringContaining('550') })
    expect(mails.at(-1)?.subject).toBe('Holdings couldn’t send your handover file')
    expect(deadman.view().triggeredAt).toBeNull()
  })

  it('turns itself back on when the owner checks in after it was sent', async () => {
    const { deadman, at } = armed()
    at(44)
    await deadman.check()
    deadman.touch()
    expect(deadman.view().triggeredAt).not.toBeNull()
    expect(deadman.checkIn()).toBe(true)
    const view = deadman.view()
    expect(view.triggeredAt).toBeNull()
    expect(view.lastTriggeredAt).not.toBeNull()
  })

  it('never shows link secrets', () => {
    const { deadman } = armed()
    expect(Object.keys(deadman.view())).not.toContain('linkHashes')
  })
})
