export const repoDevStatuses = [
  'Idea',
  'Planning',
  'Building',
  'Beta',
  'Production',
  'Maintained',
  'Archived',
]

export const repoCategories = [
  'SaaS',
  'OSS Library',
  'Internal Tool',
  'Mobile App',
  'Content Platform',
  'Website',
  'Utility',
  'API',
  'CLI',
]
export const repoVisibilities = ['Public', 'Private']
export const repoProjectTags = ['Open Source', 'SaaS', 'Internal', 'Archived']

export const languageColors = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  PHP: '#4F5D95',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Dart: '#00B4AB',
  Flutter: '#02569B',
  Ruby: '#701516',
  Shell: '#89e051',
  CSS: '#563d7c',
  HTML: '#e34c26',
  Vue: '#41b883',
  Svelte: '#ff3e00',
}

export const githubHealthStatuses = ['Active', 'Maintained', 'Stale', 'Archived']

export const emptyRepoRecord = {
  name: '',
  owner: '',
  description: '',
  url: '',
  githubUrl: '',
  visibility: 'Public',
  category: 'Internal Tool',
  githubName: '',
  projectTags: [],
  techStack: [],
  language: '',
  projectStatus: 'Building',
  devStatus: 'Building',
  githubHealth: 'Active',
  stars: 0,
  forks: 0,
  openIssues: 0,
  watchers: 0,
  createdAt: '',
  updatedAt: '',
  lastCommitAt: '',
  connectedDomain: '',
  connectedProjectIds: [],
  connectedDomainIds: [],
  connectedServerIds: [],
  deployment: '',
  database: '',
  liveUrl: '',
  docsUrl: '',
  notes: '',
  archived: false,
  statsSyncedAt: '',
  statsUnavailable: false,
}

export function deriveGitHubHealth({ archived, pushed_at: pushedAt, lastCommitAt }) {
  if (archived) return 'Archived'
  const pushed = pushedAt || lastCommitAt
  if (!pushed) return 'Active'
  const days = Math.floor((Date.now() - new Date(pushed).getTime()) / 86400000)
  if (days <= 30) return 'Maintained'
  if (days > 180) return 'Stale'
  return 'Active'
}

export function githubHealthVariant(status) {
  if (status === 'Maintained' || status === 'Active') return 'success'
  if (status === 'Stale') return 'warning'
  if (status === 'Archived') return 'expired'
  return 'outline'
}

