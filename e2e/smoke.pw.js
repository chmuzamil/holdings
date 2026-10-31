import { expect, test } from '@playwright/test'

// Every page of the demo build opens with its title and without errors. This
// catches what unit tests can't: a component that throws while rendering, a
// lazy-loaded page that fails to load, a broken import.

const PAGES = [
  ['dashboard', 'Overview'],
  ['insights', 'Insights'],
  ['attention', 'Attention'],
  ['expiring', 'Expiring'],
  ['timeline', 'Timeline'],
  ['infrastructure-map', 'Map'],
  ['impact', 'What breaks if…'],
  ['packs', 'Handover & exit'],
  ['projects', 'Projects'],
  ['domains', 'Domains'],
  ['servers', 'Servers'],
  ['repos', 'Repos'],
  ['keys', 'Keys & cards'],
  ['subscriptions', 'Subscriptions'],
  ['accounts', 'Accounts'],
  ['settings', 'Settings'],
]

/** Collects page errors and console errors while a test runs. */
function watchErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test.beforeEach(async ({ page }) => {
  // Start from the demo's own made-up data every time.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('smoke-started')) {
      localStorage.clear()
      sessionStorage.setItem('smoke-started', '1')
    }
  })
})

for (const [hash, title] of PAGES) {
  test(`${hash} page opens without errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(`/#${hash}`)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByText('This is a demo with made-up data')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('a domain opens in its details panel and edit form', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#domains')
  const card = page.locator('article, .domain-card').filter({ hasText: 'cityguide.example' }).first()
  await card.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByText('Auto-renew', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await card.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByLabel('Auto-renew')).toHaveValue('off')
  expect(errors).toEqual([])
})

test('the command palette finds a domain', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await page.keyboard.press('Control+K')
  await page.getByRole('combobox').fill('cityguide')
  await expect(page.getByRole('option', { name: /cityguide\.example/ }).first()).toBeVisible()
  expect(errors).toEqual([])
})
