import { useMemo, useState } from 'react'
import { ChevronDown, Edit3, Eye, Globe2, Search, Server, Trash2, FolderGit2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { DropdownMenu } from '../ui/DropdownMenu'
import { EmptyState } from '../EmptyState'
import { ProjectDetailsDrawer } from './ProjectDetailsDrawer'
import { getProjectGaps } from '../../lib/health-score'
import {
  computeProjectMonthlyCostUsd,
  computeProjectStats,
  getCostSummary,
  getLedger,
  getLedgerRow,
  normalizeProjectRecord,
  projectStatuses,
  projectStatusVariant,
} from '../../lib/project-helpers'
import { resolveProjectAssets } from '../../lib/asset-helpers'
import './projects.css'
import '../ui/ui.css'

// Cost next to revenue for one project. Revenue that isn't tracked is shown as
// such, never as zero.
function ProjectMoney({ project, records, toUsd, money, fromUsd, displayCurrency }) {
  const row = getLedgerRow(project, records, toUsd)
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)
  return (
    <div className="project-money">
      <strong>{show(row?.costMonthlyUsd ?? 0)}/mo</strong>
      {row?.revenueMonthlyUsd == null ? (
        <small>Revenue not tracked</small>
      ) : (
        <small className={row.profitMonthlyUsd < 0 ? 'money-loss' : 'money-gain'}>
          Earns {show(row.revenueMonthlyUsd)} · {show(Math.abs(row.profitMonthlyUsd))} {row.profitMonthlyUsd < 0 ? 'loss' : 'profit'}
        </small>
      )}
    </div>
  )
}

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
  const gaps = getProjectGaps(normalizeProjectRecord(project))
  const connections = [
    assets.domains[0] && { icon: Globe2, label: assets.domains[0].name },
    assets.repos[0] && { icon: FolderGit2, label: assets.repos[0].name },
    assets.servers[0] && { icon: Server, label: assets.servers[0].name },
  ].filter(Boolean)

  return (
    <Card className="project-card">
      <div className="project-card-head">
        <div className="project-card-title">
          <strong>{project.name}</strong>
          <small>{project.category} · {project.status}</small>
        </div>
        <Badge variant={projectStatusVariant(project.status)}>{project.status}</Badge>
      </div>

      {gaps.length > 0 && (
        <p className="project-card-gaps">{gaps.map((gap) => gap.label).join(' · ')}</p>
      )}

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
        <ProjectMoney project={project} records={records} toUsd={toUsd} money={money} fromUsd={fromUsd} displayCurrency={displayCurrency} />
        <div className="repo-actions">
          <button className="ui-btn ui-btn-secondary" type="button" onClick={() => onView(project)}>
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

  const projects = useMemo(() => records.projects || [], [records.projects])
  const normalized = useMemo(() => projects.map(normalizeProjectRecord), [projects])
  const stats = useMemo(() => computeProjectStats(projects, records, toUsd), [projects, records, toUsd])
  const costSummary = getCostSummary(records, toUsd)
  const ledger = getLedger(records, toUsd)
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)
  const unassignedNames = costSummary.unassigned.filter((line) => line.monthlyUsd > 0).map((line) => line.name)
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
        <Card className="projects-stat-card">
          <span>Monthly revenue</span>
          <strong>{show(ledger.revenueMonthlyUsd)}</strong>
          <small>{ledger.projectsWithRevenue} of {stats.total} projects tracked</small>
        </Card>
        <Card className="projects-stat-card">
          <span>Monthly costs</span>
          <strong>{show(ledger.costMonthlyUsd)}</strong>
          <small>{show(stats.monthlyUsd)} in projects</small>
        </Card>
        <Card className="projects-stat-card">
          <span>Monthly profit</span>
          <strong className={ledger.profitMonthlyUsd < 0 ? 'money-loss' : 'money-gain'}>{show(ledger.profitMonthlyUsd)}</strong>
          <small>Revenue minus every cost</small>
        </Card>
        <Card className="projects-stat-card" title={unassignedNames.join(', ')}>
          <span>Not in any project</span>
          <strong>{show(costSummary.unassignedMonthlyUsd)}</strong>
          {unassignedNames.length > 0 && (
            <small>{unassignedNames.slice(0, 3).join(', ')}{unassignedNames.length > 3 ? ` +${unassignedNames.length - 3} more` : ''}</small>
          )}
        </Card>
      </div>

      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects" type="search" />
        </label>
        <label className="select-box">
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
              <span>Missing</span>
              <span>Connected</span>
              <span>Money</span>
              <span>Actions</span>
            </div>
            {visibleProjects.map((project) => {
              const assets = resolveProjectAssets(project, records)
              const gaps = getProjectGaps(normalizeProjectRecord(project))
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
                  <div className="project-asset-cell">{gaps.length ? gaps.map((gap) => gap.label).join(' · ') : 'Nothing missing'}</div>
                  <div className="project-asset-cell">{connected}</div>
                  <div className="project-cost">
                    <ProjectMoney project={project} records={records} toUsd={toUsd} money={money} fromUsd={fromUsd} displayCurrency={displayCurrency} />
                  </div>
                  <div className="repo-actions">
                    <button className="ui-btn ui-btn-secondary" type="button" onClick={() => setSelectedProject(project)}>
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
          text="Add a project, then link the domains, servers and services it uses."
          action={() => openCreate('projects')}
          actionLabel="Add project"
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
