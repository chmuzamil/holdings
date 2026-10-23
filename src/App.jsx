import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  Database,
  Download,
  Edit3,
  FolderGit2,
  GitBranch,
  Globe2,
  LayoutDashboard,
  KeyRound,
  Layers,
  Lightbulb,
  PackageCheck,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Upload,
  Unplug,
  UserCircle,
  WalletCards,
  X,
} from 'lucide-react'
import './App.css'
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
import { AddAssetDropdown } from './components/shared/AddAssetDropdown'
import { BrandMark } from './components/shared/BrandMark'
import { SyncStatus, SyncProblem } from './components/server/SyncStatus'
import { isRenewableModule } from './lib/renewal-helpers'
import { getPageMeta } from './lib/page-config'
import { statusTone } from './lib/status'
import { findSecretsInRecord } from './lib/secrets'
import { Badge } from './components/ui/Badge'
import { useDialog } from './components/ui/use-dialog'
import { buildExport, exportFileName, parseImport } from './lib/data-transfer'
import { RECORDS_KEY, SETTINGS_KEY, migrateLegacyStorage } from './lib/storage'
import {
  RATES_ATTRIBUTION_URL,
  currencyOptions,
  defaultCurrencySettings,
  fetchLatestRates,
  formatMoney,
  fromUsd as convertFromUsd,
  legacySecondCurrency,
  migrateRecordToUsd,
  rateFor,
  ratesAreStale,
  unconvertedRecords,
} from './lib/currency'
// Pages other than the Overview load on first visit, keeping the first download small.
const named = (load, name) => lazy(() => load().then((module) => ({ default: module[name] })))
const DomainsView = named(() => import('./components/domains/DomainsView'), 'DomainsView')
const ReposView = named(() => import('./components/repos/ReposView'), 'ReposView')
const RepoRecordModal = named(() => import('./components/repos/RepoRecordModal'), 'RepoRecordModal')
const ProjectsView = named(() => import('./components/projects/ProjectsView'), 'ProjectsView')
const ProjectRecordModal = named(() => import('./components/projects/ProjectRecordModal'), 'ProjectRecordModal')
const ServersView = named(() => import('./components/servers/ServersView'), 'ServersView')
const InfrastructureMapView = named(() => import('./components/command-center/InfrastructureMapView'), 'InfrastructureMapView')
const InsightsView = named(() => import('./components/command-center/InsightsView'), 'InsightsView')
const AttentionCenterView = named(() => import('./components/command-center/AttentionCenterView'), 'AttentionCenterView')
const TimelineView = named(() => import('./components/command-center/TimelineView'), 'TimelineView')
const ImpactView = named(() => import('./components/command-center/ImpactView'), 'ImpactView')
const ExpiryView = named(() => import('./components/command-center/ExpiryView'), 'ExpiryView')
const AccountSettings = named(() => import('./components/server/AccountSettings'), 'AccountSettings')
const PacksView = named(() => import('./components/command-center/PacksView'), 'PacksView')
const CommandPalette = named(() => import('./components/command-palette/CommandPalette'), 'CommandPalette')


const KEY_TYPES = ['API key', 'Access token', 'OAuth app', 'TLS certificate', 'Payment card', 'Other']

