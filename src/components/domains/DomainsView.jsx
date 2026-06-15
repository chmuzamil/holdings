import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { DomainCard } from './DomainCard'
import { DomainDetailsDrawer } from './DomainDetailsDrawer'
import { EmptyState } from '../EmptyState'
import './domains.css'
import '../ui/ui.css'

export function DomainsView({
  records,
  allRecords,
  servers,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  displayCurrency,
  domainLookupStatus,
  statuses,
  money,
  prettyDate,
  toUsd,
  fromUsd,
  isAttention,
  openCreate,
  openEdit,
  refreshDomainLookup,
  setDeleteTarget,
  onCheckHealth,
}) {
  const [selectedDomain, setSelectedDomain] = useState(null)

  return (
    <section className="page-content domains-view">
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search domains"
          />
        </label>
        <label className="select-box">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <ChevronDown size={16} />
        </label>
        <label className="select-box">
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="renewalDate">Renewal date</option>
            <option value="expiryDate">Expiry date</option>
            <option value="cost">Cost</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      {domainLookupStatus && (
        <div className="inline-status">{domainLookupStatus}</div>
      )}

      <div className="domains-grid">
        {records.length ? records.map((record) => (
          <DomainCard
            key={record.id}
            record={record}
            records={allRecords}
            displayCurrency={displayCurrency}
            attention={isAttention(record)}
            money={money}
            prettyDate={prettyDate}
            toUsd={toUsd}
            fromUsd={fromUsd}
            onViewDetails={setSelectedDomain}
            onRefresh={refreshDomainLookup}
            onEdit={(item) => openEdit('domains', item)}
            onDelete={(item) => setDeleteTarget({ ...item, moduleKey: 'domains' })}
          />
        )) : (
          <EmptyState
            variant="domains"
            title="No domains yet"
            text="Track registrars, renewals, and health checks in one place."
            action={() => openCreate('domains')}
            actionLabel="Add Domain"
          />
        )}
      </div>

      <DomainDetailsDrawer
        record={selectedDomain}
        records={allRecords}
        servers={servers}
        displayCurrency={displayCurrency}
        open={Boolean(selectedDomain)}
        onClose={() => setSelectedDomain(null)}
        money={money}
        prettyDate={prettyDate}
        toUsd={toUsd}
        fromUsd={fromUsd}
        onCheckHealth={onCheckHealth}
      />
    </section>
  )
}