export function formatRepoDisplayName(value) {
  if (!value) return ''
  if (value.includes('/')) {
    return formatRepoDisplayName(value.split('/').pop())
  }
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function mapLegacyCategory(value) {
  const legacyMap = {
    Library: 'OSS Library',
    'Open Source': 'OSS Library',
    App: 'Internal Tool',
    Tool: 'Internal Tool',
    Internal: 'Internal Tool',
    SaaS: 'SaaS',
  }
  const candidate = legacyMap[value] || value
  if (repoCategories.includes(candidate)) return candidate
  if (candidate === 'Utility' || candidate === 'Website') return candidate
  return 'Internal Tool'
}

export function getPortfolioName(record) {
  const rawName = String(record.name || '').trim()
  if (!rawName) return 'Untitled Project'
  if (!rawName.includes('/')) return rawName
  return formatRepoDisplayName(rawName.split('/').pop())
}

export function normalizeRepoRecord(record) {
  const {
    renewalDate,
    expiryDate,
    status,
    cost,
    currency,
    provider,
    repoType,
    ...repoFields
  } = record

  const legacyStatus = record.projectStatus || record.devStatus || status
  const projectStatus = repoDevStatuses.includes(legacyStatus)
    ? legacyStatus
    : legacyStatus === 'Active'
      ? 'Production'
      : legacyStatus === 'Cancelled'
        ? 'Archived'
        : 'Building'

  const techStack = Array.isArray(record.techStack)
    ? record.techStack
    : String(record.techStack || '')
      .split(/[,\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)

  const projectTags = Array.isArray(record.projectTags)
    ? record.projectTags
    : []

  if (record.archived && !projectTags.includes('Archived')) {
    projectTags.push('Archived')
  }

  const legacyCategory = record.category || repoType
  const githubName = record.githubName || (record.name?.includes('/') ? record.name.split('/').pop() : '')
  const portfolioName = record.name?.includes('/')
    ? getPortfolioName(record)
    : (record.name || formatRepoDisplayName(githubName))

  const url = record.url || record.githubUrl || ''
  const githubHealth = record.githubHealth
    || deriveGitHubHealth({
      archived: record.archived,
      lastCommitAt: record.lastCommitAt,
    })

  return {
    ...emptyRepoRecord,
    ...repoFields,
    name: portfolioName || 'Untitled Project',
    githubName,
    owner: record.owner || provider || '',
    description: record.description || record.notes || '',
    url,
    githubUrl: record.githubUrl || url,
    visibility: record.visibility || (String(record.notes || '').includes('Private') ? 'Private' : 'Public'),
    category: mapLegacyCategory(legacyCategory),
    projectTags,
    techStack,
    language: record.language || '',
    projectStatus,
    devStatus: projectStatus,
    githubHealth,
    stars: Number(record.stars || 0),
    forks: Number(record.forks || 0),
    openIssues: Number(record.openIssues || 0),
    watchers: Number(record.watchers || 0),
    createdAt: record.createdAt || '',
    updatedAt: record.updatedAt || '',
    lastCommitAt: record.lastCommitAt || '',
    connectedDomain: record.connectedDomain || '',
    connectedProjectIds: Array.isArray(record.connectedProjectIds) ? record.connectedProjectIds : [],
    connectedDomainIds: Array.isArray(record.connectedDomainIds) ? record.connectedDomainIds : [],
    connectedServerIds: Array.isArray(record.connectedServerIds) ? record.connectedServerIds : [],
    deployment: record.deployment || '',
    database: record.database || '',
    liveUrl: record.liveUrl || '',
    docsUrl: record.docsUrl || '',
    notes: record.notes && record.description ? record.notes : (record.notes || ''),
    archived: Boolean(record.archived || projectStatus === 'Archived'),
    statsSyncedAt: record.statsSyncedAt || '',
    statsUnavailable: Boolean(record.statsUnavailable),
  }
}

export function getLanguageColor(language) {
  if (!language) return '#94a3b8'
  return languageColors[language] || '#94a3b8'
}

export function timeAgo(value) {
  if (!value) return 'Unknown'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  const diffMs = Date.now() - date.getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days < 0) return 'In the future'
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

export function prettyMonthYear(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

export function computeRepoStats(repos) {
  const normalized = repos.map(normalizeRepoRecord)
  const active = normalized.filter((repo) => repo.githubHealth === 'Active' || repo.githubHealth === 'Maintained')
  const stale = normalized.filter((repo) => repo.githubHealth === 'Stale')
  return {
    total: normalized.length,
    public: normalized.filter((repo) => repo.visibility === 'Public').length,
    private: normalized.filter((repo) => repo.visibility === 'Private').length,
    active: active.length,
    stale: stale.length,
    stars: normalized.reduce((sum, repo) => sum + repo.stars, 0),
  }
}

export function devStatusVariant(status) {
  if (status === 'Production' || status === 'Maintained') return 'success'
  if (status === 'Beta' || status === 'Building' || status === 'Planning') return 'warning'
  if (status === 'Archived') return 'expired'
  if (status === 'Idea') return 'outline'
  return 'default'
}

export function visibilityVariant(visibility) {
  return visibility === 'Private' ? 'warning' : 'success'
}

function parseRepoPathFromUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (!parsed.hostname.includes('github.com')) return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return {
      owner: parts[0].toLowerCase(),
      repo: parts[parts.length - 1].replace(/\.git$/, '').toLowerCase(),
    }
  } catch {
    return null
  }
}

export function getRepoIdentityKey(record) {
  const normalized = normalizeRepoRecord(record)
  const parsed = parseRepoPathFromUrl(normalized.url || normalized.githubUrl)
  if (parsed) return `${parsed.owner}/${parsed.repo}`

  const owner = String(normalized.owner || '').trim().toLowerCase()
  const githubName = String(normalized.githubName || '').trim().toLowerCase()
  if (owner && githubName) return `${owner}/${githubName}`

  const rawName = String(record.name || '').trim()
  if (rawName.includes('/')) {
    const parts = rawName.split('/').filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0].toLowerCase()}/${parts[parts.length - 1].toLowerCase()}`
    }
  }

  return null
}

function repoRecordPriority(record) {
  const normalized = normalizeRepoRecord(record)
  let score = 0
  if (!String(record.id || '').startsWith('github-')) score += 100
  if (normalized.connectedProjectIds?.length) score += 50
  if (normalized.connectedDomainIds?.length) score += 30
  if (normalized.connectedServerIds?.length) score += 20
  if (normalized.liveUrl) score += 15
  if (normalized.deployment) score += 10
  if (normalized.notes) score += 5
  if (normalized.githubName) score += 3
  return score
}

export function mergeRepoRecords(primary, secondary) {
  const keep = normalizeRepoRecord(primary)
  const merge = normalizeRepoRecord(secondary)
  const github = String(merge.id).startsWith('github-')
    ? merge
    : String(keep.id).startsWith('github-')
      ? keep
      : null

  const merged = {
    ...keep,
    ...merge,
    id: keep.id,
    name: keep.name || merge.name,
    description: keep.description || merge.description,
    category: keep.category,
    projectStatus: keep.projectStatus,
    devStatus: keep.devStatus,
    notes: keep.notes || merge.notes,
    connectedProjectIds: keep.connectedProjectIds?.length ? keep.connectedProjectIds : merge.connectedProjectIds,
    connectedDomainIds: keep.connectedDomainIds?.length ? keep.connectedDomainIds : merge.connectedDomainIds,
    connectedServerIds: keep.connectedServerIds?.length ? keep.connectedServerIds : merge.connectedServerIds,
    connectedDomain: keep.connectedDomain || merge.connectedDomain,
    deployment: keep.deployment || merge.deployment,
    database: keep.database || merge.database,
    liveUrl: keep.liveUrl || merge.liveUrl,
    docsUrl: keep.docsUrl || merge.docsUrl,
    projectTags: keep.projectTags?.length ? keep.projectTags : merge.projectTags,
    techStack: keep.techStack?.length ? keep.techStack : merge.techStack,
    githubName: keep.githubName || merge.githubName,
    owner: keep.owner || merge.owner,
    url: keep.url || merge.url,
    githubUrl: keep.githubUrl || merge.githubUrl,
    language: keep.language || merge.language,
    statsSyncedAt: keep.statsSyncedAt || merge.statsSyncedAt,
    statsUnavailable: keep.statsUnavailable && merge.statsUnavailable,
  }

  if (github) {
    Object.assign(merged, {
      githubName: github.githubName || merged.githubName,
      owner: github.owner || merged.owner,
      url: github.url || merged.url,
      githubUrl: github.githubUrl || merged.githubUrl,
      stars: github.stars,
      forks: github.forks,
      openIssues: github.openIssues,
      watchers: github.watchers,
      language: github.language || merged.language,
      visibility: github.visibility,
      githubHealth: github.githubHealth,
      createdAt: github.createdAt || merged.createdAt,
      updatedAt: github.updatedAt || merged.updatedAt,
      lastCommitAt: github.lastCommitAt || merged.lastCommitAt,
      archived: github.archived,
      statsSyncedAt: github.statsSyncedAt || merged.statsSyncedAt,
      statsUnavailable: github.statsUnavailable,
    })
  }

  return normalizeRepoRecord(merged)
}

export function dedupeRepoRecords(repos) {
  const groups = new Map()
  const withoutKey = []

  repos.forEach((repo) => {
    const normalized = normalizeRepoRecord(repo)
    const key = getRepoIdentityKey(normalized)
    if (!key) {
      withoutKey.push(normalized)
      return
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(normalized)
  })

  const deduped = [...withoutKey]
  groups.forEach((group) => {
    if (group.length === 1) {
      deduped.push(group[0])
      return
    }

    const sorted = [...group].sort((a, b) => repoRecordPriority(b) - repoRecordPriority(a))
    let winner = sorted[0]
    for (let index = 1; index < sorted.length; index += 1) {
      winner = mergeRepoRecords(winner, sorted[index])
    }
    deduped.push(winner)
  })

  return deduped
}

export function mergeGitHubImportedRepos(currentRepos, importedRepos) {
  const normalizedCurrent = currentRepos.map(normalizeRepoRecord)
  const importedKeys = new Set(
    importedRepos.map((repo) => getRepoIdentityKey(repo)).filter(Boolean),
  )
  const importedIds = new Set(importedRepos.map((repo) => repo.id))

  const mergedImports = importedRepos.map((imported) => {
    const normalizedImported = normalizeRepoRecord(imported)
    const identityKey = getRepoIdentityKey(normalizedImported)

    const existing = normalizedCurrent.find((item) => item.id === normalizedImported.id)
      || (identityKey
        ? normalizedCurrent.find((item) => getRepoIdentityKey(item) === identityKey)
        : null)

    return existing
      ? mergeRepoRecords(existing, normalizedImported)
      : normalizedImported
  })

  const leftovers = normalizedCurrent.filter((repo) => {
    if (importedIds.has(repo.id)) return false
    const identityKey = getRepoIdentityKey(repo)
    return !(identityKey && importedKeys.has(identityKey))
  })

  return dedupeRepoRecords([...mergedImports, ...leftovers])
}

function inferGitHubCategory(repo) {
  const topics = repo.topics || []
  if (topics.includes('saas')) return 'SaaS'
  if (topics.includes('cli')) return 'CLI'
  if (topics.includes('api')) return 'API'
  if (topics.includes('mobile') || topics.includes('flutter')) return 'Mobile App'
  if (repo.private) return 'Internal Tool'
  return 'OSS Library'
}

export function mapGitHubRepo(repo, username) {
  const language = repo.language || ''
  return normalizeRepoRecord({
    id: `github-${repo.id}`,
    name: formatRepoDisplayName(repo.name),
    githubName: repo.name,
    owner: repo.owner?.login || username || 'GitHub',
    description: repo.description || '',
    url: repo.html_url || '',
    visibility: repo.private ? 'Private' : 'Public',
    category: inferGitHubCategory(repo),
    projectTags: [
      repo.private ? null : 'Open Source',
      repo.archived ? 'Archived' : null,
    ].filter(Boolean),
    techStack: language ? [language] : [],
    language,
    projectStatus: repo.archived ? 'Archived' : 'Maintained',
    githubHealth: deriveGitHubHealth({ archived: repo.archived, pushed_at: repo.pushed_at }),
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    watchers: repo.subscribers_count || repo.watchers_count || 0,
    createdAt: repo.created_at ? repo.created_at.slice(0, 10) : '',
    updatedAt: repo.updated_at ? repo.updated_at.slice(0, 10) : '',
    lastCommitAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : '',
    archived: Boolean(repo.archived),
    statsSyncedAt: new Date().toISOString(),
    statsUnavailable: false,
    notes: '',
  })
}
