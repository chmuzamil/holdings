import { useContext } from 'react'
import { Badge } from '../ui/Badge'
import { UptimeContext } from './use-uptime'

const LABELS = {
  up: { text: 'Up', variant: 'success' },
  down: { text: 'Down', variant: 'danger' },
  pending: { text: 'Checking', variant: 'warning' },
  // Not just "Maintenance": that is also a project stage.
  maintenance: { text: 'In maintenance', variant: 'outline' },
  unknown: { text: 'Status unknown', variant: 'outline' },
}

/** "Up" / "Down" next to a server, domain or project, when a monitor is linked to it. */
export function UptimeBadge({ itemId }) {
  const monitor = useContext(UptimeContext)[itemId]
  if (!monitor) return null
  const label = LABELS[monitor.status] ?? LABELS.unknown
  const uptime = monitor.uptime === null || monitor.uptime === undefined ? '' : `, ${(monitor.uptime * 100).toFixed(monitor.uptime === 1 ? 0 : 1)}% up recently`
  return (
    <span title={`${monitor.name}${uptime}`}>
      <Badge variant={label.variant}>{label.text}</Badge>
    </span>
  )
}
