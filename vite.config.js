import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.HOLDINGS_API_PORT || process.env.FOUNDER_OS_API_PORT || 4180

const TITLE = 'Holdings: track domains, servers, repos and costs for your side projects'
const DESCRIPTION = 'Everything your side projects run on, in one place: domains, servers, repos, subscriptions and what each project costs.'

// Public sites (the demo) set VITE_SITE_URL and get link-preview tags, a
// canonical URL, structured data and a sitemap. Every other build is
// somebody's private install, so its robots.txt asks search engines to stay out.
function siteMeta(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/$/, '')

  return {
    name: 'holdings-site-meta',
    transformIndexHtml() {
      if (!siteUrl) return []
      const meta = (attrs) => ({ tag: 'meta', attrs, injectTo: 'head' })
      const image = `${siteUrl}/og.png`
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
        meta({ property: 'og:type', content: 'website' }),
        meta({ property: 'og:site_name', content: 'Holdings' }),
        meta({ property: 'og:title', content: TITLE }),
        meta({ property: 'og:description', content: DESCRIPTION }),
        meta({ property: 'og:url', content: `${siteUrl}/` }),
        meta({ property: 'og:image', content: image }),
        meta({ property: 'og:image:width', content: '1200' }),
        meta({ property: 'og:image:height', content: '630' }),
        meta({ property: 'og:image:alt', content: 'Holdings: everything your side projects run on.' }),
        meta({ name: 'twitter:card', content: 'summary_large_image' }),
        meta({ name: 'twitter:image', content: image }),
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Holdings',
            description: DESCRIPTION,
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Web',
            url: `${siteUrl}/`,
            codeRepository: 'https://github.com/chmuzamil/holdings',
            license: 'https://opensource.org/licenses/MIT',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }),
          injectTo: 'head',
        },
      ]
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: siteUrl ? `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
      })
      if (siteUrl) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc></url>\n</urlset>\n`,
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteMeta(mode)],
  server: {
    // `npm run api` serves domain lookups; proxy them so the app stays same-origin.
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
}))
