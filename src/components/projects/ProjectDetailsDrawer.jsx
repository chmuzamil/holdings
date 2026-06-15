import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Tabs } from '../ui/Tabs'
import {
  normalizeProjectRecord,
  projectStatusVariant,
} from '../../lib/project-helpers'
import { getProjectCostAnalytics } from '../../lib/intelligence-helpers'
import { Progress } from '../ui/Progress'
import { resolveProjectAssets } from '../../lib/asset-helpers'

function OverviewTab({ project, money, fromUsd, displayCurrency, monthlyUsd }) {
  const normalized = normalizeProjectRecord(project)
  return (
    <div className="ui-kv-grid">
      <div className="ui-kv-row">
        <span className="ui-kv-label">Status</span>
        <span className="ui-kv-value"><Badge variant={projectStatusVariant(normalized.status)}>{normalized.status}</Badge></span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Category</span>
        <span className="ui-kv-value">{normalized.category}</span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Priority</span>
        <span className="ui-kv-value">{normalized.priority}</span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Live URL</span>
        <span className="ui-kv-value">
          {normalized.liveUrl
            ? <a href={normalized.liveUrl} target="_blank" rel="noreferrer">{normalized.liveUrl}</a>
            : '—'}
        </span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Monthly Cost</span>
        <span className="ui-kv-value">{money(fromUsd(monthlyUsd, displayCurrency), displayCurrency)}</span>
      </div>
      {normalized.description && (
        <div className="ui-kv-row">
          <span className="ui-kv-label">Description</span>
          <span className="ui-kv-value">{normalized.description}</span>
        </div>
      )}
    </div>
  )
}

function AssetsTab({ project, records }) {
  const assets = resolveProjectAssets(project, records)
  const sections = [
    { label: 'Domains', items: assets.domains, type: 'Domain' },
    { label: 'Repositories', items: assets.repos, type: 'Repository' },
    { label: 'Servers', items: assets.servers, type: 'Server' },
    { label: 'Subscriptions', items: assets.subscriptions, type: 'Subscription' },
  ]

  return (
    <div className="project-asset-list">
      {sections.map((section) => (
        section.items.length ? section.items.map((item) => (
          <div className="project-asset-item" key={`${section.label}-${item.id}`}>
            <div>
              <strong>{item.name}</strong>
              <small>{section.type}</small>
            </div>
          </div>
        )) : null
      ))}
      {!sections.some((section) => section.items.length) && (
        <p className="settings-status">No connected assets yet.</p>
      )}
    </div>
  )
}

function CostsTab({ project, records, toUsd, money, fromUsd, displayCurrency }) {
  const analytics = getProjectCostAnalytics(project, records, toUsd)
  return (
    <>
      <div className="project-asset-list">
        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>Cost Breakdown</h4>
        {analytics.breakdown.rows.map((row) => (
          <div className="project-asset-item" key={`${row.type}-${row.label}`}>
            <div>
              <strong>{row.label}</strong>
              <small>{row.type}</small>
            </div>
            <span>{money(fromUsd(row.monthlyUsd, displayCurrency), displayCurrency)}/mo</span>
          </div>
        ))}
        <div className="project-cost-total">
          <span>Total monthly</span>
          <strong>{money(fromUsd(analytics.totalUsd, displayCurrency), displayCurrency)}</strong>
        </div>
        <div className="project-cost-total" style={{ borderTop: 0, paddingTop: 0 }}>
          <span>Annual cost</span>
          <strong>{money(fromUsd(analytics.annualUsd, displayCurrency), displayCurrency)}</strong>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>Cost Allocation</h4>
        {analytics.allocation.map((row) => (
          <div className="cost-allocation-row" key={row.label} style={{ marginBottom: 10 }}>
            <div className="cost-allocation-meta">
              <span>{row.label}</span>
              <span>{row.percent}%</span>
            </div>
            <Progress value={row.percent} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>Cost Trend</h4>
        <div className="annual-chart">
          {analytics.trend.map((point, i) => (
            <div
              key={point.label}
              className="annual-chart-segment"
              style={{ flexGrow: point.value || 1, background: `hsl(${200 + i * 30}, 70%, 60%)` }}
              title={`${point.label}: ${money(fromUsd(point.value, displayCurrency), displayCurrency)}`}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export function ProjectDetailsDrawer({
  project,
  records,
  open,
  onClose,
  money,
  prettyDate,
  toUsd,
  fromUsd,
  displayCurrency,
  monthlyUsd,
}) {
  if (!project) return null
  const normalized = normalizeProjectRecord(project)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={normalized.name}
      description={normalized.category}
    >
      <div className="project-drawer-hero">
        <div className="repo-avatar"><span>{normalized.name.slice(0, 2).toUpperCase()}</span></div>
        <div>
          <h3>{normalized.name}</h3>
          <p>{normalized.description || 'No description'}</p>
        </div>
        <Badge variant={projectStatusVariant(normalized.status)}>{normalized.status}</Badge>
      </div>

      <Tabs
        defaultValue="overview"
        items={[
          {
            value: 'overview',
            label: 'Overview',
            content: (
              <OverviewTab
                project={project}
                money={money}
                fromUsd={fromUsd}
                displayCurrency={displayCurrency}
                monthlyUsd={monthlyUsd}
              />
            ),
          },
          {
            value: 'assets',
            label: 'Assets',
            content: <AssetsTab project={project} records={records} />,
          },
          {
            value: 'costs',
            label: 'Costs',
            content: (
              <CostsTab
                project={project}
                records={records}
                toUsd={toUsd}
                money={money}
                fromUsd={fromUsd}
                displayCurrency={displayCurrency}
              />
            ),
          },
          {
            value: 'notes',
            label: 'Notes',
            content: <p>{normalized.notes || 'No notes yet.'}</p>,
          },
        ]}
      />
    </Drawer>
  )
}
