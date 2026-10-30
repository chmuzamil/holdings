import { fetchLatestRates } from '../../lib/currency'
import { neededCurrencies, previewHosts } from '../../lib/host-import'
import { ProviderImport } from './ProviderImport'

const HOSTS = {
  hetzner: {
    label: 'Hetzner',
    fields: [{ name: 'token', label: 'API token', secret: true }],
    help: (
      <>
        In the <a href="https://console.hetzner.cloud/" target="_blank" rel="noreferrer">Hetzner Cloud Console</a>, open
        the project, then <strong>Security → API tokens</strong>, and create a token with <strong>Read</strong> permission.
        Each project needs its own token; Hetzner Robot (dedicated servers) isn&apos;t covered.
      </>
    ),
  },
  digitalocean: {
    label: 'DigitalOcean',
    fields: [{ name: 'token', label: 'API token', secret: true }],
    help: (
      <>
        In DigitalOcean, open <a href="https://cloud.digitalocean.com/account/api/tokens" target="_blank" rel="noreferrer">API → Tokens</a>,
        generate a token with <strong>Custom scopes</strong> and tick only <strong>droplet: read</strong>.
      </>
    ),
  },
  custom: {
    label: 'Custom URL',
    option: 'Custom URL (any other host)',
    fields: [
      { name: 'url', label: 'URL', type: 'url', placeholder: 'https://inventory.example/servers.json' },
      { name: 'token', label: 'Token (optional, sent as a Bearer header)', secret: true, optional: true },
    ],
    help: (
      <>
        For any other host (Vultr, Linode, OVH, a home lab): a URL that answers with JSON like{' '}
        <code>{'{"servers": [{"name": "web-1", "ip": "192.0.2.10", "provider": "Vultr", "monthlyCost": 6, "currency": "USD"}]}'}</code>.
        Your own script or inventory can produce it; the full format is in docs/self-hosting.md. Only your server reads it.
      </>
    ),
  },
}

/** Import servers from Hetzner Cloud, DigitalOcean or a custom URL (self-hosted only). */
export function HostImport({ records, ratesPerUsd, onApply }) {
  async function buildPreview(result) {
    // Costs are stored in USD; fetch today's rate if a host bills in a currency we have no rate for yet.
    let rates = ratesPerUsd ?? {}
    if (neededCurrencies(result, rates).length) rates = { ...rates, ...(await fetchLatestRates().catch(() => ({}))) }
    return previewHosts(result, records, rates)
  }

  return (
    <ProviderImport
      title="Import servers"
      intro="Bring in your servers from Hetzner Cloud, DigitalOcean, or any other host through a URL you control, with specs, IP, location and monthly price. Servers you already track are matched by IP or name, and only empty details are filled in. Read-only: Holdings never changes anything at your host. You see every server before anything is added."
      providers={HOSTS}
      kind="host"
      importPath="/api/import/host"
      noun="server"
      nameLabel="Server"
      buildPreview={buildPreview}
      onApply={onApply}
    />
  )
}
