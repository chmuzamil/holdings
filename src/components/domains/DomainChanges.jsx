import { Badge } from '../ui/Badge'
import { domainChanges } from '../../lib/domain-watch'

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** What changed between DNS/registry checks (manual here, or scheduled on your server). */
export function DomainChanges({ record, serverChanges }) {
  const changes = domainChanges(record, serverChanges)
  return (
    <div className="domain-drawer-section">
      <h4>Changes</h4>
      {changes.length === 0 ? (
        <p className="domain-safety-note">
          {record.lookup?.checkedAt
            ? 'No changes seen yet. Each DNS check compares nameservers, registry status, expiry, DNSSEC and the transfer lock with the last one.'
            : 'Run a DNS check to start watching for changes.'}
        </p>
      ) : (
        <ul className="domain-safety-list">
          {changes.map((change) => (
            <li key={change.id}>
              <Badge variant={change.severity === 'high' ? 'danger' : 'outline'}>{change.severity === 'high' ? 'Check' : 'Info'}</Badge>
              <div>
                <strong>{when(change.at)}</strong>
                <span>{change.message}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
