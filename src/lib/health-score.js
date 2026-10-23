// Plain, checkable facts instead of made-up scores.

// What a project is missing. Servers aren't listed: many projects (static
// sites, libraries) don't need one.
export function getProjectGaps(project) {
  const gaps = []
  if (!project.domainIds?.length) {
    gaps.push({ key: 'no-domain', label: 'No domain linked', action: 'Link its domain so renewals show up here.' })
  }
  if (!project.repoIds?.length) {
    gaps.push({ key: 'no-repo', label: 'No repo linked', action: 'Link its code repository.' })
  }
  return gaps
}

// Summary of the last DNS check for a domain, for a single badge.
// `show` is false when everything is fine, so a healthy domain stays quiet.
export function getDomainCheck(health) {
  if (!health?.lastChecked) {
    return { show: true, label: 'DNS not checked yet', variant: 'outline' }
  }
  const statuses = ['dns', 'nameservers', 'email'].map((key) => health[key])
  if (statuses.includes('missing')) {
    return { show: true, label: 'DNS problem', variant: 'danger' }
  }
  if (statuses.includes('warning')) {
    return { show: true, label: 'DNS needs a look', variant: 'warning' }
  }
  return { show: false, label: 'DNS OK', variant: 'success' }
}