const moduleConfig = {
  domains: {
    title: 'Domains',
    singular: 'Domain',
    icon: Globe2,
    empty: 'No domains yet.',
    fields: [
      { key: 'name', label: 'Domain', type: 'text' },
      { key: 'provider', label: 'Registrar', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'subdomains', label: 'Subdomains', type: 'subdomainList' },
      { key: 'cost', label: 'Yearly cost (USD)', type: 'number' },
      { key: 'paidWithId', label: 'Paid with', type: 'cardLink' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  projects: {
    title: 'Projects',
    singular: 'Project',
    icon: Layers,
    empty: 'No projects yet.',
    fields: [],
  },
  servers: {
    title: 'Servers',
    singular: 'Server',
    icon: Server,
    empty: 'No servers yet.',
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
      { key: 'cost', label: 'Monthly cost (USD)', type: 'number' },
      { key: 'paidWithId', label: 'Paid with', type: 'cardLink' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  repos: {
    title: 'Repos',
    singular: 'Repo',
    icon: FolderGit2,
    empty: 'No repos yet.',
    fields: [],
  },
  accounts: {
    title: 'Accounts',
    singular: 'Account',
    icon: UserCircle,
    empty: 'No accounts yet.',
    fields: [
      { key: 'name', label: 'Account', type: 'text' },
      { key: 'provider', label: 'Platform', type: 'text' },
      { key: 'cost', label: 'Monthly cost (USD)', type: 'number' },
      { key: 'paidWithId', label: 'Paid with', type: 'cardLink' },
      { key: 'renewalDate', label: 'Review date', type: 'date' },
      { key: 'expiryDate', label: 'Attention date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  keys: {
    title: 'Keys & cards',
    singular: 'Key or card',
    icon: KeyRound,
    empty: 'No keys or cards yet.',
    note: 'Only what a key is, where it is kept and when it expires. Never the key or card number itself.',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Stripe live key' },
      { key: 'keyType', label: 'Type', type: 'select', options: KEY_TYPES },
      { key: 'provider', label: 'Issued by', type: 'text', placeholder: 'Stripe' },
      { key: 'projectId', label: 'Used by project', type: 'projectLink' },
      { key: 'keptIn', label: 'Where it is kept', type: 'text', placeholder: '1Password, Ops vault' },
      { key: 'last4', label: 'Last 4 digits (cards only)', type: 'text', placeholder: '4242', maxLength: 4 },
      { key: 'renewalDate', label: 'Rotate by', type: 'date' },
      { key: 'expiryDate', label: 'Expires', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  subscriptions: {
    title: 'Subscriptions',
    singular: 'Subscription',
    icon: WalletCards,
    empty: 'No subscriptions yet.',
    fields: [
      { key: 'name', label: 'Subscription', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'cost', label: 'Monthly cost (USD)', type: 'number' },
      { key: 'paidWithId', label: 'Paid with', type: 'cardLink' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
}

const statuses = ['Active', 'Expiring Soon', 'Expired', 'Cancelled']

migrateLegacyStorage(window.localStorage)

const recordModules = ['domains', 'servers', 'repos', 'projects', 'accounts', 'subscriptions', 'keys']
// Demo builds (e.g. the public GitHub Pages site) open with the fictional portfolio.
const isDemoBuild = import.meta.env.VITE_DEMO === 'true'

function normalizeRecordsByModule(recordsByModule) {
  return Object.fromEntries(
    recordModules.map((moduleKey) => {
      const records = (Array.isArray(recordsByModule[moduleKey]) ? recordsByModule[moduleKey] : []).map((record) => migrateRecordToUsd(record))
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

function pageFromHash() {
  const page = window.location.hash.slice(1)
  return navItems.some((item) => item.id === page) ? page : 'dashboard'
}

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'attention', label: 'Attention', icon: AlertTriangle },
  { id: 'expiring', label: 'Expiring', icon: CalendarClock },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { type: 'divider' },
  { id: 'infrastructure-map', label: 'Map', icon: GitBranch },
  { id: 'impact', label: 'What if', icon: Unplug },
  { id: 'packs', label: 'Handover & exit', icon: PackageCheck },
  { type: 'divider' },
  { id: 'projects', label: 'Projects', icon: Layers },
  { id: 'domains', label: 'Domains', icon: Globe2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'repos', label: 'Repos', icon: FolderGit2 },
  { id: 'accounts', label: 'Accounts', icon: UserCircle },
  { id: 'subscriptions', label: 'Subscriptions', icon: WalletCards },
  { id: 'keys', label: 'Keys & cards', icon: KeyRound },
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
    const saved = window.localStorage.getItem(RECORDS_KEY)
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
    const saved = window.localStorage.getItem(SETTINGS_KEY)
    if (!saved) return { ...defaultSettings }

    const parsed = JSON.parse(saved)
    const { githubToken, ...persistable } = parsed

    if (githubToken) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistable))
    }

    const { baseCurrency, ratesSource, ratesUpdatedAt, extraCurrencies, ...current } = persistable
    const isLegacy = !('secondCurrency' in persistable) && !persistable.ratesPerUsd
    const secondCurrency = isLegacy ? legacySecondCurrency : persistable.secondCurrency || ''
    return { ...defaultSettings, ...current, secondCurrency, githubToken: '' }
  } catch {
    return { ...defaultSettings }
  }
}

// The earlier of "rotate by" and "expires".
function nextKeyDate(record) {
  return [record.renewalDate, record.expiryDate].filter(Boolean).sort()[0] || ''
}

// Costs typed into the form are in USD, so a saved record never keeps an old currency.
function withoutCurrency(record) {
  const { currency, ...rest } = record
  return rest
}

function persistRecords(records) {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
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

function App({ server = null }) {
  // The open page is mirrored in the URL hash (e.g. #domains) so pages can be linked to.
  const [activePage, setActivePageState] = useState(pageFromHash)
  const setActivePage = useCallback((page) => {
    setActivePageState(page)
    window.history.replaceState(null, '', page === 'dashboard' ? window.location.pathname + window.location.search : `#${page}`)
  }, [])

  // On narrow screens the nav is a scrolling row; keep the current page visible.
  useEffect(() => {
    document.querySelector('.nav [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePage])

  useEffect(() => {
    const onHashChange = () => setActivePageState(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const [records, setRecords] = useState(loadSavedRecords)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('renewalDate')
  const [appSettings, setAppSettings] = useState(loadSavedSettings)
  const [ratesStatus, setRatesStatus] = useState('')
  const [showSecondCurrency, setShowSecondCurrency] = useState(false)
  const [githubSyncStatus, setGithubSyncStatus] = useState('')
  const [domainLookupStatus, setDomainLookupStatus] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [impactAssetId, setImpactAssetId] = useState('')

  // All amounts are stored in USD. The second currency is for display only and
  // can be shown once its rate has been fetched.
  const rates = appSettings.ratesPerUsd
  const secondCurrency = appSettings.secondCurrency
  const secondReady = Boolean(secondCurrency && rateFor(secondCurrency, rates))
  const displayCurrency = showSecondCurrency && secondReady ? secondCurrency : 'USD'
  const setDisplayCurrency = (currency) => setShowSecondCurrency(currency !== 'USD')
  // A cost still carrying a currency we couldn't convert is left out of totals; a banner says so.
  const toUsd = useCallback((record) => (record.currency && record.currency !== 'USD' ? 0 : Number(record.cost || 0)), [])
  const fromUsd = useCallback((value, currency) => convertFromUsd(value, currency, rates) ?? value, [rates])
  const money = formatMoney
  const unconverted = useMemo(() => unconvertedRecords(records), [records])

  // Fetch the second currency's rate when it is chosen, and refresh it daily.
  const ratesStale = ratesAreStale(appSettings.ratesFetchedAt)
  useEffect(() => {
    if (!secondCurrency || (!ratesStale && rateFor(secondCurrency, rates))) return
    let cancelled = false
    fetchLatestRates()
      .then((ratesPerUsd) => {
        if (cancelled) return
        setAppSettings((current) => ({ ...current, ratesPerUsd, ratesFetchedAt: new Date().toISOString() }))
        setRatesStatus(ratesPerUsd[secondCurrency] ? '' : `The rates service has no rate for ${secondCurrency}.`)
      })
      .catch((error) => {
        if (!cancelled) setRatesStatus(`Couldn't get the ${secondCurrency} rate (${error.message}). Totals stay in US dollars for now.`)
      })
    return () => {
      cancelled = true
    }
  }, [secondCurrency, ratesStale, rates])

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

  // The browser copy is the working copy; with a server, changes are saved there too.
  const saver = server?.saver
  useEffect(() => {
    persistRecords(records)
    saver?.update('records', records)
  }, [records, saver])

  useEffect(() => {
    const persistable = persistableSettings(appSettings)
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistable))
    saver?.update('settings', persistable)
  }, [appSettings, saver])

  const flatRecords = useMemo(
    () =>
      Object.entries(records).flatMap(([moduleKey, items]) =>
        items.map((item) => ({ ...item, moduleKey })),
      ),
    [records],
  )


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
    setModal({ moduleKey, mode: 'create', values })
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
    const secrets = findSecretsInRecord(modal.values)
    if (secrets.length) {
      const label = (key) => moduleConfig[modal.moduleKey]?.fields.find((field) => field.key === key)?.label || key
      setModal((current) => ({
        ...current,
        error: `${label(secrets[0].field)} looks like it contains a ${secrets[0].kind}. Holdings only stores where a secret is kept and when it expires, never the secret itself. Remove it and try again.`,
      }))
      return
    }
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
              ...(modal.moduleKey === 'keys'
                ? {
                    cost: 0,
                    last4: String(modal.values.last4 || '').replace(/\D/g, '').slice(-4),
                    connectedProjectIds: modal.values.projectId ? [modal.values.projectId] : [],
                  }
                : {}),
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
          withoutCurrency({ ...values, id: `${modal.moduleKey}-${crypto.randomUUID()}`, addedAt: now, editedAt: now }),
          ...(current[modal.moduleKey] || []),
        ]
      } else {
        next[modal.moduleKey] = (current[modal.moduleKey] || []).map((item) =>
          item.id === modal.id ? withoutCurrency({ ...item, ...values, editedAt: new Date().toISOString() }) : item,
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
      setGithubSyncStatus('Enter your GitHub username first.')
      return
    }

    setGithubSyncStatus('Importing repos from GitHub…')
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
      setGithubSyncStatus(`Imported ${importedRepos.length} repos from GitHub.`)
    } catch (error) {
      setGithubSyncStatus(`Couldn't reach GitHub (${error.message}). Check the username or token and try again.`)
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

  function showImpact(record) {
    setImpactAssetId(record.id)
    setActivePage('impact')
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
      setTransferStatus(`Couldn't import that file: ${error.message} Nothing was changed.`)
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
    if (isDemoBuild) {
      setDomainLookupStatus('DNS checks are turned off in the demo. Self-host Holdings to check your own domains.')
      return
    }
    setDomainLookupStatus(`Checking ${record.name}…`)
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
      setDomainLookupStatus(`Checked ${record.name}.`)
    } catch (error) {
      setDomainLookupStatus(`Couldn't check ${record.name} (${error.message}). Try again in a minute.`)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setActivePage('dashboard')}>
          <BrandMark />
          <strong>Holdings</strong>
        </button>

        <nav className="nav nav-flat" aria-label="Main">
          {navItems.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={`divider-${index}`} className="nav-divider" aria-hidden="true" />
            }
            const Icon = item.icon
            return (
              <a
                key={item.id}
                href={item.id === 'dashboard' ? '#' : `#${item.id}`}
                className="nav-link"
                aria-current={activePage === item.id ? 'page' : undefined}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
                  event.preventDefault()
                  setActivePage(item.id)
                }}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>

        <button type="button" className="command-palette-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={15} aria-hidden="true" />
          <span>Search…</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="sidebar-card">
          <ShieldCheck size={18} />
          <p>{server ? 'Your data is saved on your own server.' : 'Your data stays in this browser. Export it from Settings to back it up.'}</p>
        </div>
      </aside>

      <main className="main" id="main-content" tabIndex={-1}>
        <Suspense fallback={<p className="page-content page-loading" role="status">Loading…</p>}>
        <header className="topbar page-header">
          <div className="page-header-copy">
            <h1 className="page-title">{pageMeta.title}</h1>
            <p className="page-description">{pageMeta.tagline}</p>
          </div>
          <div className="topbar-actions">
            {server && <SyncStatus status={server.syncStatus} />}
            {secondCurrency && (
              <label className="currency-switch">
                <span>Currency</span>
                <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value)}>
                  <option value="USD">USD</option>
                  <option value={secondCurrency} disabled={!secondReady}>
                    {secondReady ? secondCurrency : `${secondCurrency} (getting rate…)`}
                  </option>
                </select>
              </label>
            )}
            <AddAssetDropdown onAdd={(moduleKey) => {
              setActivePage(moduleKey)
              openCreate(moduleKey)
            }} />
          </div>
        </header>

        {isDemoBuild && (
          <div className="page-content">
            <p className="demo-banner" role="note">
              This is a demo with made-up data. Anything you change stays in your browser only.{' '}
              <button type="button" className="link-button" onClick={loadDemoData}>Reset the demo</button>
              {' · '}
              <a className="link-button" href="https://github.com/chmuzamil/holdings" target="_blank" rel="noopener">
                Free and open source: get it on GitHub
              </a>
            </p>
          </div>
        )}

        {server && <SyncProblem status={server.syncStatus} onRetry={() => server.saver.retry()} />}

        {unconverted.length > 0 && (
          <div className="page-content">
            <p className="rate-warning" role="status">
              {unconverted.length === 1 ? '1 item has' : `${unconverted.length} items have`} a cost in a currency that
              couldn&apos;t be converted to USD ({[...new Set(unconverted.map((item) => item.currency))].join(', ')}): {unconverted.map((item) => item.name).join(', ')}.
              Edit {unconverted.length === 1 ? 'it' : 'them'} and enter the cost in USD. Until then {unconverted.length === 1 ? 'it is' : 'they are'} left out of totals.
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
            displayCurrency={displayCurrency}
            money={money}
            fromUsd={fromUsd}
            toUsd={toUsd}
            setActivePage={setActivePage}
          />
        )}

        {activePage === 'infrastructure-map' && (
          <InfrastructureMapView records={records} setActivePage={setActivePage} />
        )}

        {activePage === 'packs' && (
          <PacksView
            records={records}
            toUsd={toUsd}
            handover={{ owner: '', recipient: '', message: '', ...appSettings.handover }}
            setHandover={(handover) => setAppSettings((current) => ({ ...current, handover }))}
          />
        )}

        {activePage === 'expiring' && (
          <ExpiryView flatRecords={flatRecords} prettyDate={prettyDate} setActivePage={setActivePage} />
        )}

        {activePage === 'impact' && (
          <ImpactView
            records={records}
            toUsd={toUsd}
            money={money}
            fromUsd={fromUsd}
            displayCurrency={displayCurrency}
            selectedId={impactAssetId}
            onSelect={setImpactAssetId}
            setActivePage={setActivePage}
          />
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
            onWhatIf={showImpact}
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
            onWhatIf={showImpact}
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

        {currentConfig && !['domains', 'repos', 'servers', 'projects', 'dashboard', 'settings', 'infrastructure-map', 'impact', 'packs', 'expiring', 'insights', 'attention', 'timeline'].includes(activePage) && (
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
            ratesStatus={ratesStatus}
            importRecords={importRecords}
            transferStatus={transferStatus}
            server={server}
          />
        )}
        </Suspense>
      </main>

      <Suspense fallback={null}>

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
          projects={records.projects}
          cards={records.keys.filter((item) => item.keyType === 'Payment card')}
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

      </Suspense>
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
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}`}
            aria-label={`Search ${config.title.toLowerCase()}`}
            autoComplete="off"
          />
        </label>
        <label className="select-box">
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <ChevronDown size={16} />
        </label>
        <label className="select-box">
          <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
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
          <span>{moduleKey === 'keys' ? 'Type' : 'Provider'}</span>
          <span>{moduleKey === 'keys' ? 'Kept in' : 'Cost'}</span>
          <span>{moduleKey === 'keys' ? 'Next date' : 'Renewal'}</span>
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
            {moduleKey === 'keys' ? (
              <>
                <span data-label="Type">
                  {record.keyType || 'Other'}
                  {record.last4 && <small className="converted-cost">Card ending {record.last4}</small>}
                  {record.provider && <small className="converted-cost">{record.provider}</small>}
                </span>
                <span data-label="Kept in">{record.keptIn || '—'}</span>
                <span data-label="Next date">{prettyDate(nextKeyDate(record))}</span>
              </>
            ) : (
            <>
            <span data-label={moduleKey === 'servers' ? 'Provider / IP' : 'Provider'}>
              {record.provider}
              {moduleKey === 'servers' && record.ipAddress && (
                <small className="converted-cost">{record.ipAddress}</small>
              )}
            </span>
            <span data-label="Cost">
              {money(fromUsd(toUsd(record), displayCurrency), displayCurrency)}
              {displayCurrency !== 'USD' && (
                <small className="converted-cost">{money(toUsd(record), 'USD')}</small>
              )}
            </span>
            <span data-label="Renewal">{prettyDate(record.renewalDate)}</span>
            </>
            )}
            <Badge variant={statusTone(record.status)} className="record-status">{record.status}</Badge>
            <div className="row-actions">
              <button type="button" title="Edit" aria-label={`Edit ${record.name}`} onClick={() => openEdit(moduleKey, record)}><Edit3 size={16} aria-hidden="true" /></button>
              <button type="button" title="Delete" aria-label={`Delete ${record.name}`} onClick={() => setDeleteTarget({ ...record, moduleKey })}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </article>
        )) : (
          <EmptyState
            title={config.empty}
            text="Add one, or clear the search and filters."
            action={() => openCreate(moduleKey)}
            actionLabel={`Add ${config.singular.toLowerCase()}`}
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
  ratesStatus,
  server,
}) {
  function updateSetting(key, value) {
    setAppSettings((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="page-content settings-grid">
      {server && (
        <Suspense fallback={null}>
          <AccountSettings server={server} />
        </Suspense>
      )}

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
          <p className="settings-status" role="status" aria-live="polite">{transferStatus}</p>
        </div>
      </div>

      <CurrencySettings
        appSettings={appSettings}
        updateSetting={updateSetting}
        ratesStatus={ratesStatus}
      />

      {!server && (
        <div className="panel settings-wide">
          <div className="panel-heading">
            <h2>Where your data lives</h2>
            <p>
              Everything is saved in this browser only. Nothing is sent to a server. Clearing site data deletes it, so export a
              copy now and then. To use it from several browsers, run your own Holdings server (see docs/self-hosting.md).
            </p>
          </div>
          <div className="checklist">
            <span><ShieldCheck size={16} /> Saved in this browser</span>
            <span><Database size={16} /> No account, no cloud sync</span>
          </div>
        </div>
      )}

      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>Import repos from GitHub</h2>
          <p>Enter your GitHub username to import your public repos. Add a token to include private ones.</p>
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
            <span>API address (only for GitHub Enterprise)</span>
            <input
              value={appSettings.githubApiBase}
              onChange={(event) => updateSetting('githubApiBase', event.target.value)}
              placeholder="https://api.github.com"
            />
          </label>
          <label>
            <span>Token (optional)</span>
            <input
              type="password"
              value={appSettings.githubToken}
              onChange={(event) => updateSetting('githubToken', event.target.value)}
              placeholder="github_pat_..."
              autoComplete="off"
            />
          </label>
          <p className="settings-status">
            Kept only while this tab is open, never saved. Give it read-only access to repository metadata.
          </p>
          <button className="primary-button" type="button" onClick={syncGitHubRepos}>
            <RefreshCw size={16} />
            Import repos
          </button>
          <p className="settings-status" role="status" aria-live="polite">{githubSyncStatus}</p>
        </div>
      </div>
    </section>
  )
}

function CurrencySettings({ appSettings, updateSetting, ratesStatus }) {
  const rates = appSettings.ratesPerUsd || {}
  const second = appSettings.secondCurrency
  const rate = rateFor(second, rates)

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Currency</h2>
        <p>
          All costs are entered and stored in US dollars. Pick a second currency to switch totals to it from the top bar.
        </p>
      </div>
      <div className="settings-form">
        <label>
          <span>Second currency</span>
          <select value={second || ''} onChange={(event) => updateSetting('secondCurrency', event.target.value)}>
            <option value="">None</option>
            {currencyOptions(rates).map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        {second && (
          <p className="settings-status">
            {rate
              ? <>1 USD = {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {second}, updated {new Date(appSettings.ratesFetchedAt).toLocaleString()}.</>
              : <>Getting the {second} rate…</>}
          </p>
        )}
        <p className="settings-status">
          When a second currency is set, its rate is fetched from open.er-api.com and refreshed once a day. Only the request
          itself is sent, none of your data.{' '}
          <a href={RATES_ATTRIBUTION_URL} target="_blank" rel="noreferrer">Rates By Exchange Rate API</a>
        </p>
        <p className="settings-status" role="status" aria-live="polite">{ratesStatus}</p>
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
            aria-label="Subdomain name"
          />
          <select
            aria-label="Server it points to"
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
            aria-label="Subdomain notes"
          />
          <button type="button" title="Remove subdomain" aria-label={`Remove subdomain ${sub.name || ''}`.trim()} onClick={() => removeSubdomain(sub.id)}>
            <X size={16} aria-hidden="true" />
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

function RecordModal({ modal, config, servers, projects, cards, setModal, saveRecord }) {
  const titleId = useId()
  const dialogRef = useDialog({ onClose: () => setModal(null), initialFocus: 'input, select, textarea' })
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={saveRecord} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{modal.mode === 'create' ? 'Add' : 'Edit'} {config.singular.toLowerCase()}</h2>
            <p>{config.note || 'Costs are in US dollars.'}</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="modal-body">
        <div className="form-grid">
          {config.fields.map((field) => field.type === 'subdomainList' ? (
            <fieldset key={field.key} className="full-span form-fieldset">
              <legend>{field.label}</legend>
              <SubdomainListField
                subdomains={modal.values.subdomains || []}
                servers={servers}
                onChange={(subdomains) => setModal((current) => ({
                  ...current,
                  values: { ...current.values, subdomains },
                }))}
              />
            </fieldset>
          ) : (
            <label key={field.key}>
              <span>{field.label}</span>
              {field.type === 'status' ? (
                <select
                  value={modal.values[field.key]}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              ) : field.type === 'select' ? (
                <select
                  value={modal.values[field.key] || field.options[0]}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  {field.options.map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : field.type === 'projectLink' || field.type === 'cardLink' ? (
                <select
                  value={modal.values[field.key] || ''}
                  onChange={(event) => setModal((current) => ({
                    ...current,
                    values: { ...current.values, [field.key]: event.target.value },
                  }))}
                >
                  <option value="">{field.type === 'cardLink' ? 'Not recorded' : 'None'}</option>
                  {(field.type === 'cardLink' ? cards : projects).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.last4 ? ` (…${item.last4})` : ''}
                    </option>
                  ))}
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
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
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
        {modal.error && <p className="form-error" role="alert">{modal.error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setModal(null)}>Cancel</button>
          <button className="primary-button" type="submit">{modal.mode === 'create' ? `Add ${config.singular.toLowerCase()}` : 'Save changes'}</button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDelete({ target, setDeleteTarget, deleteRecord }) {
  const titleId = useId()
  const close = () => setDeleteTarget(null)
  const dialogRef = useDialog({ onClose: close, initialFocus: '[data-autofocus]' })
  const kind = (moduleConfig[target.moduleKey]?.singular || 'item').toLowerCase()
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal compact" ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>Delete {target.name}?</h2>
            <p>This removes it from Holdings, including its links to projects. You can&apos;t undo this.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={close}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={close} data-autofocus>Keep it</button>
          <button className="danger-button" type="button" onClick={deleteRecord}>Delete {kind}</button>
        </div>
      </div>
    </div>
  )
}

export default App
