import { CreditCard, FolderGit2, Globe2, Server } from 'lucide-react'
import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getInfrastructureGraph } from '../../lib/intelligence-helpers'
import './command-center.css'

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
        <p>No linked assets yet</p>
      </div>
    )
  }

  return (
    <div className="infra-graph">
      <div className="infra-graph-spokes">
        {nodes.map((node) => {
          const Icon = NODE_ICONS[node.type]
          return (
            <button
              key={`${node.type}-${node.id}`}
              type="button"
              className="infra-graph-node"
              onClick={() => setActivePage(node.page)}
            >
              <span className="infra-graph-edge" />
              <span className="infra-graph-node-inner">
                <Icon size={14} />
                {node.label}
              </span>
            </button>
          )
        })}
      </div>
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
          text="Link assets to projects to visualize your infrastructure graph."
        />
      )}
    </section>
  )
}
