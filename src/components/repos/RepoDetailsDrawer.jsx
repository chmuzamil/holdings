import { ExternalLink } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { Tabs } from '../ui/Tabs'
import {
  devStatusVariant,
  getLanguageColor,
  githubHealthVariant,
  normalizeRepoRecord,
  prettyMonthYear,
  timeAgo,
  visibilityVariant,
} from '../../lib/repo-helpers'
import { resolveRepoConnections } from '../../lib/asset-helpers'

function OverviewTab({ repo, records }) {
  const connections = records ? resolveRepoConnections(repo, records) : { projects: [], domains: [], servers: [] }
  return (
    <>
      <div className="repo-drawer-hero">
        <Avatar name={repo.owner || repo.name} size="md" />
        <div>
          <h3>{repo.name}</h3>
          <p>{repo.description || 'No description provided.'}</p>
        </div>
        <Badge variant={devStatusVariant(repo.devStatus)}>{repo.devStatus}</Badge>
      </div>

      <div className="ui-kv-grid">
        <div className="ui-kv-row">
          <span className="ui-kv-label">Visibility</span>
          <span className="ui-kv-value">
            <Badge variant={visibilityVariant(repo.visibility)}>{repo.visibility}</Badge>
          </span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Category</span>
          <span className="ui-kv-value">{repo.category}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Language</span>
          <span className="ui-kv-value">
            {repo.language ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="repo-language-dot"
                  style={{ background: getLanguageColor(repo.language) }}
                />
                {repo.language}
              </span>
            ) : '—'}
          </span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Last commit</span>
          <span className="ui-kv-value">{timeAgo(repo.lastCommitAt)}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Created</span>
          <span className="ui-kv-value">{prettyMonthYear(repo.createdAt)}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Updated</span>
          <span className="ui-kv-value">{prettyMonthYear(repo.updatedAt)}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">GitHub Health</span>
          <span className="ui-kv-value">
            <Badge variant={githubHealthVariant(repo.githubHealth)}>{repo.githubHealth}</Badge>
            {repo.statsUnavailable && <small style={{ marginLeft: 8 }}>Stats unavailable</small>}
          </span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Project Status</span>
          <span className="ui-kv-value"><Badge variant={devStatusVariant(repo.projectStatus)}>{repo.projectStatus}</Badge></span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Connected Project</span>
          <span className="ui-kv-value">{connections.projects.map((p) => p.name).join(', ') || '—'}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Connected Domain</span>
          <span className="ui-kv-value">{connections.domains.map((d) => d.name).join(', ') || repo.connectedDomain || '—'}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Connected Server</span>
          <span className="ui-kv-value">{connections.servers.map((s) => s.name).join(', ') || '—'}</span>
        </div>
        <div className="ui-kv-row">
          <span className="ui-kv-label">Deployment</span>
          <span className="ui-kv-value">{repo.deployment || '—'}</span>
        </div>
      </div>

      {repo.techStack.length > 0 && (
        <div className="repo-drawer-section">
          <h4>Tech Stack</h4>
          <div className="repo-tech-list">
            {repo.techStack.map((tech) => (
              <span key={tech} className="repo-tech-chip">{tech}</span>
            ))}
          </div>
        </div>
      )}

      {(repo.connectedDomain || repo.deployment || repo.database) && (
        <div className="repo-drawer-section">
          <h4>Connected Assets</h4>
          <div className="ui-kv-grid">
            {repo.connectedDomain && (
              <div className="ui-kv-row">
                <span className="ui-kv-label">Domain</span>
                <span className="ui-kv-value">{repo.connectedDomain}</span>
              </div>
            )}
            {repo.deployment && (
              <div className="ui-kv-row">
                <span className="ui-kv-label">Deployment</span>
                <span className="ui-kv-value">{repo.deployment}</span>
              </div>
            )}
            {repo.database && (
              <div className="ui-kv-row">
                <span className="ui-kv-label">Database</span>
                <span className="ui-kv-value">{repo.database}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function MetricsTab({ repo }) {
  const metrics = [
    { label: 'Stars', value: repo.stars, icon: '⭐' },
    { label: 'Forks', value: repo.forks, icon: '🍴' },
    { label: 'Open Issues', value: repo.openIssues, icon: '🐞' },
    { label: 'Watchers', value: repo.watchers, icon: '👀' },
  ]

  return (
    <div className="repo-metrics-grid">
      {metrics.map((metric) => (
        <div key={metric.label} className="repo-metric-card">
          <span>{metric.icon} {metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  )
}

function LinksTab({ repo }) {
  const links = [
    { label: 'GitHub URL', value: repo.url },
    { label: 'Live URL', value: repo.liveUrl },
    { label: 'Documentation URL', value: repo.docsUrl },
  ].filter((link) => link.value)

  if (!links.length) {
    return <div className="repo-empty-panel">No links added for this repository yet.</div>
  }

  return (
    <div className="repo-link-list">
      {links.map((link) => (
        <a
          key={link.label}
          className="repo-link-item"
          href={link.value}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{link.label}</span>
          <ExternalLink size={14} />
        </a>
      ))}
    </div>
  )
}

function NotesTab({ repo }) {
  if (!repo.notes) {
    return <div className="repo-empty-panel">No notes added for this repository yet.</div>
  }

  return (
    <div className="ui-card" style={{ padding: '14px' }}>
      <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.55, fontSize: '13px' }}>
        {repo.notes}
      </p>
    </div>
  )
}

export function RepoDetailsDrawer({ record, records, open, onClose }) {
  if (!record) return null
  const repo = normalizeRepoRecord(record)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={repo.name}
      description="Repository portfolio details and project metadata"
    >
      <Tabs
        defaultValue="overview"
        items={[
          {
            value: 'overview',
            label: 'Overview',
            content: <OverviewTab repo={repo} records={records} />,
          },
          {
            value: 'metrics',
            label: 'Metrics',
            content: <MetricsTab repo={repo} />,
          },
          {
            value: 'links',
            label: 'Links',
            content: <LinksTab repo={repo} />,
          },
          {
            value: 'notes',
            label: 'Notes',
            content: <NotesTab repo={repo} />,
          },
        ]}
      />
    </Drawer>
  )
}
