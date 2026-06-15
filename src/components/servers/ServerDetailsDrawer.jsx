import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Tabs } from '../ui/Tabs'
import {
  computeServerCostMetrics,
  formatServerSpecs,
  normalizeServerRecord,
} from '../../lib/server-helpers'
import { resolveServerConnections } from '../../lib/asset-helpers'

function OverviewTab({ server, prettyDate, money, fromUsd, displayCurrency, toUsd }) {
  const normalized = normalizeServerRecord(server)
  const metrics = computeServerCostMetrics(server, toUsd)
  return (
    <div className="ui-kv-grid">
      <div className="ui-kv-row"><span className="ui-kv-label">Provider</span><span className="ui-kv-value">{normalized.provider || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Package</span><span className="ui-kv-value">{normalized.packageName || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">IP Address</span><span className="ui-kv-value">{normalized.ipAddress || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Location</span><span className="ui-kv-value">{normalized.location || '—'}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Renewal</span><span className="ui-kv-value">{prettyDate(normalized.renewalDate)}</span></div>
      <div className="ui-kv-row"><span className="ui-kv-label">Status</span><span className="ui-kv-value"><Badge variant="success">{normalized.status}</Badge></span></div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Monthly Cost</span>
        <span className="ui-kv-value">{money(fromUsd(metrics.monthlyUsd, displayCurrency), displayCurrency)}</span>
      </div>
    </div>
  )
}

function SpecsTab({ server }) {
  const normalized = normalizeServerRecord(server)
  const specs = formatServerSpecs(server)
  return (
    <>
      <div className="server-spec-grid">
        <div className="server-spec-card"><span>CPU</span><strong>{normalized.cpu || '—'}</strong></div>
        <div className="server-spec-card"><span>RAM</span><strong>{normalized.ramGb ? `${normalized.ramGb} GB` : '—'}</strong></div>
        <div className="server-spec-card"><span>Storage</span><strong>{normalized.storage || '—'}</strong></div>
        <div className="server-spec-card"><span>Bandwidth</span><strong>{normalized.bandwidth || '—'}</strong></div>
        <div className="server-spec-card"><span>OS</span><strong>{normalized.os || '—'}</strong></div>
        <div className="server-spec-card"><span>Location</span><strong>{normalized.location || '—'}</strong></div>
      </div>
      <p className="settings-status" style={{ marginTop: 14 }}>{specs.join(' · ')}</p>
    </>
  )
}

function HostedServicesTab({ server, records }) {
  const normalized = normalizeServerRecord(server)
  const connections = resolveServerConnections(server, records)
  return (
    <>
      <div className="hosted-services-list" style={{ marginBottom: 16 }}>
        {normalized.hostedServices.map((service) => (
          <span className="hosted-service-chip" key={service}>{service}</span>
        ))}
      </div>
      {connections.projects.length > 0 && (
        <>
          <h4>Linked Projects</h4>
          <div className="project-asset-list">
            {connections.projects.map((project) => (
              <div className="project-asset-item" key={project.id}><strong>{project.name}</strong></div>
            ))}
          </div>
        </>
      )}
      {connections.domains.length > 0 && (
        <>
          <h4>Hosted Domains</h4>
          <div className="project-asset-list">
            {connections.domains.map((domain) => (
              <div className="project-asset-item" key={domain.id}><strong>{domain.name}</strong></div>
            ))}
          </div>
        </>
      )}
      {connections.repos.length > 0 && (
        <>
          <h4>Hosted Repositories</h4>
          <div className="project-asset-list">
            {connections.repos.map((repo) => (
              <div className="project-asset-item" key={repo.id}><strong>{repo.name}</strong></div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function CostsTab({ server, toUsd, money, fromUsd, displayCurrency }) {
  const metrics = computeServerCostMetrics(server, toUsd)
  return (
    <div className="project-asset-list">
      <div className="project-asset-item"><div><strong>Monthly cost</strong></div><span>{money(fromUsd(metrics.monthlyUsd, displayCurrency), displayCurrency)}</span></div>
      <div className="project-asset-item"><div><strong>Annual cost</strong></div><span>{money(fromUsd(metrics.annualUsd, displayCurrency), displayCurrency)}</span></div>
      <div className="project-asset-item"><div><strong>Cost per CPU core</strong><small>Per month</small></div><span>{money(fromUsd(metrics.perCoreUsd, displayCurrency), displayCurrency)}</span></div>
      <div className="project-asset-item"><div><strong>Cost per GB RAM</strong><small>Per month</small></div><span>{money(fromUsd(metrics.perGbRamUsd, displayCurrency), displayCurrency)}</span></div>
    </div>
  )
}

export function ServerDetailsDrawer({ server, records, open, onClose, money, prettyDate, toUsd, fromUsd, displayCurrency }) {
  if (!server) return null
  const normalized = normalizeServerRecord(server)

  return (
    <Drawer open={open} onClose={onClose} title={normalized.name} description={normalized.provider}>
      <div className="server-drawer-hero">
        <div className="repo-avatar"><span>SV</span></div>
        <div>
          <h3>{normalized.name}</h3>
          <p>{normalized.ipAddress || 'No IP'} · {normalized.location || 'Unknown location'}</p>
        </div>
        <Badge variant="success">{normalized.status}</Badge>
      </div>

      <Tabs
        defaultValue="overview"
        items={[
          { value: 'overview', label: 'Overview', content: <OverviewTab server={server} prettyDate={prettyDate} money={money} fromUsd={fromUsd} displayCurrency={displayCurrency} toUsd={toUsd} /> },
          { value: 'specs', label: 'Specs', content: <SpecsTab server={server} /> },
          { value: 'hosted', label: 'Hosted Services', content: <HostedServicesTab server={server} records={records} /> },
          { value: 'costs', label: 'Costs', content: <CostsTab server={server} toUsd={toUsd} money={money} fromUsd={fromUsd} displayCurrency={displayCurrency} /> },
          { value: 'notes', label: 'Notes', content: <p>{normalized.notes || 'No notes yet.'}</p> },
        ]}
      />
    </Drawer>
  )
}
