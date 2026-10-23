import { Edit3, Eye, RefreshCw, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { DropdownMenu } from '../ui/DropdownMenu'
import {
  countDnsRecords,
  getCountdownLabel,
  getCountdownVariant,
  normalizeSubdomains,
} from '../../lib/domain-helpers'
import { resolveDomainConnections } from '../../lib/asset-helpers'
import { getDomainCheck } from '../../lib/health-score'

export function DomainCard({
  record,
  records,
  displayCurrency,
  attention,
  money,
  prettyDate,
  toUsd,
  fromUsd,
  onViewDetails,
  onRefresh,
  onEdit,
  onDelete,
}) {
  const subdomains = normalizeSubdomains(record).filter((sub) => sub.name?.trim())
  const connections = records ? resolveDomainConnections(record, records) : { projects: [], servers: [], repos: [] }
  const dnsCount = countDnsRecords(record.lookup)
  const nsCount = record.lookup?.dns?.ns?.value?.length
    || record.lookup?.whois?.nameservers?.length
    || 0
  const shownCost = money(fromUsd(toUsd(record), displayCurrency), displayCurrency)
  const usdCost = displayCurrency !== 'USD' ? money(toUsd(record), 'USD') : null
  const dnsCheck = getDomainCheck(record.health)
  const usedBy = [
    ...connections.projects.map((item) => item.name),
    ...connections.servers.map((item) => item.name),
    ...connections.repos.map((item) => `${item.name} repo`),
  ].join(' · ')

  return (
    <Card className={`domain-card ${attention ? 'attention' : ''}`.trim()}>
      <div className="domain-card-grid">
        <div className="domain-card-info">
          <div className="domain-card-copy">
            <h3 className="domain-card-title">{record.name}</h3>
            <div className="domain-card-badges">
              {record.status === 'Cancelled'
                ? <Badge variant="outline">Cancelled</Badge>
                : <Badge variant={getCountdownVariant(record)}>{getCountdownLabel(record)}</Badge>}
              {dnsCheck.show && <Badge variant={dnsCheck.variant}>{dnsCheck.label}</Badge>}
            </div>
            {record.notes && (
              <p className="domain-card-description">{record.notes}</p>
            )}
            {usedBy && <p className="domain-connected-assets" title={usedBy}>Used by {usedBy}</p>}
          </div>
        </div>

        <div className="domain-card-meta">
          <span className="domain-card-label">Registrar</span>
          <span className="domain-card-value">{record.provider || '—'}</span>
        </div>

        <div className="domain-card-renewal">
          <span className="domain-card-label">Renewal</span>
          <span className="domain-card-value">
            {shownCost}
          </span>
          {usdCost && <span className="domain-card-subvalue">{usdCost}</span>}
          <span className="domain-card-subvalue">Expires {prettyDate(record.expiryDate)}</span>
        </div>

        <div className="domain-card-stats">
          <div className="domain-stat">
            <span>DNS records</span>
            <strong>{dnsCount || '—'}</strong>
          </div>
          <div className="domain-stat">
            <span>Nameservers</span>
            <strong>{nsCount || '—'}</strong>
          </div>
          <div className="domain-stat">
            <span>Subdomains</span>
            <strong>{subdomains.length}</strong>
          </div>
        </div>

        <div className="domain-card-actions">
          <button className="ui-btn ui-btn-primary" type="button" onClick={() => onViewDetails(record)}>
            <Eye size={15} aria-hidden="true" />
            Details
          </button>
          <DropdownMenu
            items={[
              {
                label: 'Refresh DNS',
                icon: <RefreshCw size={14} />,
                onClick: () => onRefresh(record),
              },
              {
                label: 'Edit',
                icon: <Edit3 size={14} />,
                onClick: () => onEdit(record),
              },
              {
                label: 'Delete',
                icon: <Trash2 size={14} />,
                danger: true,
                onClick: () => onDelete(record),
              },
            ]}
          />
        </div>
      </div>
    </Card>
  )
}
