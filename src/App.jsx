import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Database,
  DollarSign,
  Edit3,
  FolderGit2,
  Globe2,
  LayoutDashboard,
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
      { key: 'cost', label: 'Yearly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Renewal date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  servers: {
    title: 'VPS / Servers',
    singular: 'Server',
    icon: Server,
    empty: 'No servers tracked yet.',
    fields: [
      { key: 'name', label: 'Server', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'ipAddress', label: 'IP Address', type: 'text' },
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
    singular: 'Repo',
    icon: FolderGit2,
    empty: 'No repositories tracked yet.',
    fields: [
      { key: 'name', label: 'Repository', type: 'text' },
      { key: 'provider', label: 'Owner / org', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'cost', label: 'Monthly cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'currency' },
      { key: 'renewalDate', label: 'Review date', type: 'date' },
      { key: 'expiryDate', label: 'Attention date', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
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

const storageKey = 'founder-os-records-v1'
const settingsStorageKey = 'founder-os-settings-v1'
const supabaseTable = 'founder_os_records'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const initialRecords = {
  domains: [
    {
      id: 'domain-1',
      name: 'shopfront.example',
      provider: 'PKNIC',
      cost: 9500,
      currency: 'PKR',
      notes: 'Used for Unity Store Pakistan. Pointed to the ecommerce hosting stack.',
      renewalDate: '2026-07-18',
      expiryDate: '2026-08-18',
      status: 'Expiring Soon',
    },
    {
      id: 'domain-2',
      name: 'maker.example',
      provider: 'Namecheap',
      cost: 16,
      currency: 'USD',
      notes: 'Main brand domain. Used for personal apps and wildcard subdomains.',
      renewalDate: '2026-11-03',
      expiryDate: '2026-12-03',
      status: 'Active',
    },
  ],
  servers: [
    {
      id: 'server-1',
      name: 'Main VPS',
      provider: 'Hostinger Cloud',
      ipAddress: '203.0.113.10',
      notes: 'Hosts Founder OS and wildcard app subdomains.',
      cost: 18,
      currency: 'USD',
      renewalDate: '2026-06-28',
      expiryDate: '2026-07-01',
      status: 'Expiring Soon',
    },
  ],
  repos: [
    {
      id: 'repo-1',
      name: 'PakDataKit repo',
      provider: 'GitHub',
      notes: 'Open-source data toolkit repository.',
      cost: 0,
      currency: 'USD',
      renewalDate: '2026-09-10',
      expiryDate: '2026-09-10',
      status: 'Active',
    },
    {
      id: 'repo-2',
      name: 'TrendPulse / NewsBite',
      provider: 'GitHub',
      notes: 'Content and trends project repository.',
      cost: 0,
      currency: 'USD',
      renewalDate: '2026-07-02',
      expiryDate: '2026-07-02',
      status: 'Active',
    },
  ],
  accounts: [
    {
      id: 'account-1',
      name: 'GitHub',
      provider: 'Developer account',
      cost: 0,
      currency: 'USD',
      renewalDate: '2026-10-01',
      expiryDate: '2026-10-01',
      status: 'Active',
    },
    {
      id: 'account-2',
      name: 'Supabase',
      provider: 'Database platform',
      cost: 25,
      currency: 'USD',
      renewalDate: '2026-06-22',
      expiryDate: '2026-06-22',
      status: 'Expiring Soon',
    },
    {
      id: 'account-3',
      name: 'OpenRouter',
      provider: 'AI gateway',
      cost: 12,
      currency: 'USD',
      renewalDate: '2026-07-15',
      expiryDate: '2026-07-15',
      status: 'Active',
    },
  ],
  subscriptions: [
    {
      id: 'sub-1',
      name: 'OpenRouter',
      provider: 'API credits',
      cost: 12,
      currency: 'USD',
      renewalDate: '2026-07-15',
      expiryDate: '2026-07-15',
      status: 'Active',
    },
    {
      id: 'sub-2',
      name: 'Supabase',
      provider: 'Pro workspace',
      cost: 25,
      currency: 'USD',
      renewalDate: '2026-06-22',
      expiryDate: '2026-06-22',
      status: 'Expiring Soon',
    },
  ],
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'domains', label: 'Domains', icon: Globe2 },
  { id: 'servers', label: 'VPS / Servers', icon: Server },
  { id: 'repos', label: 'GitHub Repos', icon: FolderGit2 },
  { id: 'accounts', label: 'Accounts', icon: UserCircle },
  { id: 'subscriptions', label: 'Subscriptions', icon: WalletCards },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const emptyRecord = {
  name: '',
  provider: '',
  ipAddress: '',
  notes: '',
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
}

function loadSavedRecords() {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return initialRecords
    const parsed = JSON.parse(saved)

    return Object.fromEntries(
      Object.entries(initialRecords).map(([moduleKey, fallbackRecords]) => [
        moduleKey,
        Array.isArray(parsed[moduleKey]) ? parsed[moduleKey] : fallbackRecords,
      ]),
    )
  } catch {
    return initialRecords
  }
}

function loadSavedSettings() {
  try {
    const saved = window.localStorage.getItem(settingsStorageKey)
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

function rowsToRecords(rows) {
  const next = Object.fromEntries(Object.keys(initialRecords).map((moduleKey) => [moduleKey, []]))
  rows.forEach((row) => {
    if (next[row.module_key] && row.record) {
      next[row.module_key].push(row.record)
    }
  })

  return Object.fromEntries(
    Object.entries(initialRecords).map(([moduleKey, fallbackRecords]) => [
      moduleKey,
      next[moduleKey]?.length ? next[moduleKey] : fallbackRecords,
    ]),
  )
}

function recordsToRows(recordsByModule) {
  return Object.entries(recordsByModule).flatMap(([moduleKey, items]) =>
    items.map((record) => ({
      id: record.id,
      module_key: moduleKey,
      record,
      updated_at: new Date().toISOString(),
    })),
  )
}

function money(value, currency = 'USD') {
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
  const days = daysUntil(record.renewalDate || record.expiryDate)
  if (days === null) return 'No date set'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Due today'
  return `${days} days left`
}

function isAttention(record) {
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
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [appSettings, setAppSettings] = useState(loadSavedSettings)
  const [remoteReady, setRemoteReady] = useState(!supabase)
  const [syncStatus, setSyncStatus] = useState(supabase ? 'Supabase ready to connect after login.' : 'Local browser storage active.')
  const [githubSyncStatus, setGithubSyncStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsAuthenticated(Boolean(data.session))
      if (data.session) {
        setRemoteReady(false)
      }
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsAuthenticated(Boolean(nextSession))
      if (nextSession) {
        setRemoteReady(false)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(appSettings))
  }, [appSettings])

  useEffect(() => {
    if (!isAuthenticated || !supabase || remoteReady) return

    async function loadRemoteRecords() {
      setSyncStatus('Loading Supabase records...')
      const { data, error } = await supabase
        .from(supabaseTable)
        .select('id,module_key,record')
        .order('updated_at', { ascending: false })

      if (error) {
        setSyncStatus(`Supabase unavailable: ${error.message}`)
        setRemoteReady(true)
        return
      }

      if (data?.length) {
        setRecords(rowsToRecords(data))
        setSyncStatus('Supabase records loaded.')
      } else {
        setSyncStatus('Supabase is empty. Current local records will be synced.')
      }
      setRemoteReady(true)
    }

    loadRemoteRecords()
  }, [isAuthenticated, remoteReady])

  useEffect(() => {
    if (!supabase || !isAuthenticated || !remoteReady) return

    const syncTimer = window.setTimeout(async () => {
      const { error } = await supabase
        .from(supabaseTable)
        .upsert(recordsToRows(records), { onConflict: 'id' })

      setSyncStatus(error ? `Supabase sync failed: ${error.message}` : 'Saved to Supabase.')
    }, 700)

    return () => window.clearTimeout(syncTimer)
  }, [records, isAuthenticated, remoteReady])

  const flatRecords = useMemo(
    () =>
      Object.entries(records).flatMap(([moduleKey, items]) =>
        items.map((item) => ({ ...item, moduleKey })),
      ),
    [records],
  )

  const stats = useMemo(() => {
    const monthly = records.servers.reduce((sum, item) => sum + toUsd(item), 0)
      + records.repos.reduce((sum, item) => sum + toUsd(item), 0)
      + records.accounts.reduce((sum, item) => sum + toUsd(item), 0)
      + records.subscriptions.reduce((sum, item) => sum + toUsd(item), 0)
    const domainYearly = records.domains.reduce((sum, item) => sum + toUsd(item), 0)
    const attention = flatRecords.filter(isAttention)
    return {
      domains: records.domains.length,
      servers: records.servers.length,
      repos: records.repos.length,
      accounts: records.accounts.length,
      monthly,
      yearly: monthly * 12 + domainYearly,
      upcoming: attention.filter((item) => item.status !== 'Expired').length,
      expired: flatRecords.filter((item) => item.status === 'Expired' || daysUntil(item.expiryDate) < 0).length,
    }
  }, [records, flatRecords])

  const currentConfig = moduleConfig[activePage]
  const visibleRecords = useMemo(() => {
    if (!currentConfig) return []
    return [...records[activePage]]
      .filter((item) => {
        const haystack = `${item.name} ${item.provider} ${item.ipAddress || ''} ${item.notes || ''}`.toLowerCase()
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
    setModal({ moduleKey, mode: 'create', values: emptyRecord })
  }

  function openEdit(moduleKey, record) {
    setModal({ moduleKey, mode: 'edit', id: record.id, values: { ...record } })
  }

  function saveRecord(event) {
    event.preventDefault()
    const values = {
      ...modal.values,
      cost: Number(modal.values.cost || 0),
    }
    setRecords((current) => {
      const next = { ...current }
      if (modal.mode === 'create') {
        next[modal.moduleKey] = [
          { ...values, id: `${modal.moduleKey}-${crypto.randomUUID()}` },
          ...current[modal.moduleKey],
        ]
      } else {
        next[modal.moduleKey] = current[modal.moduleKey].map((item) =>
          item.id === modal.id ? { ...item, ...values } : item,
        )
      }
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
      const importedRepos = repos.map((repo) => ({
        id: `github-${repo.id}`,
        name: repo.full_name || repo.name,
        provider: repo.owner?.login || username || 'GitHub',
        notes: [repo.description, repo.private ? 'Private repo' : 'Public repo', repo.html_url].filter(Boolean).join(' - '),
        cost: 0,
        currency: 'USD',
        renewalDate: repo.updated_at ? repo.updated_at.slice(0, 10) : '',
        expiryDate: repo.pushed_at ? repo.pushed_at.slice(0, 10) : '',
        status: 'Active',
      }))

      setRecords((current) => {
        const incomingIds = new Set(importedRepos.map((repo) => repo.id))
        return {
          ...current,
          repos: [
            ...importedRepos.map((repo) => ({ ...current.repos.find((item) => item.id === repo.id), ...repo })),
            ...current.repos.filter((repo) => !incomingIds.has(repo.id)),
          ],
        }
      })
      setActivePage('repos')
      setGithubSyncStatus(`Imported ${importedRepos.length} GitHub repositories.`)
    } catch (error) {
      setGithubSyncStatus(`GitHub sync failed: ${error.message}`)
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
    setModal(null)
    setDeleteTarget(null)
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

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={activePage === item.id ? 'active' : ''}
                type="button"
                onClick={() => setActivePage(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

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
        <header className="topbar">
          <div>
            <p className="eyebrow">founder-os</p>
            <h1>{currentConfig ? currentConfig.title : 'Founder OS'}</h1>
            <p className="tagline">Your personal command center for domains, servers, repos, accounts, and renewals.</p>
          </div>
          <div className="topbar-actions">
            <label className="currency-switch">
              <span>Currency</span>
              <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value)}>
                {currencies.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            {currentConfig && (
              <button className="primary-button" type="button" onClick={() => openCreate(activePage)}>
                <Plus size={17} />
                Add {currentConfig.singular}
              </button>
            )}
          </div>
        </header>

        {activePage === 'dashboard' && (
          <Dashboard
            flatRecords={flatRecords}
            stats={stats}
            displayCurrency={displayCurrency}
            setActivePage={setActivePage}
            openCreate={openCreate}
          />
        )}

        {currentConfig && (
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

      {modal && (
        <RecordModal
          modal={modal}
          config={moduleConfig[modal.moduleKey]}
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
    </div>
  )
}

function Dashboard({ flatRecords, stats, displayCurrency, setActivePage, openCreate }) {
  const metricCards = [
    { label: 'Total Domains', value: stats.domains, icon: Globe2, page: 'domains' },
    { label: 'Total VPS / Servers', value: stats.servers, icon: Server, page: 'servers' },
    { label: 'Total GitHub Repos', value: stats.repos, icon: FolderGit2, page: 'repos' },
    { label: 'Total Accounts', value: stats.accounts, icon: UserCircle, page: 'accounts' },
    { label: 'Monthly Cost', value: money(fromUsd(stats.monthly, displayCurrency), displayCurrency), icon: DollarSign },
    { label: 'Yearly Cost', value: money(fromUsd(stats.yearly, displayCurrency), displayCurrency), icon: CalendarClock },
    { label: 'Upcoming Renewals', value: stats.upcoming, icon: AlertTriangle },
    { label: 'Expired / Attention Needed', value: stats.expired, icon: AlertTriangle },
  ]

  const upcoming = [...flatRecords]
    .filter(isAttention)
    .sort((a, b) => new Date(`${a.renewalDate}T00:00:00`) - new Date(`${b.renewalDate}T00:00:00`))
    .slice(0, 6)

  return (
    <section className="dashboard-stack">
      <div className="repo-hero">
        <div>
          <span className="repo-pill"><Database size={15} /> GitHub-profile-ready</span>
          <h2>Personal founder dashboard to manage domains, servers, GitHub repos, accounts, subscriptions, and renewals.</h2>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => openCreate('domains')}>
            <Plus size={16} />
            Add asset
          </button>
          <button type="button" onClick={() => setActivePage('subscriptions')}>
            <WalletCards size={16} />
            Costs
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        {metricCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              className="metric-card"
              key={card.label}
              type="button"
              onClick={() => card.page && setActivePage(card.page)}
            >
              <span><Icon size={18} /></span>
              <small>{card.label}</small>
              <strong>{card.value}</strong>
            </button>
          )
        })}
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Renewal Radar</h2>
            <p>Records needing attention in the next 30 days.</p>
          </div>
          <div className="renewal-list">
            {upcoming.length ? upcoming.map((item) => (
              <button className="renewal-item" key={item.id} type="button" onClick={() => setActivePage(item.moduleKey)}>
                <span className={`status-dot ${statusClass(item.status)}`} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{moduleConfig[item.moduleKey].title} - {getReminder(item)}</small>
                </div>
                <span>{prettyDate(item.renewalDate)}</span>
              </button>
            )) : <EmptyState title="All clear" text="No renewals need attention right now." />}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Open Source Finish</h2>
            <p>Project identity tuned for a premium GitHub profile repository.</p>
          </div>
          <div className="checklist">
            {['Dark SaaS dashboard UI', 'Mock data included', 'CRUD-ready modules', 'Supabase-ready structure'].map((item) => (
              <span key={item}><Check size={16} /> {item}</span>
            ))}
          </div>
        </section>
      </div>
    </section>
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
    <section className="module-stack">
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
          <article className={isAttention(record) ? 'record-row attention' : 'record-row'} key={record.id}>
            <div className="record-title">
              <span className="record-icon"><Icon size={17} /></span>
              <div>
                <strong>{record.name}</strong>
                <small>{getReminder(record)}</small>
                {(moduleKey === 'domains' || moduleKey === 'servers' || moduleKey === 'repos') && record.notes && (
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
    <section className="settings-grid">
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
            />
          </label>
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

function RecordModal({ modal, config, setModal, saveRecord }) {
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
        <div className="form-grid">
          {config.fields.map((field) => (
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

function EmptyState({ title, text, action, actionLabel }) {
  return (
    <div className="empty-state">
      <Database size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <button type="button" onClick={action}><Plus size={16} /> {actionLabel}</button>}
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
