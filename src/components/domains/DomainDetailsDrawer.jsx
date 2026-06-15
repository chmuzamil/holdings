import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Tabs } from '../ui/Tabs'
import {
  flattenDnsRecords,
  getCountdownLabel,
  getCountdownVariant,
  getDomainInitials,
  normalizeSubdomains,
} from '../../lib/domain-helpers'
import { resolveDomainConnections } from '../../lib/asset-helpers'
import { DomainHealthChips, DomainHealthDetail } from './DomainHealthChips'

function statusVariant(status) {
  if (status === 'Active') return 'success'
  if (status === 'Expiring Soon') return 'warning'
  if (status === 'Expired') return 'expired'
  return 'outline'
}

function OverviewTab({ record, records, servers, money, prettyDate, toUsd, fromUsd, displayCurrency }) {
  const subdomains = normalizeSubdomains(record).filter((sub) => sub.name?.trim())
  const converted = record.currency !== displayCurrency
    ? money(fromUsd(toUsd(record), displayCurrency), displayCurrency)
    : null
  const connections = records ? resolveDomainConnections(record, records) : { projects: [], servers: [], repos: [] }

  return (
    <>
      <div className="domain-drawer-hero">
        <div className="domain-avatar">
          <span>{getDomainInitials(record.name)}</span>
        </div>
        <div>
          <h3>{record.name}</h3>
          <p>{record.provider || 'Unknown registrar'}</p>
        </div>
        <Badge variant={statusVariant(record.status)}>{record.status}</Badge>
      </div>

      <div className="domain-drawer-section">
        <h4>Overview</h4>
        <div className="ui-kv-grid">
          <div className="ui-kv-row">
            <span className="ui-kv-label">Countdown</span>
            <span className="ui-kv-value">
              <Badge variant={getCountdownVariant(record)}>{getCountdownLabel(record)}</Badge>
            </span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Registrar</span>
            <span className="ui-kv-value">{record.provider || '—'}</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Renewal cost</span>
            <span className="ui-kv-value">
              {money(Number(record.cost || 0), record.currency)}
              {converted ? ` (${converted})` : ''}
            </span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Renewal date</span>
            <span className="ui-kv-value">{prettyDate(record.renewalDate)}</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Expiry date</span>
            <span className="ui-kv-value">{prettyDate(record.expiryDate)}</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Auto renew</span>
            <span className="ui-kv-value">Not tracked</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Subdomains</span>
            <span className="ui-kv-value">{subdomains.length}</span>
          </div>
        </div>
      </div>

      <div className="domain-drawer-section">
        <h4>Connected Assets</h4>
        <div className="ui-kv-grid">
          <div className="ui-kv-row">
            <span className="ui-kv-label">Project</span>
            <span className="ui-kv-value">{connections.projects.map((p) => p.name).join(', ') || '—'}</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Server</span>
            <span className="ui-kv-value">{connections.servers.map((s) => s.name).join(', ') || '—'}</span>
          </div>
          <div className="ui-kv-row">
            <span className="ui-kv-label">Repository</span>
            <span className="ui-kv-value">{connections.repos.map((r) => r.name).join(', ') || '—'}</span>
          </div>
        </div>
      </div>

      {subdomains.length > 0 && (
        <div className="domain-drawer-section">
          <h4>Subdomains</h4>
          <div className="domain-subdomain-list">
            {subdomains.map((sub) => {
              const server = servers.find((entry) => entry.id === sub.serverId)
              return (
                <div key={sub.id} className="domain-subdomain-item">
                  <strong>{sub.name}</strong>
                  {server && (
                    <span>{server.name}{server.ipAddress ? ` · ${server.ipAddress}` : ''}</span>
                  )}
                  {sub.notes && <span>{sub.notes}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function DnsTab({ lookup }) {
  const rows = flattenDnsRecords(lookup)

  if (!rows.length) {
    return (
      <div className="domain-empty-panel">
        No DNS records loaded. Use Refresh DNS from the card menu.
      </div>
    )
  }

  return (
    <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="ui-data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Host</th>
            <th>Value</th>
            <th>TTL / Pri</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.type}-${row.value}-${index}`}>
              <td>{row.type}</td>
              <td className="mono">{row.host}</td>
              <td className="mono">{row.value}</td>
              <td>{row.ttl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WhoisTab({ lookup, prettyDate }) {
  const whois = lookup?.whois

  if (!whois || whois.error) {
    return (
      <div className="domain-empty-panel">
        {whois?.error || 'No WHOIS data loaded. Use Refresh DNS from the card menu.'}
      </div>
    )
  }

  const nameservers = whois.nameservers || lookup?.dns?.ns?.value || []

  return (
    <div className="ui-kv-grid">
      <div className="ui-kv-row">
        <span className="ui-kv-label">Registrar</span>
        <span className="ui-kv-value">{whois.registrar || 'unknown'}</span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Created</span>
        <span className="ui-kv-value">
          {whois.created ? prettyDate(whois.created.slice(0, 10)) : 'unknown'}
        </span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Updated</span>
        <span className="ui-kv-value">
          {whois.updated ? prettyDate(whois.updated.slice(0, 10)) : 'unknown'}
        </span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Expiry</span>
        <span className="ui-kv-value">
          {whois.expires ? prettyDate(whois.expires.slice(0, 10)) : 'unknown'}
        </span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Nameservers</span>
        <span className="ui-kv-value">
          {nameservers.length ? nameservers.join(', ') : 'none'}
        </span>
      </div>
      {lookup?.checkedAt && (
        <div className="ui-kv-row">
          <span className="ui-kv-label">Last checked</span>
          <span className="ui-kv-value">{prettyDate(lookup.checkedAt.slice(0, 10))}</span>
        </div>
      )}
    </div>
  )
}

function NotesTab({ record }) {
  if (!record.notes) {
    return <div className="domain-empty-panel">No notes added for this domain yet.</div>
  }

  return (
    <div className="ui-card" style={{ padding: '14px' }}>
      <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.55, fontSize: '13px' }}>
        {record.notes}
      </p>
    </div>
  )
}

function HealthTab({ record, onCheckHealth }) {
  return (
    <>
      <DomainHealthChips health={record.health} />
      <div style={{ marginTop: 16 }}>
        <DomainHealthDetail health={record.health} />
      </div>
      <button className="ui-btn ui-btn-primary" type="button" style={{ marginTop: 16 }} onClick={() => onCheckHealth?.(record)}>
        Check Health
      </button>
    </>
  )
}

export function DomainDetailsDrawer({
  record,
  records,
  servers,
  displayCurrency,
  open,
  onClose,
  money,
  prettyDate,
  toUsd,
  fromUsd,
  onCheckHealth,
}) {
  if (!record) return null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={record.name}
      description="Domain asset details and infrastructure metadata"
    >
      <Tabs
        defaultValue="overview"
        items={[
          {
            value: 'overview',
            label: 'Overview',
            content: (
              <OverviewTab
                record={record}
                records={records}
                servers={servers}
                money={money}
                prettyDate={prettyDate}
                toUsd={toUsd}
                fromUsd={fromUsd}
                displayCurrency={displayCurrency}
              />
            ),
          },
          {
            value: 'health',
            label: 'Health',
            content: <HealthTab record={record} onCheckHealth={onCheckHealth} />,
          },
          {
            value: 'dns',
            label: 'DNS Records',
            content: <DnsTab lookup={record.lookup} />,
          },
          {
            value: 'whois',
            label: 'WHOIS',
            content: <WhoisTab lookup={record.lookup} prettyDate={prettyDate} />,
          },
          {
            value: 'notes',
            label: 'Notes',
            content: <NotesTab record={record} />,
          },
        ]}
      />
    </Drawer>
  )
}
