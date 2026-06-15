import { normalizeProjectRecord } from './project-helpers'
import { normalizeServerRecord } from './server-helpers'
import { normalizeRepoRecord } from './repo-helpers'

export function resolveByIds(items, ids = []) {
  const idSet = new Set(ids)
  return (items || []).filter((item) => idSet.has(item.id))
}

export function resolveProjectAssets(project, records) {
  const normalized = normalizeProjectRecord(project)
  return {
    domains: resolveByIds(records.domains, normalized.domainIds),
    repos: resolveByIds(records.repos, normalized.repoIds).map(normalizeRepoRecord),
    servers: resolveByIds(records.servers, normalized.serverIds).map(normalizeServerRecord),
    subscriptions: resolveByIds(records.subscriptions, normalized.subscriptionIds),
  }
}

export function resolveDomainConnections(domain, records) {
  const projects = resolveByIds(records.projects, domain.connectedProjectIds)
  const servers = resolveByIds(records.servers, domain.connectedServerIds)
  const repos = resolveByIds(records.repos, domain.connectedRepoIds).map(normalizeRepoRecord)

  if (!projects.length && domain.connectedProjectIds?.length === 0) {
    const linkedProjects = (records.projects || [])
      .filter((project) => normalizeProjectRecord(project).domainIds.includes(domain.id))
    return {
      projects: linkedProjects,
      servers,
      repos,
    }
  }

  return { projects, servers, repos }
}

export function resolveRepoConnections(repo, records) {
  const normalized = normalizeRepoRecord(repo)
  const projectIds = normalized.connectedProjectIds?.length
    ? normalized.connectedProjectIds
    : (records.projects || [])
      .filter((project) => normalizeProjectRecord(project).repoIds.includes(repo.id))
      .map((project) => project.id)

  return {
    projects: resolveByIds(records.projects, projectIds),
    domains: resolveByIds(records.domains, normalized.connectedDomainIds),
    servers: resolveByIds(records.servers, normalized.connectedServerIds),
  }
}

export function resolveServerConnections(server, records) {
  const normalized = normalizeServerRecord(server)
  const projectIds = normalized.connectedProjectIds?.length
    ? normalized.connectedProjectIds
    : (records.projects || [])
      .filter((project) => normalizeProjectRecord(project).serverIds.includes(server.id))
      .map((project) => project.id)

  const domains = (records.domains || []).filter((domain) =>
    domain.connectedServerIds?.includes(server.id)
    || normalizeProjectRecord(
      (records.projects || []).find((project) => projectIds.includes(project.id)) || {},
    ).domainIds.includes(domain.id),
  )

  const repos = (records.repos || []).filter((repo) =>
    normalizeRepoRecord(repo).connectedServerIds?.includes(server.id)
    || (records.projects || []).some((project) => {
      const normalizedProject = normalizeProjectRecord(project)
      return projectIds.includes(project.id) && normalizedProject.repoIds.includes(repo.id)
    }),
  )

  return {
    projects: resolveByIds(records.projects, projectIds),
    domains,
    repos: repos.map(normalizeRepoRecord),
  }
}

export function getAssetMap(records, limit = 6) {
  return (records.projects || [])
    .map(normalizeProjectRecord)
    .slice(0, limit)
    .map((project) => {
      const assets = resolveProjectAssets(project, records)
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        domains: assets.domains.map((item) => item.name),
        servers: assets.servers.map((item) => item.name),
        repos: assets.repos.map((item) => item.name),
        subscriptions: assets.subscriptions.map((item) => item.name),
      }
    })
}

export function countConnectedProjects(records) {
  return (records.projects || []).filter((project) => {
    const normalized = normalizeProjectRecord(project)
    return normalized.domainIds.length
      || normalized.repoIds.length
      || normalized.serverIds.length
      || normalized.subscriptionIds.length
  }).length
}
