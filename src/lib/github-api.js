import { deriveGitHubHealth } from './repo-helpers'

export function parseGitHubUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (!parsed.hostname.includes('github.com')) return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

export async function fetchRepoStats(url, token) {
  const parsed = parseGitHubUrl(url)
  if (!parsed) {
    throw new Error('Invalid GitHub URL')
  }

  const apiBase = import.meta.env.VITE_GITHUB_API_BASE || 'https://api.github.com'
  const endpoint = `${apiBase.replace(/\/$/, '')}/repos/${parsed.owner}/${parsed.repo}`
  const envToken = import.meta.env.VITE_GITHUB_TOKEN || ''
  const authToken = token || envToken

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`)
  }

  const repo = await response.json()
  return {
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    watchers: repo.watchers_count || 0,
    language: repo.language || '',
    createdAt: repo.created_at ? repo.created_at.slice(0, 10) : '',
    updatedAt: repo.updated_at ? repo.updated_at.slice(0, 10) : '',
    lastCommitAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : '',
    archived: Boolean(repo.archived),
    visibility: repo.private ? 'Private' : 'Public',
    githubHealth: deriveGitHubHealth({
      archived: repo.archived,
      pushed_at: repo.pushed_at,
    }),
    statsSyncedAt: new Date().toISOString(),
    statsUnavailable: false,
  }
}

export async function fetchAllRepoStats(repos, token, onProgress) {
  const results = []
  for (const repo of repos) {
    const url = repo.url || repo.githubUrl
    if (!url || !parseGitHubUrl(url)) {
      results.push({ id: repo.id, skipped: true })
      continue
    }
    try {
      const stats = await fetchRepoStats(url, token)
      results.push({ id: repo.id, stats })
      onProgress?.({ id: repo.id, ok: true })
    } catch {
      results.push({ id: repo.id, stats: { statsUnavailable: true, statsSyncedAt: new Date().toISOString() } })
      onProgress?.({ id: repo.id, ok: false })
    }
  }
  return results
}
