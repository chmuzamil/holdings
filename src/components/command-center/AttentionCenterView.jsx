import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../EmptyState'
import { getAttentionItems, priorityVariant } from '../../lib/intelligence-helpers'
import './command-center.css'

const PRIORITY_LABELS = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
}

export function AttentionCenterView({ records, flatRecords, setActivePage }) {
  const items = getAttentionItems(records, flatRecords)
  const groups = {
    critical: items.filter((i) => i.priority === 'critical'),
    warning: items.filter((i) => i.priority === 'warning'),
    info: items.filter((i) => i.priority === 'info'),
  }

  return (
    <section className="page-content cc-page attention-page">
      <div className="cc-grid-3">
        <Card className="cc-stat-card"><span>Critical</span><strong>{groups.critical.length}</strong></Card>
        <Card className="cc-stat-card"><span>Warning</span><strong>{groups.warning.length}</strong></Card>
        <Card className="cc-stat-card"><span>Info</span><strong>{groups.info.length}</strong></Card>
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
                  <Badge variant={priorityVariant(item.priority)}>{PRIORITY_LABELS[item.priority]}</Badge>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <span className="muted-xs">Open →</span>
                </button>
              ))}
            </div>
          </Card>
        )
      })}

      {!items.length && (
        <EmptyState variant="calm" title="All clear" text="No renewals, gaps, or stale repos need attention right now." />
      )}
    </section>
  )
}
