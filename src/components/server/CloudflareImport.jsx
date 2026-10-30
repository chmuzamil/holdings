import { useEffect, useState } from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import { api } from '../../lib/server-api'
import { previewCloudflare } from '../../lib/cloudflare-import'
import { importedMessage } from '../../lib/domain-import'
import { ImportPreview } from './ImportPreview'

const TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

/** Import domains, DNS and registrar details from Cloudflare (self-hosted only). */
export function CloudflareImport({ records, onApply }) {
  const [state, setState] = useState(null)
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('GET', '/api/integrations/cloudflare').then(setState).catch((error) => setMessage({ tone: 'error', text: error.message }))
  }, [])

  async function run(work, done) {
    setBusy(true)
    setMessage({ tone: '', text: '' })
    try {
      await work()
      if (done) setMessage({ tone: 'ok', text: done })
      return true
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const check = () => run(async () => {
    const result = await api('GET', '/api/import/cloudflare')
    setPreview({ key: result.checkedAt, rows: previewCloudflare(result, records), warnings: result.warnings })
  })

  function confirm(selected) {
    onApply(selected)
    setPreview(null)
    setMessage({ tone: 'ok', text: importedMessage(selected) })
  }

  if (!state) return message.text ? <p className="auth-error" role="alert">{message.text}</p> : null
  const status = message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Import from Cloudflare</h2>
        <p>
          Bring in your Cloudflare zones as domains, with subdomains from your DNS records (linked to your servers
          by IP), and expiry dates for domains registered at Cloudflare. Read-only: Holdings can&apos;t change anything there.
          You see everything before it is added.
        </p>
      </div>

      {!state.connected ? (
        <form
          className="settings-form account-form"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const token = new FormData(form).get('token')
            run(async () => setState(await api('PUT', '/api/integrations/cloudflare', { token })), 'Connected. Press Check Cloudflare to see what can be imported.').then((ok) => ok && form.reset())
          }}
        >
          <label>
            <span>API token</span>
            <input name="token" type="password" required autoComplete="off" spellCheck="false" />
          </label>
          <div className="settings-actions notify-actions">
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
          </div>
          <p className="settings-status">
            In Cloudflare, open <a href={TOKENS_URL} target="_blank" rel="noreferrer">My Profile → API Tokens</a> and create a
            custom token with <strong>Zone: Read</strong> and <strong>DNS: Read</strong>, plus <strong>Account → Registrar:
            Read</strong> for expiry dates. Not the Global API Key. It is stored encrypted on your server and never shown again.
          </p>
          {status}
        </form>
      ) : (
        <>
          <div className="checklist"><span>Connected with a {state.hint}</span></div>
          <div className="settings-actions">
            <button className="primary-button" type="button" disabled={busy} onClick={check}>
              <RefreshCw size={16} />
              {busy ? 'Reading Cloudflare…' : 'Check Cloudflare'}
            </button>
            <button className="ghost-button" type="button" disabled={busy} onClick={() => run(async () => {
              setState(await api('DELETE', '/api/integrations/cloudflare'))
              setPreview(null)
            }, 'Disconnected. The token was deleted from your server.')}>
              <Unplug size={16} />
              Disconnect
            </button>
          </div>
          {preview?.warnings.map((warning) => <p key={warning} className="settings-status runbook-warning">{warning}</p>)}
          {preview && <ImportPreview key={preview.key} rows={preview.rows} emptyText="No zones found in Cloudflare." onConfirm={confirm} onCancel={() => setPreview(null)} />}
          {status}
        </>
      )}
    </div>
  )
}
