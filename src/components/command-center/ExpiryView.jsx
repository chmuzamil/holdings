import { useState } from 'react'
import { CalendarPlus, Download } from 'lucide-react'
import { buildCalendar } from '@holdings/core'
import { Card } from '../ui/Card'
import { download } from '../../lib/download'
import { EmptyState } from '../EmptyState'
import { daysLabel, getExpiryRadar } from '../../lib/expiry'
import './command-center.css'

const FILTERS = [
  ['all', 'Everything'],
  ['domains', 'Domains'],
  ['keys', 'Keys & cards'],
  ['subscriptions', 'Subscriptions'],
  ['servers', 'Servers'],
  ['accounts', 'Accounts'],
]

const KIND = {
  domains: 'Domain',
  servers: 'Server',
  subscriptions: 'Subscription',
  accounts: 'Account',
}

const REMINDERS = [0, 1, 3, 7, 14, 30]
const fileName = (text) => `${String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'holdings'}.ics`

/** Calendar download: everything (optionally one project's). */
function CalendarControls({ getData, projects }) {
  const [projectId, setProjectId] = useState('')
  const [alarmDays, setAlarmDays] = useState(7)
  const save = () => {
    const project = projects.find((item) => item.id === projectId)
    const ics = buildCalendar(getData(), { projectId: projectId || undefined, alarmDays, name: project ? `Holdings: ${project.name}` : 'Holdings renewals' })
    download(project ? fileName(`holdings-${project.name}`) : 'holdings-renewals.ics', ics, 'text/calendar')
  }
  return (
    <Card className="command-panel calendar-controls">
      <div>
        <h2 className="section-title">Calendar</h2>
        <p className="cleanup-summary">Add every renewal and expiry to Google Calendar, Apple Calendar or Outlook. Importing it again updates the same events.</p>
      </div>
      <div className="calendar-controls-row">
        <label>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          <span>Reminder</span>
          <select value={alarmDays} onChange={(event) => setAlarmDays(Number(event.target.value))}>
            {REMINDERS.map((days) => <option key={days} value={days}>{days === 0 ? 'No reminder' : `${days} day${days === 1 ? '' : 's'} before`}</option>)}
          </select>
        </label>
        <button className="primary-button" type="button" onClick={save}>
          <Download size={16} />
          Download calendar (.ics)
        </button>
      </div>
    </Card>
  )
}

export function ExpiryView({ flatRecords, prettyDate, setActivePage, getData, projects = [] }) {
  const [filter, setFilter] = useState('all')
  const addOne = (record) => download(fileName(record.name), buildCalendar(getData(), { assetId: record.id, alarmDays: 7, name: record.name }), 'text/calendar')
  const visible = filter === 'all' ? flatRecords : flatRecords.filter((record) => record.moduleKey === filter)
  const groups = getExpiryRadar(visible).filter((group) => group.rows.length)

  return (
    <section className="page-content cc-page expiry-page">
      {getData && <CalendarControls getData={getData} projects={projects} />}

      <div className="expiry-filters" role="group" aria-label="Show">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className="expiry-filter" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <EmptyState variant="calm" title="Nothing here" text="Nothing of this kind renews or expires." />
      )}

      {groups.map((group) => (
        <Card className={`command-panel expiry-group expiry-${group.key}`} key={group.key}>
          <h2 className="section-title">{group.label} ({group.rows.length})</h2>
          <ul className="impact-list">
            {group.rows.map(({ record, date, dateValue, dateLabel, days }) => (
              <li key={`${record.moduleKey}-${record.id}`} className="expiry-row">
                <button type="button" className="impact-item" onClick={() => setActivePage(record.moduleKey)}>
                  <span>
                    <strong>{record.name}</strong>
                    <small>
                      {record.moduleKey === 'keys' ? record.keyType || 'Key' : KIND[record.moduleKey]}
                      {record.last4 ? ` ending ${record.last4}` : ''}
                      {record.keptIn ? ` · kept in ${record.keptIn}` : ''}
                    </small>
                  </span>
                  <span className="expiry-when">
                    {date ? (
                      <>
                        <strong>{days < 0 ? 'Due' : dateLabel} {daysLabel(days)}</strong>
                        <small>{prettyDate(dateValue)}</small>
                      </>
                    ) : (
                      <small>Add a date so you get a reminder</small>
                    )}
                  </span>
                </button>
                {date && getData && (
                  <button type="button" className="ghost-button expiry-add" onClick={() => addOne(record)} aria-label={`Add ${record.name} to calendar`}>
                    <CalendarPlus size={15} aria-hidden="true" />
                    <span>Add to calendar</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
