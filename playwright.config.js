import { defineConfig } from '@playwright/test'

// Browser smoke test of the demo build: every page loads without errors.
// Run with: npm run build:demo && npm run test:browser
// In CI it uses Playwright's Chromium; locally, the Microsoft Edge you have.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.pw.js',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    ...(process.env.CI ? {} : { channel: 'msedge' }),
  },
  webServer: {
    command: 'npx vite preview --port 4174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
})
