import { useEffect, useState } from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import { api } from '../../lib/server-api'
import { importedMessage } from '../../lib/domain-import'
import { ImportPreview } from './ImportPreview'

/**
 * A Settings panel for read-only imports from providers that each need their
 * own keys (registrars, server hosts): connect one or more, check each, see
 * a preview, import what you tick. Self-hosted only.
 */
export function ProviderImport({ title, intro, providers, kind, importPath, noun, nameLabel, buildPreview, onApply }) {
  const [state, setState] = useState(null)
  const [adding, setAdding] = useState('')
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState('')
  const statusPath = `/api/integrations/${kind}s`

  useEffect(() => {
    api('GET', statusPath).then(setState).catch((error) => setMessage({ tone: 'error', text: error.message }))
  }, [statusPath])

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
    const result = await api('GET', `${importPath}?${kind}=${id}`)
    setPreview({ key: `${id}-${result.checkedAt}`, id, rows: await buildPreview(result), warnings: result.warnings })
  })

  const disconnect = (id) => run(`disconnect-${id}`, async () => {
    await api('DELETE', `${statusPath}?${kind}=${id}`)
    setState((current) => ({ ...current, [id]: { connected: false } }))
    if (preview?.id === id) setPreview(null)
  }, `Disconnected ${providers[id].label}. Its keys were deleted from your server.`)

  function confirm(selected) {
    onApply(selected)
    setPreview(null)
    setMessage({ tone: 'ok', text: importedMessage(selected, noun) })
  }

  if (!state) return message.text ? <p className="auth-error" role="alert">{message.text}</p> : null
  const ids = Object.keys(providers)
  const connected = ids.filter((id) => state[id]?.connected)
  const available = ids.filter((id) => !state[id]?.connected)
  const form = adding && providers[adding]
  const status = message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{intro}</p>
      </div>

      {connected.map((id) => (
        <div key={id} className="settings-actions">
          <span className="checklist"><span>{providers[id].label}: connected with a {state[id].hint}</span></span>
          <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => check(id)}>
            <RefreshCw size={16} />
            {busy === `check-${id}` ? 'Reading…' : `Check ${providers[id].label}`}
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
          nameLabel={nameLabel}
          emptyText={`Nothing found at ${providers[preview.id].label}.`}
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
              const result = await api('PUT', statusPath, { [kind]: id, credentials })
              setState((current) => ({ ...current, [id]: result }))
              setAdding('')
            }, `Connected ${providers[id].label}. Press Check to see what can be imported.`)
          }}
        >
          <label>
            <span>{connected.length ? 'Connect another' : 'Connect'}</span>
            <select value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Choose…</option>
              {available.map((id) => <option key={id} value={id}>{providers[id].option ?? providers[id].label}</option>)}
            </select>
          </label>
          {form && (
            <>
              {form.fields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    type={field.secret ? 'password' : field.type ?? 'text'}
                    required={!field.optional}
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
