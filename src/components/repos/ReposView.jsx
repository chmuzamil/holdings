import { useMemo, useState } from 'react'
import { ChevronDown, RefreshCw, Search } from 'lucide-react'
import { fetchAllRepoStats } from '../../lib/github-api'
import { RepoStats } from './RepoStats'
import { RepoRow } from './RepoRow'
import { RepoDetailsDrawer } from './RepoDetailsDrawer'
import { EmptyState } from '../EmptyState'
import {
  computeRepoStats,
  normalizeRepoRecord,
  repoDevStatuses,
} from '../../lib/repo-helpers'
import './repos.css'
import '../ui/ui.css'

export function ReposView({
  records,
  allRecords,
  openCreate,
  openEdit,
  setDeleteTarget,
  onUpdateRepos,
  githubToken,
}) {
  const [query, setQuery] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('updatedAt')
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsStatus, setStatsStatus] = useState('')

  const normalized = useMemo(() => records.map(normalizeRepoRecord), [records])
  const stats = useMemo(() => computeRepoStats(records), [records])

  const visibleRecords = useMemo(() => {
    return [...normalized]
      .filter((repo) => {
        const haystack = [
          repo.name,
          repo.owner,
          repo.description,
          repo.notes,
          repo.category,
          repo.language,
          ...(repo.techStack || []),
          ...(repo.projectTags || []),
        ].join(' ').toLowerCase()
        const matchesSearch = haystack.includes(query.toLowerCase())
        const matchesVisibility = visibilityFilter === 'All' || repo.visibility === visibilityFilter
        const matchesStatus = statusFilter === 'All' || repo.devStatus === statusFilter
        return matchesSearch && matchesVisibility && matchesStatus
      })
      .sort((a, b) => {
        if (sortBy === 'stars') return b.stars - a.stars
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        return new Date(`${b.updatedAt || b.lastCommitAt || '1970-01-01'}T00:00:00`)
          - new Date(`${a.updatedAt || a.lastCommitAt || '1970-01-01'}T00:00:00`)
      })
  }, [normalized, query, visibilityFilter, statusFilter, sortBy])

  async function refreshStats() {
    setStatsLoading(true)
    setStatsStatus('Refreshing GitHub stats...')
    try {
      const results = await fetchAllRepoStats(records, githubToken)
      onUpdateRepos?.(results)
      const synced = results.filter((item) => item.stats && !item.skipped).length
      setStatsStatus(`Synced ${synced} repositories.`)
    } catch (error) {
      setStatsStatus(`Stats refresh failed: ${error.message}`)
    } finally {
      setStatsLoading(false)
    }
  }

  const lastSynced = records
    .map((repo) => repo.statsSyncedAt)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <section className="page-content repos-view">
      <RepoStats stats={stats} />

      <div className="repo-toolbar">
        <button className="command-action-btn" type="button" onClick={refreshStats} disabled={statsLoading}>
          <RefreshCw size={15} className={statsLoading ? 'spin' : ''} />
          {statsLoading ? 'Refreshing...' : 'Refresh Stats'}
        </button>
        {lastSynced && <span className="inline-status">Last synced {new Date(lastSynced).toLocaleString()}</span>}
        {statsStatus && <span className="inline-status">{statsStatus}</span>}
        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories"
          />
        </label>
        <label className="select-box">
          <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
            <option>All</option>
            <option>Public</option>
            <option>Private</option>
          </select>
          <ChevronDown size={16} />
        </label>
        <label className="select-box">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All</option>
            {repoDevStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <ChevronDown size={16} />
        </label>
        <label className="select-box">
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="updatedAt">Last updated</option>
            <option value="stars">Stars</option>
            <option value="name">Name</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      <div className="repo-table">
        <div className="repo-table-head polish">
          <span>Repository</span>
          <span>Category</span>
          <span>Status</span>
          <span>Language</span>
          <span>Last Push</span>
          <span>Actions</span>
        </div>
        {visibleRecords.length ? visibleRecords.map((record) => (
          <RepoRow
            key={record.id}
            record={record}
            onView={setSelectedRepo}
            onEdit={(item) => openEdit('repos', item)}
            onDelete={(item) => setDeleteTarget({ ...item, moduleKey: 'repos' })}
          />
        )) : (
          <EmptyState
            variant="repos"
            title="No repositories yet"
            text="Track GitHub repos and sync live stats from the drawer."
            action={() => openCreate('repos')}
            actionLabel="Add Repository"
          />
        )}
      </div>

      <RepoDetailsDrawer
        record={selectedRepo}
        records={allRecords}
        open={Boolean(selectedRepo)}
        onClose={() => setSelectedRepo(null)}
      />
    </section>
  )
}
