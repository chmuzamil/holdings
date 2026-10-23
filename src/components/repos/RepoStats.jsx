import { Card } from '../ui/Card'

export function RepoStats({ stats }) {
  const items = [
    { label: 'Repos', value: stats.total },
    { label: 'Active', value: stats.active },
    { label: 'No changes in 6 months', value: stats.stale },
    { label: 'Public', value: stats.public },
    { label: 'Private', value: stats.private },
    { label: 'Stars', value: stats.stars },
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
