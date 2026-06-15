import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  Database,
  DollarSign,
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
  LogIn,
  LogOut,
  Trash2,
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
const currencies = ['USD', 'PKR']
const currencyRatesToUsd = {
  USD: 1,
  PKR: 1 / 278,
}

const storageKey = 'founder-os-records-v2'
const legacyStorageKey = 'founder-os-records-v1'
const settingsStorageKey = 'founder-os-settings-v1'
const supabaseTable = 'founder_os_records'
const supabaseSettingsTable = 'founder_os_settings'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const recordModules = ['domains', 'servers', 'repos', 'projects', 'accounts', 'subscriptions']

function createEmptyRecords() {
  return Object.fromEntries(recordModules.map((moduleKey) => [moduleKey, []]))
}

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

const creatablePages = ['projects', 'domains', 'servers', 'repos', 'accounts', 'subscriptions']

const emptyRecord = {
  name: '',
  provider: '',
  ipAddress: '',
  notes: '',
  subdomains: [],
  cost: 0,
  currency: 'PKR',
  renewalDate: '',
  expiryDate: '',
  status: 'Active',
}

const defaultSettings = {
  githubUsername: '',
  githubApiBase: 'https://api.github.com',
  githubToken: '',
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
    if (!saved) return normalizeRecordsByModule(getSeedRecords())
    const parsed = JSON.parse(saved)
    if (!parsed.projects) parsed.projects = []
    const normalized = normalizeRecordsByModule(parsed)
    if (isRecordsEmpty(normalized)) return normalizeRecordsByModule(getSeedRecords())
    return normalized
  } catch {
    return normalizeRecordsByModule(getSeedRecords())
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

    return { ...defaultSettings, ...persistable, githubToken: '' }
  } catch {
    return { ...defaultSettings }
  }
}

function rowsToRecords(rows) {
  const next = createEmptyRecords()
  rows.forEach((row) => {
    if (next[row.module_key] && row.record) {
      next[row.module_key].push(row.record)
    }
  })

  return normalizeRecordsByModule(next)
}

function mergeRecordSets(local, remote) {
  const merged = createEmptyRecords()
  recordModules.forEach((moduleKey) => {
    const byId = new Map()
    ;(remote[moduleKey] || []).forEach((item) => byId.set(item.id, item))
    ;(local[moduleKey] || []).forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item)
    })
    merged[moduleKey] = moduleKey === 'repos'
      ? dedupeRepoRecords(Array.from(byId.values()))
      : Array.from(byId.values())
  })
  return normalizeRecordsByModule(merged)
}

function recordsToRows(recordsByModule, userId) {
  return Object.entries(recordsByModule).flatMap(([moduleKey, items]) =>
    items.map((record) => ({
      id: record.id,
      user_id: userId,
      module_key: moduleKey,
      record,
      updated_at: new Date().toISOString(),
    })),
  )
}

function persistRecords(records) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(records))
  } catch {
    // ignore quota errors
  }
}

