import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGitHubUrl } from './github-api'
import {
  dedupeRepoRecords,
  deriveGitHubHealth,
  getRepoIdentityKey,
  mapGitHubRepo,
  mergeGitHubImportedRepos,
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
