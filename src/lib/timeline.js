// Timeline events come only from dates we actually know:
// - when a record was added to the app (`addedAt`),
// - when a GitHub repo was created (from the GitHub API),
// - when a domain was registered (from its registry, via a DNS/RDAP check).
const MODULE_NOUNS = {
  domains: 'domain',
  servers: 'server',
  repos: 'repository',
  projects: 'project',
  accounts: 'account',
  subscriptions: 'subscription',
}

function toTime(value) {
  if (!value) return NaN
  const text = String(value)
  return new Date(text.length === 10 ? `${text}T00:00:00` : text).getTime()
}

export function getTimelineEvents(records) {
  const events = []

  Object.entries(records).forEach(([moduleKey, items]) => {
    ;(items || []).forEach((item) => {
      if (item.addedAt) {
        events.push({
          date: item.addedAt,
          label: `Started tracking ${MODULE_NOUNS[moduleKey] || 'asset'} ${item.name}`,
          moduleKey,
          recordId: item.id,
        })
      }
    })
  })

  ;(records.repos || []).forEach((repo) => {
    if (repo.createdAt) {
      events.push({ date: repo.createdAt, label: `Created ${repo.name} on GitHub`, moduleKey: 'repos', recordId: repo.id })
    }
  })

  ;(records.domains || []).forEach((domain) => {
    const registered = domain.lookup?.whois?.created
    if (registered) {
      events.push({ date: registered, label: `Registered ${domain.name}`, moduleKey: 'domains', recordId: domain.id })
    }
  })

  return events
    .filter((event) => !Number.isNaN(toTime(event.date)))
    .sort((a, b) => toTime(b.date) - toTime(a.date))
}

export function getAssetTimeline(records) {
  const byYear = new Map()
  getTimelineEvents(records).forEach((event) => {
    const year = new Date(toTime(event.date)).getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(event)
  })
  return [...byYear.entries()].map(([year, events]) => ({ year, events }))
}