function money(value, currency = 'PKR') {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function toUsd(record) {
  return Number(record.cost || 0) * (currencyRatesToUsd[record.currency] || 1)
}

function fromUsd(value, currency) {
  return currency === 'PKR' ? value / currencyRatesToUsd.PKR : value
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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [session, setSession] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [activePage, setActivePage] = useState('dashboard')
  const [records, setRecords] = useState(loadSavedRecords)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('renewalDate')
  const [displayCurrency, setDisplayCurrency] = useState('PKR')
  const [appSettings, setAppSettings] = useState(loadSavedSettings)
  const [remoteReady, setRemoteReady] = useState(!supabase)
  const [settingsReady, setSettingsReady] = useState(!supabase)
  const [syncStatus, setSyncStatus] = useState(supabase ? 'Supabase ready to connect after login.' : 'Local browser storage active.')
  const [githubSyncStatus, setGithubSyncStatus] = useState('')
  const [domainLookupStatus, setDomainLookupStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [commandOpen, setCommandOpen] = useState(false)

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
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsAuthenticated(Boolean(data.session))
      if (data.session) {
        setRemoteReady(false)
        setSettingsReady(false)
      } else {
        setRemoteReady(true)
        setSettingsReady(true)
      }
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsAuthenticated(Boolean(nextSession))
      if (nextSession) {
        setRemoteReady(false)
        setSettingsReady(false)
      } else {
        setRemoteReady(true)
        setSettingsReady(true)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    persistRecords(records)
  }, [records])

  useEffect(() => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(persistableSettings(appSettings)))
  }, [appSettings])

  useEffect(() => {
    if (!isAuthenticated || !supabase || remoteReady) return

    async function loadRemoteRecords() {
      setSyncStatus('Loading Supabase records...')
      const [recordsResult, settingsResult] = await Promise.all([
        supabase
          .from(supabaseTable)
          .select('id,module_key,record')
          .order('updated_at', { ascending: false }),
        supabase
          .from(supabaseSettingsTable)
          .select('github_username,github_api_base,github_token')
          .maybeSingle(),
      ])

      if (recordsResult.error) {
        setSyncStatus(`Supabase unavailable: ${recordsResult.error.message}`)
        setRemoteReady(true)
        setSettingsReady(true)
        return
      }

      if (recordsResult.data?.length) {
        setRecords((local) => mergeRecordSets(local, rowsToRecords(recordsResult.data)))
        setSyncStatus('Supabase records loaded and merged with local data.')
      } else {
        setSyncStatus('Supabase is empty. Current local records will be synced.')
      }

      if (!settingsResult.error && settingsResult.data) {
        setAppSettings({
          githubUsername: settingsResult.data.github_username ?? '',
          githubApiBase: settingsResult.data.github_api_base || defaultSettings.githubApiBase,
          githubToken: settingsResult.data.github_token ?? '',
        })
      }

      setRemoteReady(true)
      setSettingsReady(true)
    }

    loadRemoteRecords()
  }, [isAuthenticated, remoteReady])

  useEffect(() => {
    if (!supabase || !isAuthenticated || !remoteReady || !session?.user?.id) return

    const userId = session.user.id
    const syncTimer = window.setTimeout(async () => {
      const rows = recordsToRows(records, userId)
      if (!rows.length) return

      const { error } = await supabase
        .from(supabaseTable)
        .upsert(rows, { onConflict: 'id' })

      setSyncStatus(error ? `Supabase sync failed: ${error.message}` : 'Saved to Supabase.')
    }, 700)

    return () => window.clearTimeout(syncTimer)
  }, [records, isAuthenticated, remoteReady, session])

  useEffect(() => {
    if (!supabase || !isAuthenticated || !settingsReady || !session?.user?.id) return

    const syncTimer = window.setTimeout(async () => {
      const { error } = await supabase.from(supabaseSettingsTable).upsert(
        {
          user_id: session.user.id,
          github_username: appSettings.githubUsername,
          github_api_base: appSettings.githubApiBase,
          github_token: appSettings.githubToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        setSyncStatus(`Settings sync failed: ${error.message}`)
      }
    }, 700)

    return () => window.clearTimeout(syncTimer)
  }, [appSettings, isAuthenticated, settingsReady, session])

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
  }, [records, flatRecords])

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
  }, [activePage, currentConfig, query, records, sortBy, statusFilter])

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
        next[modal.moduleKey] = [
          { ...values, id: `${modal.moduleKey}-${crypto.randomUUID()}` },
          ...(current[modal.moduleKey] || []),
        ]
      } else {
        next[modal.moduleKey] = (current[modal.moduleKey] || []).map((item) =>
          item.id === modal.id ? { ...item, ...values } : item,
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
    if (supabase && remoteReady) {
      supabase.from(supabaseTable).delete().eq('id', deletedRecord.id).then(({ error }) => {
        setSyncStatus(error ? `Supabase delete failed: ${error.message}` : 'Deleted from Supabase.')
      })
    }
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

      setRecords((current) => ({
        ...current,
        repos: mergeGitHubImportedRepos(current.repos, importedRepos),
      }))
      setActivePage('repos')
      setGithubSyncStatus(`Imported ${importedRepos.length} GitHub repositories.`)
    } catch (error) {
      setGithubSyncStatus(`GitHub sync failed: ${error.message}`)
    }
  }

  function checkDomainHealth(record) {
    setRecords((current) => ({
      ...current,
      domains: current.domains.map((domain) =>
        domain.id === record.id
          ? {
              ...domain,
              health: {
                ...normalizeDomainRecord(domain).health,
                lastChecked: new Date().toISOString().slice(0, 10),
              },
            }
          : domain,
      ),
    }))
    setDomainLookupStatus(`Health check timestamp updated for ${record.name}.`)
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

  async function handleLogin(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('founderLoginEmail') || '').trim().toLowerCase()
    const password = String(formData.get('founderLoginPassphrase') || '')

    if (!supabase) {
      setLoginError('Supabase is not configured.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setLoginError(error.message)
      return
    }

    setSession(data.session)
    setIsAuthenticated(true)
    setLoginError('')
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setSession(null)
    setIsAuthenticated(false)
    setActivePage('dashboard')
    setRemoteReady(!supabase)
    setSettingsReady(!supabase)
    setModal(null)
    setDeleteTarget(null)
    setAppSettings((current) => ({ ...current, githubToken: '' }))
  }

  if (!isAuthenticated) {
    return <LoginPage loginError={loginError} handleLogin={handleLogin} />
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
          <p>Signed in as {session?.user?.email || 'Supabase user'}.</p>
          <button className="sign-out-button" type="button" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
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
                {currencies.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <AddAssetDropdown onAdd={(moduleKey) => {
              setActivePage(moduleKey)
              openCreate(moduleKey)
            }} />
          </div>
        </header>

        {activePage === 'dashboard' && (
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
            onCheckHealth={checkDomainHealth}
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
            githubToken={appSettings.githubToken || import.meta.env.VITE_GITHUB_TOKEN || ''}
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
            openCreate={openCreate}
            openEdit={openEdit}
            setDeleteTarget={setDeleteTarget}
          />
        )}

        {activePage === 'settings' && (
          <SettingsView
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            syncStatus={syncStatus}
            githubSyncStatus={githubSyncStatus}
            syncGitHubRepos={syncGitHubRepos}
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

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        records={records}
        onNavigate={setActivePage}
      />

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

function SettingsView({ appSettings, setAppSettings, syncStatus, githubSyncStatus, syncGitHubRepos }) {
  function updateSetting(key, value) {
    setAppSettings((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="page-content settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <h2>Repository Identity</h2>
          <p>Founder OS is designed to read well as a public GitHub project while staying useful as a private dashboard.</p>
        </div>
        <dl className="settings-list">
          <div><dt>Project name</dt><dd>Founder OS</dd></div>
          <div><dt>Repo name</dt><dd>founder-os</dd></div>
          <div><dt>Description</dt><dd>Personal founder dashboard to manage domains, servers, GitHub repos, accounts, subscriptions, and renewals.</dd></div>
        </dl>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Data Roadmap</h2>
          <p>Supabase sync now, browser storage fallback always.</p>
        </div>
        <div className="checklist">
          {['domains', 'servers', 'github_repos', 'accounts', 'subscriptions'].map((item) => (
            <span key={item}><Database size={16} /> {item}</span>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Storage Mode</h2>
          <p>{syncStatus}</p>
        </div>
        <div className="checklist">
          <span><ShieldCheck size={16} /> Local browser persistence enabled</span>
          <span><Database size={16} /> {supabase ? 'Supabase client configured' : 'Add Supabase env values to enable cloud sync'}</span>
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
              placeholder="chmuzamil"
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
            {supabase
              ? 'Username and API base are saved locally. When signed in, all GitHub settings including your token sync to Supabase (not browser storage).'
              : 'Token stays in this session only. Sign in with Supabase to persist your token securely in the cloud.'}
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

function LoginPage({ loginError, handleLogin }) {
  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <button className="brand login-brand" type="button" aria-label="Founder OS">
          <span className="brand-mark">FO</span>
          <span>
            <strong>Founder OS</strong>
            <small>Private founder workspace</small>
          </span>
        </button>
        <div>
          <span className="repo-pill"><ShieldCheck size={15} /> Private dashboard</span>
          <h1>Your personal command center for domains, servers, repos, accounts, and renewals.</h1>
          <p>Track critical digital assets, renewal dates, costs, and attention items from one calm founder-grade workspace.</p>
        </div>
        <div className="login-preview-grid">
          <span><Globe2 size={17} /> Domains</span>
          <span><Server size={17} /> Servers</span>
          <span><FolderGit2 size={17} /> Repos</span>
          <span><WalletCards size={17} /> Costs</span>
        </div>
      </section>

      <section className="login-card" aria-label="Sign in">
        <div className="panel-heading">
          <h2>Sign in</h2>
          <p>Enter your private Founder OS credentials.</p>
        </div>
        <form className="login-form" autoComplete="off" onSubmit={handleLogin}>
          <label>
            <span>Email</span>
            <input name="founderLoginEmail" type="email" autoComplete="off" required />
          </label>
          <label>
            <span>Password</span>
            <input name="founderLoginPassphrase" type="password" autoComplete="new-password" required />
          </label>
          {loginError && <p className="login-error">{loginError}</p>}
          <button className="primary-button" type="submit">
            <LogIn size={17} />
            Enter Founder OS
          </button>
        </form>
      </section>
    </main>
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
                  {currencies.map((currency) => <option key={currency}>{currency}</option>)}
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
