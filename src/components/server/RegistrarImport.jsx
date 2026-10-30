import { useEffect, useState } from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import { api } from '../../lib/server-api'
import { importedMessage } from '../../lib/domain-import'
import { previewRegistrar } from '../../lib/registrar-import'
import { ImportPreview } from './ImportPreview'

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
  const [state, setState] = useState(null)
  const [adding, setAdding] = useState('')
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api('GET', '/api/integrations/registrars').then(setState).catch((error) => setMessage({ tone: 'error', text: error.message }))
  }, [])

  async function run(what, work, done) {
    setBusy(what)
    setMessage({ tone: '', text: '' })
    try {
      await work()
      if (done) setMessage({ tone: 'ok', text: done })
      return true
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
      return false
    } finally {
      setBusy('')
    }
  }

  const check = (id) => run(`check-${id}`, async () => {
    const result = await api('GET', `/api/import/registrar?registrar=${id}`)
    setPreview({ key: `${id}-${result.checkedAt}`, id, rows: previewRegistrar(result, records), warnings: result.warnings })
  })

  const disconnect = (id) => run(`disconnect-${id}`, async () => {
    await api('DELETE', `/api/integrations/registrars?registrar=${id}`)
    setState((current) => ({ ...current, [id]: { connected: false } }))
    if (preview?.id === id) setPreview(null)
  }, `Disconnected ${REGISTRARS[id].label}. Its keys were deleted from your server.`)

  function confirm(selected) {
    onApply(selected)
    setPreview(null)
    setMessage({ tone: 'ok', text: importedMessage(selected) })
  }

  if (!state) return message.text ? <p className="auth-error" role="alert">{message.text}</p> : null
  const connected = Object.keys(REGISTRARS).filter((id) => state[id]?.connected)
  const available = Object.keys(REGISTRARS).filter((id) => !state[id]?.connected)
  const form = adding && REGISTRARS[adding]
  const status = message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Import from your registrar</h2>
        <p>
          Bring in the domains you have at Porkbun, Namecheap or Spaceship, with their expiry dates. If an expiry date in
          Holdings is out of date, it is updated. Read-only: Holdings never changes anything at your registrar. You see
          every domain before anything is added.
        </p>
      </div>

      {connected.map((id) => (
        <div key={id} className="settings-actions">
          <span className="checklist"><span>{REGISTRARS[id].label}: connected with a {state[id].hint}</span></span>
          <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => check(id)}>
            <RefreshCw size={16} />
            {busy === `check-${id}` ? `Reading ${REGISTRARS[id].label}…` : `Check ${REGISTRARS[id].label}`}
          </button>
          <button className="ghost-button" type="button" disabled={Boolean(busy)} onClick={() => disconnect(id)}>
            <Unplug size={16} />
            Disconnect
          </button>
        </div>
      ))}

      {preview?.warnings.map((warning) => <p key={warning} className="settings-status runbook-warning">{warning}</p>)}
      {preview && (
        <ImportPreview
          key={preview.key}
          rows={preview.rows}
          emptyText={`No domains found at ${REGISTRARS[preview.id].label}.`}
          onConfirm={confirm}
          onCancel={() => setPreview(null)}
        />
      )}

      {available.length > 0 && (
        <form
          key={adding}
          className="settings-form account-form registrar-connect"
          onSubmit={(event) => {
            event.preventDefault()
            const id = adding
            const credentials = Object.fromEntries(new FormData(event.currentTarget))
            run('connect', async () => {
              const result = await api('PUT', '/api/integrations/registrars', { registrar: id, credentials })
              setState((current) => ({ ...current, [id]: result }))
              setAdding('')
            }, `Connected ${REGISTRARS[id].label}. Press Check ${REGISTRARS[id].label} to see what can be imported.`)
          }}
        >
          <label>
            <span>{connected.length ? 'Connect another registrar' : 'Connect a registrar'}</span>
            <select value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Choose…</option>
              {available.map((id) => <option key={id} value={id}>{REGISTRARS[id].label}</option>)}
            </select>
          </label>
          {form && (
            <>
              {form.fields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    type={field.secret ? 'password' : 'text'}
                    required
                    autoComplete="off"
                    spellCheck="false"
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
              <div className="settings-actions notify-actions">
                <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'connect' ? 'Checking…' : 'Connect'}</button>
              </div>
              <p className="settings-status">{form.help} Keys are stored encrypted on your server and never shown again.</p>
            </>
          )}
        </form>
      )}
      {status}
    </div>
  )
}
