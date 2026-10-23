import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Tabs } from '../ui/Tabs'
import {
  normalizeProjectRecord,
  projectStatusVariant,
} from '../../lib/project-helpers'
import { getProjectCostAnalytics } from '../../lib/intelligence-helpers'
import { percentLabel } from '../../lib/format'
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
        <span className="ui-kv-label">Monthly cost</span>
        <span className="ui-kv-value">{money(fromUsd(monthlyUsd, displayCurrency), displayCurrency)}</span>
      </div>
      <div className="ui-kv-row">
        <span className="ui-kv-label">Monthly revenue</span>
        <span className="ui-kv-value">
          {normalized.monthlyRevenueUsd === null
            ? 'Not tracked'
            : money(fromUsd(normalized.monthlyRevenueUsd, displayCurrency), displayCurrency)}
        </span>
      </div>
      {normalized.monthlyRevenueUsd !== null && (
        <div className="ui-kv-row">
          <span className="ui-kv-label">Monthly profit</span>
          <span className={`ui-kv-value ${normalized.monthlyRevenueUsd - monthlyUsd < 0 ? 'money-loss' : 'money-gain'}`}>
            {money(fromUsd(normalized.monthlyRevenueUsd - monthlyUsd, displayCurrency), displayCurrency)}
          </span>
        </div>
      )}
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
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)
  return (
    <>
      <div className="project-asset-list">
        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>Cost Breakdown</h4>
        {analytics.breakdown.rows.map((row) => (
          <div className="project-asset-item" key={`${row.type}-${row.label}`}>
            <div>
              <strong>{row.label}</strong>
              <small>
                {row.type}
                {row.sharedBy > 1 && ` · shared by ${row.sharedBy} projects, ${show(row.assetMonthlyUsd)}/mo in total`}
              </small>
            </div>
            <span>{show(row.monthlyUsd)}/mo</span>
          </div>
        ))}
        <div className="project-cost-total">
          <span>Total monthly</span>
          <strong>{show(analytics.totalUsd)}</strong>
        </div>
        <div className="project-cost-total" style={{ borderTop: 0, paddingTop: 0 }}>
          <span>Annual cost</span>
          <strong>{show(analytics.annualUsd)}</strong>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>Cost Allocation</h4>
        {analytics.allocation.map((row) => (
          <div className="cost-allocation-row" key={row.label} style={{ marginBottom: 10 }}>
            <div className="cost-allocation-meta">
              <span>{row.label}</span>
              <span>{percentLabel(row.share)}</span>
            </div>
            <Progress value={row.share.percent} label={`${row.label}: ${percentLabel(row.share)} of this project's cost`} />
          </div>
        ))}
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
