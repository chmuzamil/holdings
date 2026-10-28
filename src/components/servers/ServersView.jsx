import { useMemo, useState } from 'react'
import { UptimeBadge } from '../server/UptimeBadge'
import { ChevronDown, Edit3, Eye, Search, Trash2, Unplug } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { DropdownMenu } from '../ui/DropdownMenu'
import { EmptyState } from '../EmptyState'
import { ServerDetailsDrawer } from './ServerDetailsDrawer'
import {
  formatServerSpecsLine,
  normalizeServerRecord,
} from '../../lib/server-helpers'
import './servers.css'
import '../ui/ui.css'

export function ServersView({
  onWhatIf,
  records,
  displayCurrency,
  money,
  prettyDate,
  toUsd,
  fromUsd,
  isAttention,
  openCreate,
  openEdit,
  setDeleteTarget,
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedServer, setSelectedServer] = useState(null)

  const servers = useMemo(() => records.servers || [], [records.servers])
  const normalized = useMemo(() => servers.map(normalizeServerRecord), [servers])

  const visibleServers = useMemo(() => {
    return [...normalized]
      .filter((server) => {
        const haystack = `${server.name} ${server.provider} ${server.ipAddress} ${server.location}`.toLowerCase()
        const matchesSearch = haystack.includes(query.toLowerCase())
        const matchesStatus = statusFilter === 'All' || server.status === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [normalized, query, statusFilter])

  return (
    <section className="page-content servers-view">
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" aria-label="Search servers" type="search" />
        </label>
        <label className="select-box">
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            <option>Active</option>
            <option>Expiring Soon</option>
            <option>Expired</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      <div className="server-table">
        <div className="server-table-head">
          <span>Server</span>
          <span>Specs</span>
          <span>Location</span>
          <span className="numeric">Per month</span>
          <span>Renews</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        {visibleServers.length ? visibleServers.map((server) => (
          <article className={`server-table-row ${isAttention(server) ? 'attention' : ''}`.trim()} key={server.id}>
            <div className="project-main">
              <strong>{server.name}</strong>
              <small>{[server.provider, server.packageName, server.ipAddress].filter(Boolean).join(' · ') || '—'}</small>
            </div>
            <div className="server-specs" data-label="Specs">{formatServerSpecsLine(server) || '—'}</div>
            <div className="project-asset-cell" data-label="Location">{server.location || '—'}</div>
            <div className="project-cost numeric" data-label="Per month">{money(fromUsd(toUsd(server), displayCurrency), displayCurrency)}</div>
            <div className="project-asset-cell" data-label="Renews">{prettyDate(server.renewalDate)}</div>
            <div data-label="Status" className="status-badges"><Badge variant={server.status === 'Active' ? 'success' : 'warning'}>{server.status}</Badge> <UptimeBadge itemId={server.id} /></div>
            <div className="repo-actions">
              <button className="ui-btn ui-btn-secondary" type="button" onClick={() => setSelectedServer(server)}>
                <Eye size={15} aria-hidden="true" /> Details
              </button>
              <DropdownMenu items={[
                { label: 'What breaks if it stops?', icon: <Unplug size={14} />, onClick: () => onWhatIf?.(server) },
                { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => openEdit('servers', server) },
                { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleteTarget({ ...server, moduleKey: 'servers' }) },
              ]} />
            </div>
          </article>
        )) : (
          <EmptyState
            variant="default"
            title="No servers yet"
            text="Add a server to track what it costs and what runs on it."
            action={() => openCreate('servers')}
            actionLabel="Add server"
          />
        )}
      </div>

      <ServerDetailsDrawer
        server={selectedServer}
        records={records}
        open={Boolean(selectedServer)}
        onClose={() => setSelectedServer(null)}
        money={money}
        prettyDate={prettyDate}
        toUsd={toUsd}
        fromUsd={fromUsd}
        displayCurrency={displayCurrency}
      />
    </section>
  )
}
