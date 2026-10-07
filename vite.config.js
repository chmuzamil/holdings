import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.HOLDINGS_API_PORT || process.env.FOUNDER_OS_API_PORT || 4180

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run api` serves domain lookups; proxy them so the app stays same-origin.
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
