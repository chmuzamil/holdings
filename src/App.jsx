import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Database,
  Download,
  Edit3,
  FolderGit2,
  GitBranch,
  Globe2,
  HeartPulse,
  LayoutDashboard,
  Layers,
  Lightbulb,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Upload,
  UserCircle,
  WalletCards,
  X,
} from 'lucide-react'
import './App.css'
import { DomainsView } from './components/domains/DomainsView'
import { ReposView } from './components/repos/ReposView'
import { RepoRecordModal } from './components/repos/RepoRecordModal'
import { ProjectsView } from './components/projects/ProjectsView'
import { ProjectRecordModal } from './components/projects/ProjectRecordModal'
import { ServersView } from './components/servers/ServersView'
import { EmptyState } from './components/EmptyState'
import { normalizeDomainRecord, normalizeSubdomains } from './lib/domain-helpers'
import {
  dedupeRepoRecords,
  emptyRepoRecord,
  mapGitHubRepo,
  mergeGitHubImportedRepos,
  normalizeRepoRecord,
} from './lib/repo-helpers'
import { emptyProjectRecord, normalizeProjectRecord } from './lib/project-helpers'
import { emptyServerRecord, normalizeServerRecord } from './lib/server-helpers'
import { getSeedRecords, isRecordsEmpty } from './lib/seed-data'
import { DashboardView } from './components/dashboard/DashboardView'
import { InfrastructureMapView } from './components/command-center/InfrastructureMapView'
import { InsightsView } from './components/command-center/InsightsView'
import { AttentionCenterView } from './components/command-center/AttentionCenterView'
import { TimelineView } from './components/command-center/TimelineView'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { AddAssetDropdown } from './components/shared/AddAssetDropdown'
import { ProjectHealthView } from './components/command-center/ProjectHealthView'
import { isRenewableModule, isRenewableRecord } from './lib/renewal-helpers'
import { getPageMeta } from './lib/page-config'
import { buildExport, exportFileName, parseImport } from './lib/data-transfer'
import {
  CURRENCIES,
  convert,
  defaultCurrencySettings,
  fetchLatestRates,
  formatMoney,
  legacyRatesPerUsd,
  mergeRates,
  missingRates,
  rateFor,
} from './lib/currency'

