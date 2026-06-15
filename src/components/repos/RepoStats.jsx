import { Card } from '../ui/Card'

export function RepoStats({ stats }) {
  const items = [
    { label: 'Total Repositories', value: stats.total },
    { label: 'Active Repositories', value: stats.active },
    { label: 'Stale Repositories', value: stats.stale },
    { label: 'Public', value: stats.public },
    { label: 'Private', value: stats.private },
    { label: 'Total Stars', value: stats.stars },
  ]

  return (
    <div className="repo-stats-grid">
      {items.map((item) => (
        <Card key={item.label} className="repo-stat-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </Card>
      ))}
    </div>
  )
}
