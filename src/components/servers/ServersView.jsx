import { useMemo, useState } from 'react'
import { ChevronDown, Edit3, Eye, Search, Trash2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { DropdownMenu } from '../ui/DropdownMenu'
import { EmptyState } from '../EmptyState'
import { ServerDetailsDrawer } from './ServerDetailsDrawer'
import {
  countHostedServices,
  formatServerSpecsLine,
  normalizeServerRecord,
} from '../../lib/server-helpers'
import './servers.css'
import '../ui/ui.css'

export function ServersView({
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

  const servers = records.servers || []
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" />
        </label>
        <label className="select-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
          <span>Provider</span>
          <span>IP Address</span>
          <span>Specs</span>
          <span>Location</span>
          <span>Monthly Cost</span>
          <span>Renewal</span>
          <span>Status</span>
          <span>Hosted</span>
          <span>Actions</span>
        </div>
        {visibleServers.length ? visibleServers.map((server) => (
          <article className={`server-table-row ${isAttention(server) ? 'attention' : ''}`.trim()} key={server.id}>
            <div className="project-main">
              <strong>{server.name}</strong>
              <small>{server.packageName || server.provider}</small>
            </div>
            <div className="project-asset-cell">{server.provider || '—'}</div>
            <div className="project-asset-cell">{server.ipAddress || '—'}</div>
            <div className="server-specs">{formatServerSpecsLine(server)}</div>
            <div className="project-asset-cell">{server.location || '—'}</div>
            <div className="project-cost">{money(server.cost, server.currency)}</div>
            <div className="project-asset-cell">{prettyDate(server.renewalDate)}</div>
            <div><Badge variant={server.status === 'Active' ? 'success' : 'warning'}>{server.status}</Badge></div>
            <div className="server-hosted-count">{countHostedServices(server)}</div>
            <div className="repo-actions">
              <button className="ui-btn ui-btn-primary" type="button" onClick={() => setSelectedServer(server)}>
                <Eye size={15} /> View
              </button>
              <DropdownMenu items={[
                { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => openEdit('servers', server) },
                { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleteTarget({ ...server, moduleKey: 'servers' }) },
              ]} />
            </div>
          </article>
        )) : (
          <EmptyState
            variant="default"
            title="No servers yet"
            text="Add your first VPS to track specs, hosted services, and costs."
            action={() => openCreate('servers')}
            actionLabel="Add Server"
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
