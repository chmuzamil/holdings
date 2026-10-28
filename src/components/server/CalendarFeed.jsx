import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { api } from '../../lib/server-api'

const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')

/** A private calendar subscription link (self-hosted only). */
export function CalendarFeed({ projects = [] }) {
  const [state, setState] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [alarm, setAlarm] = useState(7)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('GET', '/api/calendar/token').then(setState).catch((caught) => setError(caught.message))
  }, [])

  async function create() {
    const replacing = state?.exists
    if (replacing && !window.confirm('Make a new link? The old one stops working, so calendars using it stop updating.')) return
    setError('')
    try {
      const { token } = await api('POST', '/api/calendar/token')
      const query = new URLSearchParams({ token, alarm: String(alarm), ...(projectId ? { project: projectId } : {}) })
      setLink(`${window.location.origin}/api/calendar.ics?${query}`)
      setCopied(false)
      setState({ exists: true, createdAt: new Date().toISOString(), lastUsedAt: null })
    } catch (caught) {
      setError(caught.message)
    }
  }

  async function revoke() {
    if (!window.confirm('Turn off the calendar link? Calendars using it stop updating.')) return
    try {
      setState(await api('DELETE', '/api/calendar/token'))
      setLink('')
    } catch (caught) {
      setError(caught.message)
    }
  }

  if (!state) return error ? <p className="auth-error" role="alert">{error}</p> : null

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Calendar subscription</h2>
        <p>
          A private link your calendar app checks for new renewals and expiries. It can only read that calendar, nothing
          else. Anyone with the link can see it, so keep it to yourself.
        </p>
      </div>

      <div className="settings-form account-form">
        <label>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          <span>Reminder</span>
          <select value={alarm} onChange={(event) => setAlarm(Number(event.target.value))}>
            {[0, 1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days === 0 ? 'No reminder' : `${days} day${days === 1 ? '' : 's'} before`}</option>)}
          </select>
        </label>
        <div className="settings-actions notify-actions">
          <button className="primary-button" type="button" onClick={create}>{state.exists ? 'Make a new link' : 'Make a link'}</button>
          {state.exists && <button className="ghost-button" type="button" onClick={revoke}>Turn off</button>}
        </div>
        {state.exists && !link && (
          <p className="settings-status">A link is on, made {when(state.createdAt)}, last used {when(state.lastUsedAt)}. It is shown only once; make a new one to see a link again.</p>
        )}
      </div>

      {link && (
        <div className="token-created" role="status">
          <p><strong>Copy this link now.</strong> It won&apos;t be shown again. In your calendar app, choose &ldquo;Subscribe&rdquo; or &ldquo;Add from URL&rdquo; and paste it.</p>
          <code className="token-command">{link}</code>
          <div className="settings-actions">
            <button className="ghost-button" type="button" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>
              <Copy size={16} />
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  )
}
