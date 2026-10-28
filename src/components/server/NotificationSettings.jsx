import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Switch } from '../ui/Switch'
import { api } from '../../lib/server-api'

const CHANNELS = [
  { key: 'email', label: 'Email', description: 'Through your own mail server or provider (SMTP).' },
  { key: 'webhook', label: 'Webhook', description: 'Slack, Discord, or any address that takes JSON.' },
  { key: 'ntfy', label: 'ntfy', description: 'Push notifications on your phone with the ntfy app.' },
]

function Field({ label, children, hint }) {
  return (
    <label>
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

function EmailFields({ draft, update, saved }) {
  return (
    <>
      <Field label="SMTP host"><input value={draft.host} onChange={update('host')} placeholder="smtp.mail.example" autoComplete="off" /></Field>
      <Field label="Port"><input type="number" min="1" max="65535" value={draft.port} onChange={update('port')} /></Field>
      <Field label="Security">
        <select value={draft.security} onChange={update('security')}>
          <option value="starttls">STARTTLS (usually port 587)</option>
          <option value="tls">TLS (usually port 465)</option>
          <option value="none">None (only on your own network)</option>
        </select>
      </Field>
      <Field label="Username (optional)"><input value={draft.user} onChange={update('user')} autoComplete="off" /></Field>
      <Field label="Password" hint={saved.hasPassword ? 'Saved. Leave empty to keep it.' : undefined}>
        <input type="password" value={draft.password ?? ''} onChange={update('password')} autoComplete="new-password" placeholder={saved.hasPassword ? '••••••••' : ''} />
      </Field>
      <Field label="Send from"><input type="email" value={draft.from} onChange={update('from')} placeholder="holdings@your-domain.example" /></Field>
      <Field label="Send to"><input type="email" value={draft.to} onChange={update('to')} placeholder="you@your-domain.example" /></Field>
    </>
  )
}

function WebhookFields({ draft, update }) {
  return (
    <>
      <Field label="Webhook address"><input type="url" value={draft.url} onChange={update('url')} placeholder="https://hooks.slack.com/services/…" autoComplete="off" /></Field>
      <Field label="Format">
        <select value={draft.format} onChange={update('format')}>
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
          <option value="json">Other (JSON)</option>
        </select>
      </Field>
    </>
  )
}

function NtfyFields({ draft, update, saved }) {
  return (
    <>
      <Field label="Server"><input type="url" value={draft.server} onChange={update('server')} placeholder="https://ntfy.sh" /></Field>
      <Field label="Topic" hint="Anyone who knows a public topic can read it. Pick one that is hard to guess.">
        <input value={draft.topic} onChange={update('topic')} placeholder="holdings-k7q2m9" autoComplete="off" />
      </Field>
      <Field label="Access token (optional)" hint={saved.hasToken ? 'Saved. Leave empty to keep it.' : undefined}>
        <input type="password" value={draft.token ?? ''} onChange={update('token')} autoComplete="off" />
      </Field>
    </>
  )
}

const FIELDS = { email: EmailFields, webhook: WebhookFields, ntfy: NtfyFields }

/** Optional notifications (self-hosted only). Each channel is off until switched on. */
export function NotificationSettings() {
  const [saved, setSaved] = useState(null)
  const [drafts, setDrafts] = useState(null)
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api('GET', '/api/notifications')
      .then((settings) => {
        setSaved(settings)
        setDrafts({ email: { ...settings.email }, webhook: { ...settings.webhook }, ntfy: { ...settings.ntfy } })
      })
      .catch((error) => setStatus({ page: { tone: 'error', text: error.message } }))
  }, [])

  if (!saved || !drafts) {
    return status.page ? <p className="auth-error" role="alert">{status.page.text}</p> : null
  }

  const say = (key, tone, text) => setStatus((current) => ({ ...current, [key]: { tone, text } }))

  async function save(input, key, done) {
    setBusy(key)
    say(key, '', '')
    try {
      const next = await api('PUT', '/api/notifications', input)
      setSaved((current) => ({ ...current, ...next }))
      if (input[key]) setDrafts((current) => ({ ...current, [key]: { ...next[key] } }))
      say(key, 'ok', done)
      return true
    } catch (error) {
      say(key, 'error', error.message)
      return false
    } finally {
      setBusy('')
    }
  }

  function toggle(key, on) {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], enabled: on } }))
    say(key, '', '')
    // Turning off takes effect at once; turning on waits for Save, so nothing half-filled is sent.
    if (!on && saved[key].enabled) save({ [key]: { enabled: false } }, key, 'Turned off.')
  }

  async function test(key) {
    setBusy(key)
    say(key, '', 'Sending…')
    try {
      await api('POST', '/api/notifications/test', { channel: key })
      say(key, 'ok', 'Sent. Check that it arrived.')
    } catch (error) {
      say(key, 'error', error.message)
    } finally {
      setBusy('')
    }
  }

  async function checkNow() {
    setBusy('check')
    try {
      const result = await api('POST', '/api/notifications/check')
      setSaved((current) => ({ ...current, lastCheck: result }))
    } catch (error) {
      say('check', 'error', error.message)
    } finally {
      setBusy('')
    }
  }

  const anyOn = CHANNELS.some(({ key }) => saved[key].enabled)
  const last = saved.lastCheck

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Notifications</h2>
        <p>
          Get told before things renew or expire: domains, servers, subscriptions, keys and cards. Once a day, at most one
          message, and only when something reaches 30, 7 or 1 day, or is overdue. Use any channel you like, or none.
        </p>
      </div>

      <div className="notify-channels">
        {CHANNELS.map(({ key, label, description }) => {
          const Fields = FIELDS[key]
          const draft = drafts[key]
          const update = (field) => (event) => setDrafts((current) => ({ ...current, [key]: { ...current[key], [field]: event.target.value } }))
          const message = status[key]
          return (
            <section key={key} className="notify-channel">
              <Switch checked={draft.enabled} onChange={(on) => toggle(key, on)} label={label} description={description} disabled={busy === key} />
              {draft.enabled && (
                <form
                  className="settings-form account-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const { hasPassword, hasToken, ...fields } = draft
                    save({ [key]: { ...fields, enabled: true } }, key, 'Saved.')
                  }}
                >
                  <Fields draft={draft} update={update} saved={saved[key]} />
                  <div className="settings-actions notify-actions">
                    <button className="primary-button" type="submit" disabled={busy === key}>Save</button>
                    <button className="ghost-button" type="button" disabled={busy === key || !saved[key].enabled} onClick={() => test(key)}>
                      <Send size={16} />
                      Send test
                    </button>
                  </div>
                </form>
              )}
              {draft.enabled && draft.security === 'none' && key === 'email' && draft.host && !/^(localhost|127\.|10\.|192\.168\.)/.test(draft.host) && (
                <p className="field-hint">Without TLS your mail login travels in plain text. Only use this on your own network.</p>
              )}
              {message?.text && (
                <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>
              )}
            </section>
          )
        })}
      </div>

      {anyOn && (
        <div className="settings-form account-form notify-schedule">
          <label>
            <span>First warning</span>
            <select
              value={saved.leadDays}
              onChange={(event) => save({ leadDays: Number(event.target.value) }, 'lead', 'Saved.')}
            >
              <option value="30">30 days ahead</option>
              <option value="14">14 days ahead</option>
              <option value="7">7 days ahead</option>
            </select>
          </label>
          <div className="settings-actions notify-actions">
            <button className="ghost-button" type="button" disabled={busy === 'check'} onClick={checkNow}>Check now</button>
          </div>
          <p className="settings-status" role="status">
            {last
              ? `Last check ${new Date(last.at).toLocaleString()}: ${last.sent === 0 ? 'nothing new to send' : `sent ${last.sent} ${last.sent === 1 ? 'reminder' : 'reminders'}`}.`
              : 'Checks run once a day from 8:00 server time.'}
            {last?.failures?.length ? ` Problems: ${last.failures.join('; ')}` : ''}
          </p>
          {status.check?.text && <p className="auth-error" role="alert">{status.check.text}</p>}
        </div>
      )}
    </div>
  )
}
