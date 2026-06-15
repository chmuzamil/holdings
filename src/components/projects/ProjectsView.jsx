import { useMemo, useState } from 'react'
import { ChevronDown, Edit3, Eye, Globe2, Search, Server, Trash2, FolderGit2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { Progress } from '../ui/Progress'
import { DropdownMenu } from '../ui/DropdownMenu'
import { EmptyState } from '../EmptyState'
import { ProjectDetailsDrawer } from './ProjectDetailsDrawer'
import { getProjectConnectionHealth } from '../../lib/health-score'
import {
  computeProjectMonthlyCostUsd,
  computeProjectStats,
  normalizeProjectRecord,
  projectStatuses,
  projectStatusVariant,
} from '../../lib/project-helpers'
import { resolveProjectAssets } from '../../lib/asset-helpers'
import './projects.css'
import '../ui/ui.css'

function ProjectCard({
  project,
  records,
  displayCurrency,
  money,
  fromUsd,
  toUsd,
  onView,
  onEdit,
  onDelete,
}) {
  const assets = resolveProjectAssets(project, records)
  const monthlyUsd = computeProjectMonthlyCostUsd(project, records, toUsd)
  const health = getProjectConnectionHealth(project)
  const connections = [
    assets.domains[0] && { icon: Globe2, label: assets.domains[0].name },
    assets.repos[0] && { icon: FolderGit2, label: assets.repos[0].name },
    assets.servers[0] && { icon: Server, label: assets.servers[0].name },
  ].filter(Boolean)

  return (
    <Card className="project-card">
      <div className="project-card-head">
        <Avatar name={project.name} size="md" />
        <div className="project-card-title">
          <strong>{project.name}</strong>
          <small>{project.category} · {project.status}</small>
        </div>
        <Badge variant={projectStatusVariant(project.status)}>{project.status}</Badge>
      </div>

      <div className="project-card-health">
        <div className="project-card-health-meta">
          <span>Health {health.score}</span>
          <Badge variant={health.score >= 75 ? 'success' : health.score >= 50 ? 'warning' : 'outline'}>{health.label}</Badge>
        </div>
        <Progress value={health.score} color={health.score >= 75 ? '#34d399' : health.score >= 50 ? '#fbbf24' : '#f87171'} />
      </div>

      <div className="project-card-assets">
        {connections.length ? connections.map((item) => {
          const Icon = item.icon
          return (
            <span key={item.label} className="project-card-asset">
              <Icon size={13} />
              {item.label}
            </span>
          )
        }) : (
          <span className="project-card-asset muted">No assets linked</span>
        )}
      </div>

      <div className="project-card-footer">
        <strong>{money(fromUsd(monthlyUsd, displayCurrency), displayCurrency)}/mo</strong>
        <div className="repo-actions">
          <button className="ui-btn ui-btn-primary" type="button" onClick={() => onView(project)}>
            <Eye size={15} /> View
          </button>
          <DropdownMenu items={[
            { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => onEdit('projects', project) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete({ ...project, moduleKey: 'projects' }) },
          ]} />
        </div>
      </div>
    </Card>
  )
}

export function ProjectsView({
  records,
  displayCurrency,
  money,
  toUsd,
  fromUsd,
  openCreate,
  openEdit,
  setDeleteTarget,
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedProject, setSelectedProject] = useState(null)

  const projects = records.projects || []
  const normalized = useMemo(() => projects.map(normalizeProjectRecord), [projects])
  const stats = useMemo(() => computeProjectStats(projects, records, toUsd), [projects, records, toUsd])
  const useCards = normalized.length > 0 && normalized.length < 5

  const visibleProjects = useMemo(() => {
    return [...normalized]
      .filter((project) => {
        const haystack = `${project.name} ${project.description} ${project.category} ${project.status}`.toLowerCase()
        const matchesSearch = haystack.includes(query.toLowerCase())
        const matchesStatus = statusFilter === 'All' || project.status === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [normalized, query, statusFilter])

  return (
    <section className="page-content projects-view">
      <div className="projects-summary-bar">
        <Card className="projects-stat-card"><span>Projects</span><strong>{stats.total}</strong></Card>
        <Card className="projects-stat-card">
          <span>Portfolio burn</span>
          <strong>{money(fromUsd(stats.monthlyUsd, displayCurrency), displayCurrency)}</strong>
        </Card>
      </div>

      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" />
        </label>
        <label className="select-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            {projectStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      {visibleProjects.length ? (
        useCards ? (
          <div className="project-card-grid">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                records={records}
                displayCurrency={displayCurrency}
                money={money}
                fromUsd={fromUsd}
                toUsd={toUsd}
                onView={setSelectedProject}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <div className="project-table">
            <div className="project-table-head">
              <span>Project</span>
              <span>Status</span>
              <span>Health</span>
              <span>Connected</span>
              <span>Monthly Cost</span>
              <span>Actions</span>
            </div>
            {visibleProjects.map((project) => {
              const assets = resolveProjectAssets(project, records)
              const monthlyUsd = computeProjectMonthlyCostUsd(project, records, toUsd)
              const health = getProjectConnectionHealth(project)
              const connected = [
                assets.domains[0]?.name,
                assets.repos[0]?.name,
                assets.servers[0]?.name,
              ].filter(Boolean).join(' · ') || '—'
              return (
                <article className="project-table-row" key={project.id}>
                  <div className="project-main">
                    <strong>{project.name}</strong>
                    <small>{project.category}</small>
                  </div>
                  <div><Badge variant={projectStatusVariant(project.status)}>{project.status}</Badge></div>
                  <div><Badge variant={health.score >= 75 ? 'success' : health.score >= 50 ? 'warning' : 'outline'}>{health.score}</Badge></div>
                  <div className="project-asset-cell">{connected}</div>
                  <div className="project-cost">{money(fromUsd(monthlyUsd, displayCurrency), displayCurrency)}</div>
                  <div className="repo-actions">
                    <button className="ui-btn ui-btn-primary" type="button" onClick={() => setSelectedProject(project)}>
                      <Eye size={15} /> View
                    </button>
                    <DropdownMenu items={[
                      { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => openEdit('projects', project) },
                      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleteTarget({ ...project, moduleKey: 'projects' }) },
                    ]} />
                  </div>
                </article>
              )
            })}
          </div>
        )
      ) : (
        <EmptyState
          variant="projects"
          title="No projects yet"
          text="Create your first project to connect domains, repos, servers, and subscriptions."
          action={() => openCreate('projects')}
          actionLabel="Add Project"
        />
      )}

      <ProjectDetailsDrawer
        project={selectedProject}
        records={records}
        open={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        money={money}
        toUsd={toUsd}
        fromUsd={fromUsd}
        displayCurrency={displayCurrency}
        monthlyUsd={selectedProject ? computeProjectMonthlyCostUsd(selectedProject, records, toUsd) : 0}
      />
    </section>
  )
}
