import { useState } from 'react'
import { Switch } from '../ui/Switch'
import { suggestLinks } from '../../lib/uptime'

const STATUS_WORDS = { up: 'Up', down: 'Down', pending: 'Checking', maintenance: 'Maintenance', unknown: 'Unknown' }

/**
 * Optional uptime status from Uptime Kuma or Gatus (self-hosted only). Off
 * until switched on; the fields show once it is on.
 */
export function UptimeSettings({ uptime, groups }) {
  const settings = uptime.settings
  const [open, setOpen] = useState(Boolean(settings?.enabled))
  const [form, setForm] = useState({ kind: settings?.kind ?? 'kuma', url: settings?.url ?? '', slug: settings?.slug ?? '' })
  const [links, setLinks] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState(false)

  if (!settings) return null
  const items = groups.flatMap((group) => group.items)
  const savedLinks = settings.links ?? {}
  const shownLinks = links ?? savedLinks

  async function run(work, done) {
    setBusy(true)
    setMessage({ tone: '', text: '' })
    try {
      await work()
      setMessage({ tone: 'ok', text: done })
      return true
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggle(on) {
    setOpen(on)
    setMessage({ tone: '', text: '' })
    if (!on && settings.enabled) run(() => uptime.save({ enabled: false }), 'Turned off.')
  }

  async function connect(event) {
    event.preventDefault()
    let next = null
    const ok = await run(async () => {
      next = await uptime.save({ ...form, enabled: true })
    }, 'Connected.')
    if (!ok || !next) return
    // Link monitors whose name matches an item, so most need no work.
    const suggested = suggestLinks(next.monitors, items, next.settings.links)
    if (Object.keys(suggested).length) {
      await run(() => uptime.save({ links: { ...next.settings.links, ...suggested } }), `Connected. Linked ${Object.keys(suggested).length} by name; check the rest below.`)
    }
  }

  const field = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const message$ = message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Uptime status</h2>
        <p>
          Already run Uptime Kuma or Gatus? Show Up or Down next to your servers, domains and projects, and down items on the
          Attention page. Holdings reads your public status page every minute while it is open. Optional, and off until you
          turn it on.
        </p>
      </div>
      <Switch checked={open} onChange={toggle} label={settings.enabled ? 'On' : 'Turn on'} disabled={busy} />
      {!open && message$}

      {open && (
        <div className="deadman-body">
          <form className="settings-form account-form" onSubmit={connect}>
            <label>
              <span>Monitoring tool</span>
              <select value={form.kind} onChange={field('kind')}>
                <option value="kuma">Uptime Kuma</option>
                <option value="gatus">Gatus</option>
              </select>
            </label>
            <label>
              <span>Address</span>
              <input type="url" value={form.url} onChange={field('url')} placeholder="https://status.your-domain.example" autoComplete="off" required />
            </label>
            {form.kind === 'kuma' && (
              <label>
                <span>Status page name</span>
                <input value={form.slug} onChange={field('slug')} placeholder="main" autoComplete="off" required />
                <small className="field-hint">The part after /status/ in its address. Only monitors on that page are shown.</small>
              </label>
            )}
            <div className="settings-actions notify-actions">
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Checking…' : settings.enabled ? 'Save' : 'Connect'}</button>
            </div>
          </form>
          {message$}

          {settings.enabled && (
            <>
              {uptime.error && <p className="auth-error" role="alert">Couldn&apos;t read the status page: {uptime.error}</p>}
              {uptime.monitors.length === 0 ? (
                <p className="settings-status">No monitors on that status page yet.</p>
              ) : (
                <>
                  <h3 className="section-title">Link each monitor to what it watches</h3>
                  <ul className="stripe-products">
                    {uptime.monitors.map((monitor) => (
                      <li key={monitor.key}>
                        <span>{monitor.group ? `${monitor.group} / ` : ''}{monitor.name} · {STATUS_WORDS[monitor.status] ?? 'Unknown'}</span>
                        <select
                          aria-label={`Link ${monitor.name} to`}
                          value={shownLinks[monitor.key] ?? ''}
                          onChange={(event) => setLinks({ ...shownLinks, [monitor.key]: event.target.value })}
                        >
                          <option value="">Not linked</option>
                          {groups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                  <div className="settings-actions">
                    <button className="ghost-button" type="button" disabled={busy || !links} onClick={() => run(async () => {
                      await uptime.save({ links: shownLinks })
                      setLinks(null)
                    }, 'Links saved.')}>
                      Save links
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
