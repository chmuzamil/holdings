import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGitHubUrl } from './github-api'
import {
  dedupeRepoRecords,
  deriveGitHubHealth,
  getRepoIdentityKey,
  mapGitHubRepo,
  mergeGitHubImportedRepos,
  remapRepoLinks,
} from './repo-helpers'

describe('parseGitHubUrl', () => {
  it.each([
    ['https://github.com/acme/widget', { owner: 'acme', repo: 'widget' }],
    ['github.com/acme/widget.git', { owner: 'acme', repo: 'widget' }],
    ['https://github.com/acme/widget/tree/main', { owner: 'acme', repo: 'widget' }],
  ])('parses %s', (url, expected) => {
    expect(parseGitHubUrl(url)).toEqual(expected)
  })

  it.each(['', 'https://gitlab.com/acme/widget', 'https://github.com/acme', 'not a url at all'])('rejects %s', (url) => {
    expect(parseGitHubUrl(url)).toBeNull()
  })
})

describe('deriveGitHubHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('reports archived first', () => {
    expect(deriveGitHubHealth({ archived: true, pushed_at: '2026-10-06' })).toBe('Archived')
  })

  it.each([
    ['2026-10-01', 'Maintained'],
    ['2026-06-01', 'Active'],
    ['2026-01-01', 'Stale'],
  ])('pushed %s -> %s', (pushed, expected) => {
    expect(deriveGitHubHealth({ pushed_at: pushed })).toBe(expected)
  })
})

describe('repo identity and dedupe', () => {
  it('derives owner/repo from the url, case-insensitively', () => {
    expect(getRepoIdentityKey({ name: 'Widget', url: 'https://github.com/Acme/Widget' })).toBe('acme/widget')
  })

  it('merges a manual record and a GitHub import of the same repo, keeping the manual id and links', () => {
    const manual = {
      id: 'repo_widget',
      name: 'Widget',
      url: 'https://github.com/acme/widget',
      connectedProjectIds: ['project_widget'],
      notes: 'Main app',
    }
    const imported = mapGitHubRepo({
      id: 42,
      name: 'widget',
      owner: { login: 'acme' },
      html_url: 'https://github.com/acme/widget',
      stargazers_count: 7,
      pushed_at: '2026-10-01T00:00:00Z',
    }, 'acme')

    const result = mergeGitHubImportedRepos([manual], [imported])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('repo_widget')
    expect(result[0].connectedProjectIds).toEqual(['project_widget'])
    expect(result[0].stars).toBe(7)
  })

  it('keeps distinct repos apart', () => {
    const repos = [
      { id: 'a', name: 'A', url: 'https://github.com/acme/a' },
      { id: 'b', name: 'B', url: 'https://github.com/acme/b' },
      { id: 'c', name: 'No URL' },
    ]
    expect(dedupeRepoRecords(repos).map((repo) => repo.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('remapRepoLinks', () => {
  // The reported case: a project links to an imported repo, then a record is
  // added by hand for the same URL. Loading merges the two.
  const imported = { id: 'github-1', name: 'app', url: 'https://github.com/acme/app', owner: 'acme', connectedProjectIds: ['p1'] }
  const manual = { id: 'm1', name: 'App', url: 'https://github.com/acme/app', notes: 'added by hand', connectedDomainIds: ['d1'] }

  function load(records) {
    const repos = dedupeRepoRecords(records.repos)
    return remapRepoLinks({ ...records, repos }, records.repos)
  }

  it('keeps the project linked to the repo that survives the merge', () => {
    const result = load({
      repos: [imported, manual],
      projects: [{ id: 'p1', name: 'Shop', repoIds: ['github-1'] }],
      domains: [{ id: 'd1', name: 'app.example', connectedRepoIds: ['github-1', 'm1'] }],
      servers: [{ id: 's1', name: 'VPS', connectedRepoIds: ['github-1'] }],
    })
    expect(result.repos.map((repo) => repo.id)).toEqual(['m1'])
    expect(result.projects[0].repoIds).toEqual(['m1'])
    expect(result.domains[0].connectedRepoIds).toEqual(['m1'])
    expect(result.servers[0].connectedRepoIds).toEqual(['m1'])
  })

  it('keeps links from both copies on the merged repo', () => {
    const [merged] = dedupeRepoRecords([imported, manual])
    expect(merged.connectedProjectIds).toEqual(['p1'])
    expect(merged.connectedDomainIds).toEqual(['d1'])
  })

  it('returns the same object when nothing was merged', () => {
    const records = { repos: [manual], projects: [{ id: 'p1', repoIds: ['m1'] }] }
    expect(remapRepoLinks(records, records.repos)).toBe(records)
  })
})
