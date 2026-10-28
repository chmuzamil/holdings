import { useEffect, useState } from 'react'
import { Check, Lock, X } from 'lucide-react'
import { Switch } from '../ui/Switch'
import { api } from '../../lib/server-api'
import { findSecret } from '../../lib/secrets'
import { MIN_PASSPHRASE_LENGTH, lockedHandoverFile } from '../../lib/handover-file'

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Requirement({ done, children }) {
  return (
    <li className={done ? 'deadman-done' : ''}>
      {done ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      <span>{children}</span>
      <span className="sr-only">{done ? '(done)' : '(not done yet)'}</span>
    </li>
  )
}

/**
 * Optional dead-man's switch (self-hosted only). `getHandover` returns the
 * current data and handover options, so the file is always built from what
 * is in Holdings now.
 */
export function DeadmanSettings({ getHandover }) {
  const [state, setState] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({})
  const [passphrase, setPassphrase] = useState({ value: '', confirm: '' })
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api('GET', '/api/deadman')
      .then((view) => {
        setState(view)
        setOpen(view.enabled)
        setForm({ intervalDays: view.intervalDays, graceDays: view.graceDays, contactName: view.contactName, contactEmail: view.contactEmail, note: view.note })
      })
      .catch((error) => setStatus({ main: { tone: 'error', text: error.message } }))
  }, [])

  if (!state) return status.main ? <p className="auth-error" role="alert">{status.main.text}</p> : null

  const say = (key, tone, text) => setStatus((current) => ({ ...current, [key]: { tone, text } }))
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  async function run(key, work, done) {
    setBusy(key)
    say(key, '', '')
    try {
      const result = await work()
      if (result) setState(result)
      say(key, 'ok', done)
      return true
    } catch (error) {
      say(key, 'error', error.message)
      return false
    } finally {
      setBusy('')
    }
  }

  const save = (enabled) => run('main', () => api('PUT', '/api/deadman', {
    ...form,
    intervalDays: Number(form.intervalDays),
    graceDays: Number(form.graceDays),
    appUrl: window.location.origin,
    enabled,
  }), enabled ? (state.enabled ? 'Saved.' : 'Turned on. Check-ins start now.') : 'Saved.')

  function toggle(on) {
    setOpen(on)
    say('main', '', '')
    if (!on && state.enabled) run('main', () => api('PUT', '/api/deadman', { enabled: false }), 'Turned off. Nothing will be sent.')
  }

  async function uploadFile(event) {
    event.preventDefault()
    if (passphrase.value.length < MIN_PASSPHRASE_LENGTH) return say('file', 'error', `Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words work well.`)
    if (passphrase.value !== passphrase.confirm) return say('file', 'error', 'The two passphrases are different.')
    const { data, options } = getHandover()
    const secret = findSecret(options.message || '')
    if (secret) return say('file', 'error', `Your handover note looks like it contains a ${secret}. Change it on the Handover page first.`)
    const ok = await run('file', async () => {
      say('file', '', 'Locking the file…')
      const html = await lockedHandoverFile(data, { ...options, recipient: form.contactName || options.recipient }, passphrase.value)
      return api('PUT', '/api/deadman/file', { html })
    }, 'Locked and uploaded. Give the passphrase to the person you trust yourself; Holdings doesn’t keep it.')
    if (ok) {
      setPassphrase({ value: '', confirm: '' })
      say('main', '', '')
    }
  }

  const { latestChange } = getHandover()
  const fileStale = state.fileUpdatedAt && latestChange && latestChange > state.fileUpdatedAt
  const message = (key) => status[key]?.text && (
    <p className={status[key].tone === 'error' ? 'auth-error' : 'settings-status'} role={status[key].tone === 'error' ? 'alert' : 'status'}>{status[key].text}</p>
  )

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Dead-man&apos;s switch</h2>
        <p>
          If you stop checking in, someone you trust gets your locked handover file, so your projects don&apos;t quietly lapse.
          Signing in or saving counts as checking in. Optional, and off until you turn it on.
        </p>
      </div>

      <Switch
        checked={open}
        onChange={toggle}
        label={state.enabled ? 'On' : 'Turn on'}
        description={state.enabled ? `If you don’t check in, ${state.contactName || state.contactEmail} gets the file on ${when(state.sendAt)}.` : undefined}
        disabled={busy === 'main'}
      />

      {!open && message('main')}

      {state.lastTriggeredAt && !state.triggeredAt && (
        <p className="settings-status">Your handover file was sent on {when(state.lastTriggeredAt)}. The switch has been on again since you checked in.</p>
      )}
      {state.triggeredAt && (
        <p className="auth-error" role="alert">Your handover file was sent to {state.contactName || state.contactEmail} on {when(state.triggeredAt)}. Check in to turn the switch back on.</p>
      )}

      {open && (
        <div className="deadman-body">
          {state.enabled && (
            <div className="deadman-status">
              <p>
                Last check-in {when(state.lastCheckIn)}. Next one due {when(state.dueAt)}.
              </p>
              <button className="primary-button" type="button" disabled={busy === 'checkin'} onClick={() => run('checkin', async () => {
                await api('POST', '/api/deadman/checkin')
                return api('GET', '/api/deadman')
              }, 'Checked in.')}>
                Check in now
              </button>
              {message('checkin')}
            </div>
          )}

          <ul className="deadman-requirements" aria-label="What it needs">
            <Requirement done={state.emailReady}>Email notifications are on (the file is sent by email{state.emailReady ? '' : ': turn them on above'})</Requirement>
            <Requirement done={Boolean(form.contactEmail)}>The person you trust</Requirement>
            <Requirement done={state.hasFile}>
              A locked handover file{state.fileUpdatedAt ? `, from ${when(state.fileUpdatedAt)}` : ''}
            </Requirement>
          </ul>

          <form className="settings-form account-form" onSubmit={(event) => { event.preventDefault(); save(true) }}>
            <label>
              <span>Check in every</span>
              <select value={form.intervalDays} onChange={update('intervalDays')}>
                {[14, 30, 60, 90].map((days) => <option key={days} value={days}>{days} days</option>)}
              </select>
            </label>
            <label>
              <span>Then wait</span>
              <select value={form.graceDays} onChange={update('graceDays')}>
                {[7, 14, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
              </select>
            </label>
            <label>
              <span>Their name</span>
              <input value={form.contactName} onChange={update('contactName')} autoComplete="off" placeholder="Sara" />
            </label>
            <label>
              <span>Their email</span>
              <input type="email" value={form.contactEmail} onChange={update('contactEmail')} autoComplete="off" placeholder="sara@mail.example" />
            </label>
            <label className="deadman-note">
              <span>Note in the email (optional)</span>
              <textarea value={form.note} onChange={update('note')} rows={3} maxLength={2000} placeholder="Where the passphrase is, who to call first…" />
              <small className="field-hint">Don&apos;t put the passphrase here: this email is not locked.</small>
            </label>
            <div className="settings-actions notify-actions">
              <button className="primary-button" type="submit" disabled={busy === 'main'}>{state.enabled ? 'Save' : 'Turn on'}</button>
            </div>
            {message('main')}
          </form>

          <form className="settings-form account-form deadman-file" onSubmit={uploadFile}>
            <p className="settings-status">
              <Lock size={14} aria-hidden="true" /> {state.hasFile ? 'Update the locked file' : 'Lock and upload the handover file'}. It is built from your data
              now and locked in this browser; only the locked file is uploaded.
              {fileStale && <strong> Your data changed since the last one: update it.</strong>}
            </p>
            <label>
              <span>Passphrase</span>
              <input type="password" value={passphrase.value} onChange={(event) => setPassphrase((current) => ({ ...current, value: event.target.value }))} autoComplete="new-password" />
            </label>
            <label>
              <span>Passphrase again</span>
              <input type="password" value={passphrase.confirm} onChange={(event) => setPassphrase((current) => ({ ...current, confirm: event.target.value }))} autoComplete="new-password" />
            </label>
            <div className="settings-actions notify-actions">
              <button className="ghost-button" type="submit" disabled={busy === 'file'}>
                <Lock size={16} />
                {state.hasFile ? 'Lock and replace' : 'Lock and upload'}
              </button>
            </div>
            {message('file')}
          </form>
        </div>
      )}
    </div>
  )
}
