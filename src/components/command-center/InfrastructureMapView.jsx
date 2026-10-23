import { CreditCard, FolderGit2, Globe2, Server } from 'lucide-react'
import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getInfrastructureGraph } from '../../lib/intelligence-helpers'
import './command-center.css'

const MAX_NODES = 8

const NODE_ICONS = {
  domain: Globe2,
  repo: FolderGit2,
  server: Server,
  subscription: CreditCard,
}

function GraphHub({ project, setActivePage }) {
  const nodes = [
    project.domain && { type: 'domain', id: project.domain.id, label: project.domain.name, page: 'domains' },
    ...project.repos.map((repo) => ({ type: 'repo', id: repo.id, label: repo.name, page: 'repos' })),
    ...project.servers.map((server) => ({ type: 'server', id: server.id, label: server.name, page: 'servers' })),
    ...project.subscriptions.map((sub) => ({ type: 'subscription', id: sub.id, label: sub.name, page: 'subscriptions' })),
  ].filter(Boolean)

  if (!nodes.length) {
    return (
      <div className="infra-graph-empty">
        <span className="infra-graph-hub">{project.name}</span>
        <p>Nothing linked yet</p>
      </div>
    )
  }

  // Past MAX_NODES, the rest fold into one "+N more" node that opens the project list.
  const shown = nodes.length > MAX_NODES
    ? [...nodes.slice(0, MAX_NODES - 1), { type: 'more', id: 'more', label: `+${nodes.length - MAX_NODES + 1} more`, page: 'projects' }]
    : nodes
  const placed = shown.map((node, index) => {
    const angle = (-90 + (360 / shown.length) * index) * (Math.PI / 180)
    return { ...node, x: 50 + 36 * Math.cos(angle), y: 50 + 38 * Math.sin(angle) }
  })

  return (
    <div className="infra-graph">
      <svg className="infra-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {placed.map((node) => (
          <line key={`${node.type}-${node.id}`} x1="50" y1="50" x2={node.x} y2={node.y} />
        ))}
      </svg>
      {placed.map((node) => {
        const Icon = NODE_ICONS[node.type]
        return (
          <button
            key={`${node.type}-${node.id}`}
            type="button"
            className="infra-graph-node"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            onClick={() => setActivePage(node.page)}
          >
            <span className="infra-graph-node-inner">
              {Icon && <Icon size={14} aria-hidden="true" />}
              <span>{node.label}</span>
            </span>
          </button>
        )
      })}
      <button type="button" className="infra-graph-hub" onClick={() => setActivePage('projects')}>
        {project.name}
      </button>
    </div>
  )
}

export function InfrastructureMapView({ records, setActivePage }) {
  const graph = getInfrastructureGraph(records)

  return (
    <section className="page-content cc-page infra-page">
      {graph.length ? (
        <div className="infra-graph-grid">
          {graph.map((project) => (
            <Card key={project.id} className="infra-graph-card">
              <GraphHub project={project} setActivePage={setActivePage} />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          variant="projects"
          title="No connections yet"
          text="Link a domain, server or repo to a project to see it here."
        />
      )}
    </section>
  )
}
