import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getAttentionItems } from '../../lib/intelligence-helpers'
import './command-center.css'

const PRIORITY_LABELS = {
  critical: 'Do now',
  warning: 'Plan for',
  info: 'Tidy up',
}

export function AttentionCenterView({ records, flatRecords, setActivePage, serverChanges }) {
  const items = getAttentionItems(records, flatRecords, serverChanges)
  const groups = {
    critical: items.filter((i) => i.priority === 'critical'),
    warning: items.filter((i) => i.priority === 'warning'),
    info: items.filter((i) => i.priority === 'info'),
  }

  return (
    <section className="page-content cc-page attention-page">
      <div className="cc-grid-3">
        <Card className="cc-stat-card"><span>Do now</span><strong>{groups.critical.length}</strong><small>Overdue or due within a week</small></Card>
        <Card className="cc-stat-card"><span>Plan for</span><strong>{groups.warning.length}</strong><small>Due within a month</small></Card>
        <Card className="cc-stat-card"><span>Tidy up</span><strong>{groups.info.length}</strong><small>Missing links and unchecked domains</small></Card>
      </div>

      {['critical', 'warning', 'info'].map((priority) => {
        const group = groups[priority]
        if (!group.length) return null
        return (
          <Card className="command-panel" key={priority}>
            <h3 className="section-title">{PRIORITY_LABELS[priority]} ({group.length})</h3>
            <div className="attention-list">
              {group.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="attention-item"
                  onClick={() => setActivePage(item.moduleKey)}
                >
                  <div>
                    <strong>{item.detail}: {item.label.charAt(0).toLowerCase() + item.label.slice(1)}</strong>
                    <small>{item.action}</small>
                  </div>
                  <span className="muted-xs" aria-hidden="true">Open →</span>
                </button>
              ))}
            </div>
          </Card>
        )
      })}

      {!items.length && (
        <EmptyState variant="calm" title="All clear" text="Nothing is due soon and nothing is missing." />
      )}
    </section>
  )
}
