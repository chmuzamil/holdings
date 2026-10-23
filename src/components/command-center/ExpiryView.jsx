import { useState } from 'react'
import { Card } from '../ui/Card'
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

export function ExpiryView({ flatRecords, prettyDate, setActivePage }) {
  const [filter, setFilter] = useState('all')
  const visible = filter === 'all' ? flatRecords : flatRecords.filter((record) => record.moduleKey === filter)
  const groups = getExpiryRadar(visible).filter((group) => group.rows.length)

  return (
    <section className="page-content cc-page expiry-page">
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
              <li key={`${record.moduleKey}-${record.id}`}>
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
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
