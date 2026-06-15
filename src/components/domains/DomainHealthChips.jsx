import { healthLabel, healthSymbol, healthVariant } from '../../lib/domain-health-helpers'
import { Badge } from '../ui/Badge'

const CHIP_KEYS = [
  { key: 'dns', label: 'DNS' },
  { key: 'nameservers', label: 'NS' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
]

export function DomainHealthChips({ health, compact = false }) {
  if (!health) return null

  return (
    <div className={`domain-health-chips ${compact ? 'compact' : ''}`.trim()}>
      {!compact && <span className="domain-health-label">Health</span>}
      {CHIP_KEYS.map((chip) => (
        <Badge key={chip.key} variant={healthVariant(health[chip.key])} className="domain-health-chip">
          {chip.label} {healthSymbol(health[chip.key])}
        </Badge>
      ))}
    </div>
  )
}

export function DomainHealthDetail({ health }) {
  if (!health) return null
  return (
    <div className="ui-kv-grid">
      <div className="ui-kv-row"><span className="ui-kv-label">DNS</span><span className="ui-kv-value">{healthLabel(health.dns)}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Nameservers</span><span className="ui-kv-value">{healthLabel(health.nameservers)}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Email</span><span className="ui-kv-value">{healthLabel(health.email)}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Website</span><span className="ui-kv-value">{healthLabel(health.website)}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">A Record</span><span className="ui-kv-value">{health.aRecord || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Nameserver List</span><span className="ui-kv-value">{(health.nameserverList || []).join(', ') || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">MX Records</span><span className="ui-kv-value">{(health.mxRecords || []).join(', ') || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Website URL</span><span className="ui-kv-value">{health.websiteUrl || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">HTTP Status</span><span className="ui-kv-value">{health.httpStatus ?? '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Last Checked</span><span className="ui-kv-value">{health.lastChecked || '—'}</span></div>
    </div>
  )
}
