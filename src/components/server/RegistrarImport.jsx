import { previewRegistrar } from '../../lib/registrar-import'
import { ProviderImport } from './ProviderImport'

const REGISTRARS = {
  porkbun: {
    label: 'Porkbun',
    fields: [
      { name: 'apiKey', label: 'API key', secret: true },
      { name: 'secretKey', label: 'Secret API key', secret: true },
    ],
    help: (
      <>
        In Porkbun, open <a href="https://porkbun.com/account/api" target="_blank" rel="noreferrer">Account → API Access</a>,
        create an API key and choose the <strong>Read-only</strong> preset.
      </>
    ),
  },
  namecheap: {
    label: 'Namecheap',
    fields: [
      { name: 'apiUser', label: 'Namecheap username' },
      { name: 'apiKey', label: 'API key', secret: true },
      { name: 'clientIp', label: 'This server’s public IP', placeholder: '203.0.113.7' },
    ],
    help: (
      <>
        In Namecheap, open <a href="https://ap.www.namecheap.com/settings/tools/apiaccess/" target="_blank" rel="noreferrer">Profile → Tools →
        Namecheap API Access</a>, turn it on and add this server&apos;s public IP to the whitelist. Namecheap only allows this for
        accounts with 20 or more domains, $50 in the balance, or $50 spent in the last two years. Its keys can&apos;t be limited to
        reading: Holdings only reads, but the key could change your domains, so keep your server locked down.
      </>
    ),
  },
  spaceship: {
    label: 'Spaceship',
    fields: [
      { name: 'apiKey', label: 'API key', secret: true },
      { name: 'apiSecret', label: 'API secret', secret: true },
    ],
    help: (
      <>
        In Spaceship, open <a href="https://www.spaceship.com/application/api-manager/" target="_blank" rel="noreferrer">API Manager</a>
        and create a key with only the <strong>domains:read</strong> scope.
      </>
    ),
  },
}

/** Import domains and expiry dates from Porkbun, Namecheap or Spaceship (self-hosted only). */
export function RegistrarImport({ records, onApply }) {
  return (
    <ProviderImport
      title="Import from your registrar"
      intro="Bring in the domains you have at Porkbun, Namecheap or Spaceship, with their expiry dates. If an expiry date in Holdings is out of date, it is updated. Read-only: Holdings never changes anything at your registrar. You see every domain before anything is added."
      providers={REGISTRARS}
      kind="registrar"
      importPath="/api/import/registrar"
      noun="domain"
      nameLabel="Domain"
      buildPreview={(result) => previewRegistrar(result, records)}
      onApply={onApply}
    />
  )
}
