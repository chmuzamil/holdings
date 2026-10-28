import { useEffect, useState } from 'react'
import { Switch } from '../ui/Switch'
import { api } from '../../lib/server-api'

const INTERVALS = [[6, 'Every 6 hours'], [12, 'Every 12 hours'], [24, 'Once a day'], [72, 'Every 3 days'], [168, 'Once a week']]

/** Scheduled domain change watch (self-hosted only), off until turned on. */
export function DomainWatchSettings({ onChanges }) {
  const [view, setView] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('GET', '/api/domain-watch').then(setView).catch((error) => setMessage({ tone: 'error', text: error.message }))
  }, [])

  async function run(work, done) {
    setBusy(true)
    setMessage({ tone: '', text: '' })
    try {
      const next = await work()
      setView(next)
      onChanges?.(next.changes)
      setMessage({ tone: 'ok', text: typeof done === 'function' ? done(next) : done })
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  if (!view) return message.text ? <p className="auth-error" role="alert">{message.text}</p> : null
  const { settings } = view

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Domain watch</h2>
        <p>
          Check every domain on a schedule and tell you when nameservers, registry status, expiry, DNSSEC or the transfer lock
          change. Changes appear on each domain and, if important, on the Attention page; notifications go to the channels
          you turned on above. Optional, and off until you turn it on.
        </p>
      </div>
      <Switch
        checked={settings.enabled}
        onChange={(on) => run(() => api('PUT', '/api/domain-watch', { enabled: on }), on ? 'On. The first check runs within 15 minutes.' : 'Turned off.')}
        label={settings.enabled ? 'On' : 'Turn on'}
        disabled={busy}
      />
      {settings.enabled && (
        <div className="settings-form account-form notify-schedule">
          <label>
            <span>Check</span>
            <select value={settings.intervalHours} onChange={(event) => run(() => api('PUT', '/api/domain-watch', { intervalHours: Number(event.target.value) }), 'Saved.')}>
              {INTERVALS.map(([hours, label]) => <option key={hours} value={hours}>{label}</option>)}
            </select>
          </label>
          <div className="settings-actions notify-actions">
            <button className="ghost-button" type="button" disabled={busy} onClick={() => run(
              () => api('POST', '/api/domain-watch/run'),
              (result) => {
                const found = result.changes === 0 ? 'nothing changed' : `${result.changes} ${result.changes === 1 ? 'change' : 'changes'}`
                const failed = result.failed?.length ? ` Couldn't check ${result.failed.join(', ')}.` : ''
                return `Checked ${result.checked} ${result.checked === 1 ? 'domain' : 'domains'}: ${found}.${failed}`
              },
            )}>
              {busy ? 'Checking…' : 'Check now'}
            </button>
          </div>
          <p className="settings-status">{view.lastRunAt ? `Last check ${new Date(view.lastRunAt).toLocaleString()}.` : 'Not checked yet.'}</p>
        </div>
      )}
      {message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </div>
  )
}