const moduleConfig = {
  domains: {
    title: 'Domains',
    singular: 'Domain',
    icon: Globe2,
    empty: 'No domains tracked yet.',
    fields: [
      { key: 'name', label: 'Domain', type: 'text' },
      { key: 'provider', label: 'Registrar', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'subdomains', label: 'Subdomains', type: 'subdomainList' },
      { key: 'cost', label: 'Yearly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  projects: {
    title: 'Projects',
    singular: 'Project',
    icon: Layers,
    empty: 'No projects tracked yet.',
    fields: [],
  },
  servers: {
    title: 'VPS / Servers',
    singular: 'Server',
    icon: Server,
    empty: 'No servers tracked yet.',
    fields: [
      { key: 'name', label: 'Server', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'packageName', label: 'Package name', type: 'text' },
      { key: 'ipAddress', label: 'IP Address', type: 'text' },
      { key: 'cpu', label: 'CPU cores', type: 'number' },
      { key: 'ramGb', label: 'RAM (GB)', type: 'number' },
      { key: 'storage', label: 'Storage', type: 'text' },
      { key: 'bandwidth', label: 'Bandwidth', type: 'text' },
      { key: 'os', label: 'OS', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'hostedServices', label: 'Hosted services (comma separated)', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'cost', label: 'Monthly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  repos: {
    title: 'GitHub Repos',
    singular: 'Repository',
    icon: FolderGit2,
    empty: 'No repositories tracked yet.',
    fields: [],
  },
  accounts: {
    title: 'Accounts',
    singular: 'Account',
    icon: UserCircle,
    empty: 'No online accounts tracked yet.',
    fields: [
      { key: 'name', label: 'Account', type: 'text' },
      { key: 'provider', label: 'Platform', type: 'text' },
      { key: 'cost', label: 'Monthly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Review date', type: 'date' },
      { key: 'expiryDate', label: 'Attention date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  subscriptions: {
    title: 'Subscriptions',
    singular: 'Subscription',
    icon: WalletCards,
    empty: 'No subscriptions tracked yet.',
    fields: [
      { key: 'name', label: 'Subscription', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'cost', label: 'Monthly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
}

const statuses = ['Active', 'Expiring Soon', 'Expired', 'Cancelled']

const storageKey = 'founder-os-records-v2'
const legacyStorageKey = 'founder-os-records-v1'
const settingsStorageKey = 'founder-os-settings-v1'

const recordModules = ['domains', 'servers', 'repos', 'projects', 'accounts', 'subscriptions']
// Demo builds (e.g. the public GitHub Pages site) open with the fictional portfolio.
const isDemoBuild = import.meta.env.VITE_DEMO === 'true'

function normalizeRecordsByModule(recordsByModule) {
  return Object.fromEntries(
    recordModules.map((moduleKey) => {
      const records = Array.isArray(recordsByModule[moduleKey]) ? recordsByModule[moduleKey] : []
      return [
        moduleKey,
        moduleKey === 'domains'
          ? records.map(normalizeDomainRecord)
          : moduleKey === 'repos'
            ? dedupeRepoRecords(records.map(normalizeRepoRecord))
            : moduleKey === 'servers'
              ? records.map(normalizeServerRecord)
              : moduleKey === 'projects'
                ? records.map(normalizeProjectRecord)
                : records,
      ]
    }),
  )
}

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'attention', label: 'Attention', icon: AlertTriangle },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { type: 'divider' },
  { id: 'infrastructure-map', label: 'Infrastructure', icon: GitBranch },
  { id: 'project-health', label: 'Health', icon: HeartPulse },
  { type: 'divider' },
  { id: 'projects', label: 'Projects', icon: Layers },
  { id: 'domains', label: 'Domains', icon: Globe2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'repos', label: 'Repos', icon: FolderGit2 },
  { id: 'accounts', label: 'Accounts', icon: UserCircle },
  { id: 'subscriptions', label: 'Subscriptions', icon: WalletCards },
  { type: 'divider' },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const emptyRecord = {
  name: '',
  provider: '',
  ipAddress: '',
  notes: '',
  subdomains: [],
  cost: 0,
  currency: 'USD',
  renewalDate: '',
  expiryDate: '',
  status: 'Active',
}

const defaultSettings = {
  githubUsername: '',
  githubApiBase: 'https://api.github.com',
  githubToken: '',
  ...defaultCurrencySettings,
}

function persistableSettings(settings) {
  const { githubToken, ...persistable } = settings
  return persistable
}

function loadSavedRecords() {
  try {
    let saved = window.localStorage.getItem(storageKey)
    if (!saved) {
      const legacy = window.localStorage.getItem(legacyStorageKey)
      if (legacy) {
        window.localStorage.setItem(storageKey, legacy)
        saved = legacy
      }
    }
    if (!saved) return normalizeRecordsByModule(isDemoBuild ? getSeedRecords() : {})
    const parsed = JSON.parse(saved)
    if (!parsed.projects) parsed.projects = []
    return normalizeRecordsByModule(parsed)
  } catch {
    return normalizeRecordsByModule({})
  }
}

function loadSavedSettings() {
  try {
    const saved = window.localStorage.getItem(settingsStorageKey)
    if (!saved) return { ...defaultSettings }

    const parsed = JSON.parse(saved)
    const { githubToken, ...persistable } = parsed

    if (githubToken) {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(persistable))
    }

    const ratesPerUsd = persistable.ratesPerUsd || legacyRatesPerUsd
    const ratesSource = persistable.ratesPerUsd ? persistable.ratesSource : 'Rate from an earlier version'
    return { ...defaultSettings, ...persistable, ratesPerUsd, ratesSource, githubToken: '' }
  } catch {
    return { ...defaultSettings }
  }
}

function persistRecords(records) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(records))
  } catch {
    // ignore quota errors
  }
}

function prettyDate(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function daysUntil(value) {
  if (!value) return null
  const today = new Date()
  const target = new Date(`${value}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

function getReminder(record) {
  if (record.moduleKey && !isRenewableModule(record.moduleKey)) return ''
  const days = daysUntil(record.renewalDate || record.expiryDate)
  if (days === null) return 'No date set'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Due today'
  return `${days} days left`
}

function isAttention(record) {
  if (record.moduleKey && !isRenewableModule(record.moduleKey)) return false
  const days = daysUntil(record.renewalDate || record.expiryDate)
  return record.status === 'Expired' || record.status === 'Expiring Soon' || (days !== null && days <= 30)
}

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [records, setRecords] = useState(loadSavedRecords)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('renewalDate')
  const [appSettings, setAppSettings] = useState(loadSavedSettings)
  const [ratesStatus, setRatesStatus] = useState('')
  const [githubSyncStatus, setGithubSyncStatus] = useState('')
  const [domainLookupStatus, setDomainLookupStatus] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [commandOpen, setCommandOpen] = useState(false)

  const rates = appSettings.ratesPerUsd
  const displayCurrency = rateFor(appSettings.baseCurrency, rates) ? appSettings.baseCurrency : 'USD'
  const setDisplayCurrency = (baseCurrency) => setAppSettings((current) => ({ ...current, baseCurrency }))
  // Costs in a currency without a rate count as 0 in totals; a banner says so.
  const toUsd = useCallback((record) => convert(record.cost, record.currency || 'USD', 'USD', rates) ?? 0, [rates])
  const fromUsd = useCallback((value, currency) => convert(value, 'USD', currency, rates) ?? 0, [rates])
  const money = formatMoney
  const ratelessCurrencies = useMemo(() => missingRates(records, rates), [records, rates])

  async function refreshRates() {
    setRatesStatus('Fetching rates…')
    try {
      const { ratesPerUsd, date } = await fetchLatestRates()
      setAppSettings((current) => ({
        ...current,
        ratesPerUsd: mergeRates(current.ratesPerUsd, ratesPerUsd),
        ratesUpdatedAt: date,
        ratesSource: 'European Central Bank, via frankfurter.dev',
      }))
      setRatesStatus(`Updated rates for ${Object.keys(ratesPerUsd).length} currencies.`)
    } catch (error) {
      setRatesStatus(`Could not fetch rates: ${error.message}`)
    }
  }

  function setRate(currency, value) {
    setAppSettings((current) => {
      const ratesPerUsd = { ...current.ratesPerUsd }
      if (value === '') delete ratesPerUsd[currency]
      else ratesPerUsd[currency] = Number(value)
      const today = new Date().toLocaleDateString('en-CA')
      return { ...current, ratesPerUsd, ratesSource: 'Edited by hand', ratesUpdatedAt: today }
    })
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    persistRecords(records)
  }, [records])

  useEffect(() => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(persistableSettings(appSettings)))
  }, [appSettings])

  const flatRecords = useMemo(
    () =>
      Object.entries(records).flatMap(([moduleKey, items]) =>
        items.map((item) => ({ ...item, moduleKey })),
      ),
    [records],
  )

  const stats = useMemo(() => {
    const domainYearly = records.domains.reduce((sum, item) => sum + toUsd(item), 0)
    const monthly = records.servers.reduce((sum, item) => sum + toUsd(item), 0)
      + records.accounts.reduce((sum, item) => sum + toUsd(item), 0)
      + records.subscriptions.reduce((sum, item) => sum + toUsd(item), 0)
      + domainYearly / 12
    const renewableRecords = flatRecords.filter(isRenewableRecord)
    const attention = renewableRecords.filter(isAttention)
    return {
      domains: records.domains.length,
      servers: records.servers.length,
      repos: records.repos.length,
      accounts: records.accounts.length,
      monthly,
      yearly: monthly * 12 + domainYearly,
      upcoming: attention.filter((item) => item.status !== 'Expired').length,
      expired: renewableRecords.filter((item) => item.status === 'Expired' || daysUntil(item.expiryDate) < 0).length,
    }
  }, [records, flatRecords, toUsd])

  const currentConfig = moduleConfig[activePage]
  const pageMeta = getPageMeta(activePage)
  const visibleRecords = useMemo(() => {
    if (!currentConfig) return []
    return [...records[activePage]]
      .filter((item) => {
        const subdomainHaystack = activePage === 'domains'
          ? normalizeSubdomains(item).map((sub) => {
              const server = records.servers.find((entry) => entry.id === sub.serverId)
              return `${sub.name} ${sub.notes || ''} ${server?.name || ''} ${server?.ipAddress || ''}`
            }).join(' ')
          : ''
        const haystack = `${item.name} ${item.provider} ${item.ipAddress || ''} ${item.notes || ''} ${subdomainHaystack}`.toLowerCase()
        const matchesSearch = haystack.includes(query.toLowerCase())
        const matchesStatus = statusFilter === 'All' || item.status === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        if (sortBy === 'cost') return toUsd(b) - toUsd(a)
        return new Date(`${a[sortBy] || '2999-12-31'}T00:00:00`) - new Date(`${b[sortBy] || '2999-12-31'}T00:00:00`)
      })
  }, [activePage, currentConfig, query, records, sortBy, statusFilter, toUsd])

  function openCreate(moduleKey) {
    const values = moduleKey === 'repos'
      ? emptyRepoRecord
      : moduleKey === 'projects'
        ? emptyProjectRecord
        : moduleKey === 'servers'
          ? emptyServerRecord
          : emptyRecord
    setModal({ moduleKey, mode: 'create', values: 'currency' in values ? { ...values, currency: displayCurrency } : values })
  }

  function openEdit(moduleKey, record) {
    const values = moduleKey === 'domains'
      ? normalizeDomainRecord(record)
      : moduleKey === 'repos'
        ? normalizeRepoRecord(record)
        : moduleKey === 'projects'
          ? normalizeProjectRecord(record)
          : moduleKey === 'servers'
            ? normalizeServerRecord(record)
            : { ...record }
    setModal({ moduleKey, mode: 'edit', id: record.id, values })
  }

  function saveRecord(event) {
    event.preventDefault()
    const values = modal.moduleKey === 'repos'
      ? normalizeRepoRecord({
          ...modal.values,
          stars: Number(modal.values.stars || 0),
          forks: Number(modal.values.forks || 0),
          openIssues: Number(modal.values.openIssues || 0),
          watchers: Number(modal.values.watchers || 0),
        })
      : modal.moduleKey === 'projects'
        ? normalizeProjectRecord(modal.values)
        : modal.moduleKey === 'servers'
          ? normalizeServerRecord({
              ...modal.values,
              cost: Number(modal.values.cost || 0),
              cpu: Number(modal.values.cpu || 0),
              ramGb: Number(modal.values.ramGb || 0),
              hostedServices: Array.isArray(modal.values.hostedServices)
                ? modal.values.hostedServices
                : String(modal.values.hostedServices || '')
                  .split(/[\n,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
            })
          : {
              ...modal.values,
              cost: Number(modal.values.cost || 0),
              ...(modal.moduleKey === 'domains'
                ? {
                    subdomains: (modal.values.subdomains || []).filter((sub) => sub.name?.trim()),
                  }
                : {}),
            }
    setRecords((current) => {
      const next = { ...current }
      if (modal.mode === 'create') {
        const now = new Date().toISOString()
        next[modal.moduleKey] = [
          { ...values, id: `${modal.moduleKey}-${crypto.randomUUID()}`, addedAt: now, editedAt: now },
          ...(current[modal.moduleKey] || []),
        ]
      } else {
        next[modal.moduleKey] = (current[modal.moduleKey] || []).map((item) =>
          item.id === modal.id ? { ...item, ...values, editedAt: new Date().toISOString() } : item,
        )
      }
      persistRecords(next)
      return next
    })
    setModal(null)
  }

  function deleteRecord() {
    const deletedRecord = deleteTarget
    setRecords((current) => ({
      ...current,
      [deletedRecord.moduleKey]: current[deletedRecord.moduleKey].filter((item) => item.id !== deletedRecord.id),
    }))
    setDeleteTarget(null)
  }

  async function syncGitHubRepos() {
    const username = appSettings.githubUsername.trim()
    const apiBase = appSettings.githubApiBase.trim().replace(/\/$/, '') || defaultSettings.githubApiBase
    const token = appSettings.githubToken.trim()

    if (!username && !token) {
      setGithubSyncStatus('Add a GitHub username or personal access token first.')
      return
    }

    setGithubSyncStatus('Fetching GitHub repositories...')
    const endpoint = token
      ? `${apiBase}/user/repos?per_page=100&sort=updated`
      : `${apiBase}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`

    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`)
      }

      const repos = await response.json()
      const importedRepos = repos.map((repo) => mapGitHubRepo(repo, username))

      setRecords((current) => {
        const knownIds = new Set(current.repos.map((repo) => repo.id))
        const now = new Date().toISOString()
        const repos = mergeGitHubImportedRepos(current.repos, importedRepos)
          .map((repo) => (knownIds.has(repo.id) || repo.addedAt ? repo : { ...repo, addedAt: now }))
        return { ...current, repos }
      })
      setActivePage('repos')
      setGithubSyncStatus(`Imported ${importedRepos.length} GitHub repositories.`)
    } catch (error) {
      setGithubSyncStatus(`GitHub sync failed: ${error.message}`)
    }
  }

  function loadDemoData() {
    if (!isRecordsEmpty(records) && !window.confirm('Replace everything here with the demo portfolio?')) return
    setRecords(normalizeRecordsByModule(getSeedRecords()))
    setActivePage('dashboard')
  }

  function deleteAllData() {
    if (!window.confirm('Delete every record in this browser? Export first if you want a copy. This cannot be undone.')) return
    setRecords(normalizeRecordsByModule({}))
    setTransferStatus('All records deleted.')
  }

  function exportRecords() {
    const blob = new Blob([JSON.stringify(buildExport(records), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName()
    link.click()
    URL.revokeObjectURL(url)
    setTransferStatus('Export downloaded.')
  }

  async function importRecords(file) {
    if (!file) return
    try {
      const imported = parseImport(await file.text())
      const total = Object.values(imported).reduce((sum, items) => sum + items.length, 0)
      if (!window.confirm(`Replace everything here with ${total} records from ${file.name}?`)) return
      setRecords(normalizeRecordsByModule(imported))
      setTransferStatus(`Imported ${total} records.`)
    } catch (error) {
      setTransferStatus(`Import failed: ${error.message}`)
    }
  }

  function updateRepoStats(results) {
    setRecords((current) => ({
      ...current,
      repos: current.repos.map((repo) => {
        const result = results.find((item) => item.id === repo.id)
        if (!result?.stats) return normalizeRepoRecord(repo)
        return normalizeRepoRecord({ ...repo, ...result.stats })
      }),
    }))
  }

  async function refreshDomainLookup(record) {
    setDomainLookupStatus(`Checking ${record.name}...`)
    try {
      const response = await fetch(`/api/domain-lookup?domain=${encodeURIComponent(record.name)}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Lookup returned ${response.status}`)
      }

      setRecords((current) => ({
        ...current,
        domains: current.domains.map((domain) =>
          domain.id === record.id ? { ...domain, lookup: result } : domain,
        ),
      }))
      setDomainLookupStatus(`Updated DNS / WHOIS for ${record.name}.`)
    } catch (error) {
      setDomainLookupStatus(`Lookup failed for ${record.name}: ${error.message}`)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setActivePage('dashboard')}>
          <span className="brand-mark">FO</span>
          <span>
            <strong>Founder OS</strong>
            <small>Private asset hub</small>
          </span>
        </button>

        <nav className="nav nav-flat">
          {navItems.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={`divider-${index}`} className="nav-divider" />
            }
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={activePage === item.id ? 'active' : ''}
                type="button"
                onClick={() => setActivePage(item.id)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <button type="button" className="command-palette-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={15} />
          <span>Search...</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="sidebar-card">
          <ShieldCheck size={18} />
          <p>Your data stays in this browser. Export it from Settings to back it up.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar page-header">
          <div className="page-header-copy">
            <h1 className="page-title">{pageMeta.title}</h1>
            <p className="page-description">{pageMeta.tagline}</p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="command-action-btn" onClick={() => setCommandOpen(true)}>
              <Search size={15} />
              Search
            </button>
            <label className="currency-switch">
              <span>Currency</span>
              <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value)}>
                {CURRENCIES.filter((currency) => rateFor(currency, rates)).map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <AddAssetDropdown onAdd={(moduleKey) => {
              setActivePage(moduleKey)
              openCreate(moduleKey)
            }} />
          </div>
        </header>

        {ratelessCurrencies.length > 0 && (
          <div className="page-content">
            <p className="rate-warning" role="status">
              No exchange rate for {ratelessCurrencies.join(', ')}. Those costs are left out of totals.{' '}
              <button type="button" className="link-button" onClick={() => setActivePage('settings')}>Add a rate in Settings</button>
            </p>
          </div>
        )}

        {activePage === 'dashboard' && isRecordsEmpty(records) && (
          <WelcomePanel
            onLoadDemo={loadDemoData}
            onAddProject={() => {
              setActivePage('projects')
              openCreate('projects')
            }}
            onImport={() => setActivePage('settings')}
          />
        )}

        {activePage === 'dashboard' && !isRecordsEmpty(records) && (
          <DashboardView
            records={records}
            flatRecords={flatRecords}
            stats={stats}
            displayCurrency={displayCurrency}
            money={money}
            prettyDate={prettyDate}
            fromUsd={fromUsd}
            toUsd={toUsd}
            getReminder={getReminder}
            isAttention={isAttention}
            setActivePage={setActivePage}
          />
        )}

        {activePage === 'infrastructure-map' && (
          <InfrastructureMapView records={records} setActivePage={setActivePage} />
        )}

        {activePage === 'project-health' && (
          <ProjectHealthView records={records} flatRecords={flatRecords} />
        )}

        {activePage === 'insights' && (
          <InsightsView
            records={records}
            flatRecords={flatRecords}
            displayCurrency={displayCurrency}
            money={money}
            fromUsd={fromUsd}
            toUsd={toUsd}
          />
        )}

        {activePage === 'attention' && (
          <AttentionCenterView
            records={records}
            flatRecords={flatRecords}
            setActivePage={setActivePage}
          />
        )}

        {activePage === 'timeline' && (
          <TimelineView records={records} />
        )}

        {activePage === 'projects' && (
          <ProjectsView
            records={records}
            displayCurrency={displayCurrency}
            money={money}
            toUsd={toUsd}
            fromUsd={fromUsd}
            openCreate={openCreate}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
          />
        )}

        {activePage === 'domains' && (
          <DomainsView
            records={visibleRecords}
            allRecords={records}
            servers={records.servers}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            displayCurrency={displayCurrency}
            domainLookupStatus={domainLookupStatus}
            statuses={statuses}
            money={money}
            prettyDate={prettyDate}
            toUsd={toUsd}
            fromUsd={fromUsd}
            isAttention={isAttention}
            openCreate={openCreate}
            openEdit={openEdit}
            refreshDomainLookup={refreshDomainLookup}
            setDeleteTarget={setDeleteTarget}
            onCheckHealth={refreshDomainLookup}
          />
        )}

        {activePage === 'servers' && (
          <ServersView
            records={records}
            displayCurrency={displayCurrency}
            money={money}
            prettyDate={prettyDate}
            toUsd={toUsd}
            fromUsd={fromUsd}
            isAttention={isAttention}
            openCreate={openCreate}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
          />
        )}

        {activePage === 'repos' && (
          <ReposView
            records={records.repos}
            allRecords={records}
            openCreate={openCreate}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
            onUpdateRepos={updateRepoStats}
            githubToken={appSettings.githubToken}
          />
        )}

        {currentConfig && !['domains', 'repos', 'servers', 'projects', 'dashboard', 'settings', 'infrastructure-map', 'project-health', 'insights', 'attention', 'timeline'].includes(activePage) && (
          <ModuleView
            config={currentConfig}
            moduleKey={activePage}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            records={visibleRecords}
            displayCurrency={displayCurrency}
            money={money}
            toUsd={toUsd}
            fromUsd={fromUsd}
            openCreate={openCreate}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
          />
        )}

        {activePage === 'settings' && (
          <SettingsView
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            githubSyncStatus={githubSyncStatus}
            syncGitHubRepos={syncGitHubRepos}
            exportRecords={exportRecords}
            loadDemoData={loadDemoData}
            deleteAllData={deleteAllData}
            records={records}
            refreshRates={refreshRates}
            ratesStatus={ratesStatus}
            setRate={setRate}
            importRecords={importRecords}
            transferStatus={transferStatus}
          />
        )}
      </main>

      {modal?.moduleKey === 'repos' && (
        <RepoRecordModal
          modal={modal}
          setModal={setModal}
          saveRecord={saveRecord}
        />
      )}

      {modal?.moduleKey === 'projects' && (
        <ProjectRecordModal
          modal={modal}
          setModal={setModal}
          saveRecord={saveRecord}
          records={records}
        />
      )}

      {modal && !['repos', 'projects'].includes(modal.moduleKey) && (
        <RecordModal
          modal={modal}
          config={moduleConfig[modal.moduleKey]}
          servers={records.servers}
          setModal={setModal}
          saveRecord={saveRecord}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          target={deleteTarget}
          setDeleteTarget={setDeleteTarget}
          deleteRecord={deleteRecord}
        />
      )}

      {commandOpen && (
        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          records={records}
          onNavigate={setActivePage}
        />
      )}

    </div>
  )
}

function ModuleView({
  config,
  moduleKey,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  records,
  displayCurrency,
  money,
  toUsd,
  fromUsd,
  openCreate,
  openEdit,
  setDeleteTarget,
}) {
  const Icon = config.icon
  return (
    <section className="page-content module-stack">
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}`} />
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

      <div className="records-table">
        <div className="table-head">
          <span>Name</span>
          <span>Provider</span>
          <span>Cost</span>
          <span>Renewal</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {records.length ? records.map((record) => (
          <article
            className={isAttention(record) ? 'record-row attention' : 'record-row'}
            key={record.id}
          >
            <div className="record-title">
              <span className="record-icon"><Icon size={17} /></span>
              <div>
                <strong>{record.name}</strong>
                <small>{getReminder(record)}</small>
                {(moduleKey === 'servers' || moduleKey === 'repos') && record.notes && (
                  <small className="record-note">{record.notes}</small>
                )}
              </div>
            </div>
            <span data-label={moduleKey === 'servers' ? 'Provider / IP' : 'Provider'}>
              {record.provider}
              {moduleKey === 'servers' && record.ipAddress && (
                <small className="converted-cost">{record.ipAddress}</small>
              )}
            </span>
            <span data-label="Cost">
              {money(Number(record.cost || 0), record.currency)}
              {record.currency !== displayCurrency && (
                <small className="converted-cost">
                  {money(fromUsd(toUsd(record), displayCurrency), displayCurrency)}
                </small>
              )}
            </span>
            <span data-label="Renewal">{prettyDate(record.renewalDate)}</span>
            <StatusBadge status={record.status} />
            <div className="row-actions">
              <button type="button" title="Edit" onClick={() => openEdit(moduleKey, record)}><Edit3 size={16} /></button>
              <button type="button" title="Delete" onClick={() => setDeleteTarget({ ...record, moduleKey })}><Trash2 size={16} /></button>
            </div>
          </article>
        )) : (
          <EmptyState
            title={config.empty}
            text="Create the first record or clear the current filters."
            action={() => openCreate(moduleKey)}
            actionLabel={`Add ${config.singular}`}
          />
        )}
      </div>
    </section>
  )
}

function SettingsView({
  appSettings,
  setAppSettings,
  githubSyncStatus,
  syncGitHubRepos,
  exportRecords,
  importRecords,
  transferStatus,
  loadDemoData,
  deleteAllData,
  records,
  refreshRates,
  ratesStatus,
  setRate,
}) {
  function updateSetting(key, value) {
    setAppSettings((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="page-content settings-grid">
      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>Export and import</h2>
          <p>Download everything as a JSON file, or load a file you exported before. Importing replaces what is here now.</p>
        </div>
        <div className="settings-form">
          <button className="primary-button" type="button" onClick={exportRecords}>
            <Download size={16} />
            Export JSON
          </button>
          <label className="ghost-button">
            <Upload size={16} />
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                importRecords(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
          <button className="ghost-button" type="button" onClick={loadDemoData}>
            Load demo data
          </button>
          <button className="danger-button" type="button" onClick={deleteAllData}>
            <Trash2 size={16} />
            Delete all data
          </button>
          {transferStatus && <p className="settings-status">{transferStatus}</p>}
        </div>
      </div>

      <CurrencySettings
        appSettings={appSettings}
        updateSetting={updateSetting}
        records={records}
        refreshRates={refreshRates}
        ratesStatus={ratesStatus}
        setRate={setRate}
      />

      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>Where your data lives</h2>
          <p>Everything is saved in this browser only. Nothing is sent to a server. Clearing site data deletes it, so export a copy now and then.</p>
        </div>
        <div className="checklist">
          <span><ShieldCheck size={16} /> Saved in this browser</span>
          <span><Database size={16} /> No account, no cloud sync</span>
        </div>
      </div>

      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>GitHub Auto-Fetch</h2>
          <p>Fetch public repos by username, or use a personal token for private repos available to the token.</p>
        </div>
        <div className="settings-form">
          <label>
            <span>GitHub username</span>
            <input
              value={appSettings.githubUsername}
              onChange={(event) => updateSetting('githubUsername', event.target.value)}
              placeholder="your-github-username"
            />
          </label>
          <label>
            <span>REST API base URL</span>
            <input
              value={appSettings.githubApiBase}
              onChange={(event) => updateSetting('githubApiBase', event.target.value)}
              placeholder="https://api.github.com"
            />
          </label>
          <label>
            <span>Personal access token</span>
            <input
              type="password"
              value={appSettings.githubToken}
              onChange={(event) => updateSetting('githubToken', event.target.value)}
              placeholder="github_pat_..."
              autoComplete="off"
            />
          </label>
          <p className="settings-status">
            The token is only kept in memory for this tab and is never saved. Use a fine-grained token with read-only
            access to repository metadata. Leave it empty to fetch public repos only.
          </p>
          <button className="primary-button" type="button" onClick={syncGitHubRepos}>
            <RefreshCw size={16} />
            Fetch GitHub Repos
          </button>
          {githubSyncStatus && <p className="settings-status">{githubSyncStatus}</p>}
        </div>
      </div>
    </section>
  )
}

function CurrencySettings({ appSettings, updateSetting, records, refreshRates, ratesStatus, setRate }) {
  const rates = appSettings.ratesPerUsd || {}
  const [adding, setAdding] = useState('')
  const used = new Set(Object.values(records).flat().map((item) => item.currency).filter(Boolean))
  const extra = appSettings.extraCurrencies || []
  const shown = [...new Set([...used, ...extra, appSettings.baseCurrency])].filter((code) => code !== 'USD').sort()

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Currency</h2>
        <p>
          Totals are shown in your main currency. Each cost keeps its own currency and is converted with the rates below
          (1 USD = …). {appSettings.ratesSource && <>Source: {appSettings.ratesSource}{appSettings.ratesUpdatedAt && `, ${appSettings.ratesUpdatedAt}`}.</>}
        </p>
      </div>
      <div className="settings-form">
        <label>
          <span>Main currency</span>
          <select value={appSettings.baseCurrency} onChange={(event) => updateSetting('baseCurrency', event.target.value)}>
            {CURRENCIES.filter((code) => rateFor(code, rates)).map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        <div className="rate-table">
          {shown.map((code) => (
            <label key={code}>
              <span>1 USD = {code}{!rates[code] && used.has(code) ? ' (missing)' : ''}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={rates[code] ?? ''}
                onChange={(event) => setRate(code, event.target.value)}
              />
            </label>
          ))}
          <label>
            <span>Add a currency</span>
            <select
              value={adding}
              onChange={(event) => {
                setAdding('')
                if (event.target.value) updateSetting('extraCurrencies', [...extra, event.target.value])
              }}
            >
              <option value="">Choose…</option>
              {CURRENCIES.filter((code) => !shown.includes(code) && code !== 'USD').map((code) => <option key={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <button className="ghost-button" type="button" onClick={refreshRates}>
          <RefreshCw size={16} />
          Fetch latest rates
        </button>
        <p className="settings-status">
          Optional. Asks frankfurter.dev for today&apos;s European Central Bank rates. Only the request itself is sent, none
          of your data. The ECB doesn&apos;t publish every currency (PKR, for example), so keep those rates up to date by hand.
        </p>
        {ratesStatus && <p className="settings-status">{ratesStatus}</p>}
      </div>
    </div>
  )
}

function WelcomePanel({ onLoadDemo, onAddProject, onImport }) {
  return (
    <section className="page-content">
      <div className="panel welcome-panel">
        <div className="panel-heading">
          <h2>Welcome. Nothing is tracked yet.</h2>
          <p>
            Start with a project, then add the domains, servers, repos and subscriptions it runs on.
            Or look around first with a made-up demo portfolio. You can delete it any time in Settings.
          </p>
        </div>
        <div className="settings-form">
          <button className="primary-button" type="button" onClick={onAddProject}>
            <Plus size={16} />
            Add your first project
          </button>
          <button className="ghost-button" type="button" onClick={onLoadDemo}>
            Load demo data
          </button>
          <button className="ghost-button" type="button" onClick={onImport}>
            <Upload size={16} />
            Import a JSON export
          </button>
        </div>
      </div>
    </section>
  )
}

function SubdomainListField({ subdomains, servers, onChange }) {
  function updateSubdomain(id, patch) {
    onChange(subdomains.map((sub) => (sub.id === id ? { ...sub, ...patch } : sub)))
  }

  function addSubdomain() {
    onChange([
      ...subdomains,
      { id: `sub-${crypto.randomUUID()}`, name: '', serverId: '', notes: '' },
    ])
  }

  function removeSubdomain(id) {
    onChange(subdomains.filter((sub) => sub.id !== id))
  }

  return (
    <div className="subdomain-list">
      {subdomains.map((sub) => (
        <div key={sub.id} className="subdomain-row">
          <input
            value={sub.name}
            onChange={(event) => updateSubdomain(sub.id, { name: event.target.value })}
            placeholder="www"
          />
          <select
            value={sub.serverId || ''}
            onChange={(event) => updateSubdomain(sub.id, { serverId: event.target.value })}
          >
            <option value="">No VPS attached</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}{server.ipAddress ? ` - ${server.ipAddress}` : ''}
              </option>
            ))}
          </select>
          <input
            value={sub.notes}
            onChange={(event) => updateSubdomain(sub.id, { notes: event.target.value })}
            placeholder="Notes for this subdomain"
          />
          <button type="button" title="Remove subdomain" onClick={() => removeSubdomain(sub.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button className="ghost-button subdomain-add" type="button" onClick={addSubdomain}>
        <Plus size={16} />
        Add subdomain
      </button>
    </div>
  )
}

function RecordModal({ modal, config, servers, setModal, saveRecord }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={saveRecord}>
        <div className="modal-heading">
          <div>
            <h2>{modal.mode === 'create' ? 'Add' : 'Edit'} {config.singular}</h2>
            <p>Keep ownership, cost, renewal, and status details together.</p>
          </div>
          <button type="button" onClick={() => setModal(null)}><X size={18} /></button>
        </div>
        <div className="modal-body">
        <div className="form-grid">
          {config.fields.map((field) => (
            <label key={field.key} className={field.type === 'subdomainList' ? 'full-span' : undefined}>
              <span>{field.label}</span>
              {field.type === 'subdomainList' ? (
                <SubdomainListField
                  subdomains={modal.values.subdomains || []}
                  servers={servers}
                  onChange={(subdomains) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, subdomains },
                  }))}
                />
              ) : field.type === 'status' ? (
                <select
                  value={modal.values[field.key]}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              ) : field.type === 'currency' ? (
                <select
                  value={modal.values[field.key]}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              ) : field.type === 'serverLink' ? (
                <select
                  value={modal.values[field.key] || ''}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  <option value="">Not attached</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}{server.ipAddress ? ` - ${server.ipAddress}` : ''}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={modal.values[field.key] || ''}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                  placeholder="Where is this domain used or pointed?"
                  rows={3}
                />
              ) : (
                <input
                  type={field.type}
                  min={field.type === 'number' ? '0' : undefined}
                  step={field.type === 'number' ? '1' : undefined}
                  value={modal.values[field.key]}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                  required={field.key === 'name'}
                />
              )}
            </label>
          ))}
        </div>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setModal(null)}>Cancel</button>
          <button className="primary-button" type="submit">Save record</button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDelete({ target, setDeleteTarget, deleteRecord }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal compact">
        <div className="modal-heading">
          <div>
            <h2>Delete record?</h2>
            <p>{target.name} will be removed from Founder OS.</p>
          </div>
          <button type="button" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="danger-button" type="button" onClick={deleteRecord}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(' ', '-')
}

export default App
