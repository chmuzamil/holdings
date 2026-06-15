import { useEffect, useState } from 'react'
import { Edit3, Eye, RefreshCw, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { DropdownMenu } from '../ui/DropdownMenu'
import {
  countDnsRecords,
  getCountdownLabel,
  getCountdownVariant,
  getDomainFaviconUrl,
  normalizeSubdomains,
} from '../../lib/domain-helpers'
import { resolveDomainConnections } from '../../lib/asset-helpers'
import { getDomainHealthScore } from '../../lib/health-score'

function statusVariant(status) {
  if (status === 'Active') return 'success'
  if (status === 'Expiring Soon') return 'warning'
  if (status === 'Expired') return 'expired'
  return 'outline'
}

function DomainAvatar({ name }) {
  const [failed, setFailed] = useState(false)
  const favicon = getDomainFaviconUrl(name)

  useEffect(() => {
    setFailed(false)
  }, [name])

  return (
    <div className="domain-avatar">
      {favicon && !failed ? (
        <img
          src={favicon}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Avatar name={name} size="sm" className="domain-avatar-fallback" />
      )}
    </div>
  )
}

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
  const converted = record.currency !== displayCurrency
    ? money(fromUsd(toUsd(record), displayCurrency), displayCurrency)
    : null
  const domainHealth = getDomainHealthScore(record.health)

  return (
    <Card className={`domain-card ${attention ? 'attention' : ''}`.trim()}>
      <div className="domain-card-grid">
        <div className="domain-card-info">
          <DomainAvatar name={record.name} />
          <div className="domain-card-copy">
            <h3 className="domain-card-title">{record.name}</h3>
            <div className="domain-card-badges">
              <Badge variant={statusVariant(record.status)}>{record.status}</Badge>
              <Badge variant={getCountdownVariant(record)}>{getCountdownLabel(record)}</Badge>
              <Badge variant={domainHealth.score >= 75 ? 'success' : domainHealth.score >= 50 ? 'warning' : 'outline'}>
                Health {domainHealth.score}
              </Badge>
            </div>
            {record.notes && (
              <p className="domain-card-description">{record.notes}</p>
            )}
            {(connections.projects[0] || connections.servers[0] || connections.repos[0]) && (
              <div className="domain-connected-assets">
                {connections.projects[0] && <small>Project: {connections.projects[0].name}</small>}
                {connections.servers[0] && <small>Server: {connections.servers[0].name}</small>}
                {connections.repos[0] && <small>Repo: {connections.repos[0].name}</small>}
              </div>
            )}
          </div>
        </div>

        <div className="domain-card-meta">
          <span className="domain-card-label">Registrar</span>
          <span className="domain-card-value">{record.provider || '—'}</span>
          <span className="domain-card-subvalue">Auto renew not tracked</span>
        </div>

        <div className="domain-card-renewal">
          <span className="domain-card-label">Renewal</span>
          <span className="domain-card-value">
            {money(Number(record.cost || 0), record.currency)}
          </span>
          {converted && <span className="domain-card-subvalue">{converted}</span>}
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
            <Eye size={15} />
            View Details
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
