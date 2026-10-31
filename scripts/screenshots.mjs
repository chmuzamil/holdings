// Takes the README screenshots from the demo build, so they can be redone
// after a change: npm run build:demo, start npx vite preview --port 4174,
// then node scripts/screenshots.mjs. Uses the installed Microsoft Edge
// (set BROWSER_CHANNEL=chrome for Chrome). Writes docs/screenshots/*.png.

import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4174'
const OUT = new URL('../docs/screenshots/', import.meta.url)

const SHOTS = [
  { file: 'dashboard.png', hash: 'dashboard' },
  { file: 'projects.png', hash: 'projects' },
  {
    file: 'what-if.png',
    hash: 'impact',
    prepare: async (page) => {
      const picker = page.locator('select').first()
      await picker.selectOption({ label: 'Business Visa' })
    },
  },
  { file: 'domains.png', hash: 'domains' },
  { file: 'infrastructure-map.png', hash: 'infrastructure-map' },
  { file: 'insights.png', hash: 'insights' },
  { file: 'expiring.png', hash: 'expiring' },
  { file: 'attention.png', hash: 'attention' },
]

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const page = await context.newPage()

// Fresh demo data, so dates are relative to today.
await page.goto(BASE)
await page.evaluate(() => localStorage.clear())

for (const shot of SHOTS) {
  await page.goto(`${BASE}/#${shot.hash}`)
  await page.reload()
  await page.getByRole('heading', { level: 1 }).waitFor()
  await shot.prepare?.(page)
  // Let lazy content and fonts settle.
  await page.waitForTimeout(600)
  await page.screenshot({ path: new URL(shot.file, OUT).pathname.replace(/^\/([A-Z]:)/, '$1') })
  console.log(`docs/screenshots/${shot.file}`)
}

await browser.close()
