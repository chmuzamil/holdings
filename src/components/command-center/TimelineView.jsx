import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { getAssetTimeline } from '../../lib/timeline'
import { moduleConfig } from '../../lib/module-config'
import './command-center.css'

export function TimelineView({ records }) {
  const timeline = getAssetTimeline(records)

  return (
    <section className="page-content cc-page">
      {!timeline.length && (
        <Card className="command-panel">
          <p className="settings-status">
            Nothing here yet. Events appear when you add or edit assets, import repos from GitHub,
            or run a DNS check on a domain.
          </p>
        </Card>
      )}
      <div className="timeline">
        {timeline.map((yearBlock) => (
          <Card key={yearBlock.year} className="command-panel">
            <div className="timeline-year">
              <h3 className="section-title">{yearBlock.year}</h3>
              {yearBlock.events.map((event, index) => (
                <div className="timeline-event" key={`${yearBlock.year}-${index}`}>
                  <Badge variant="outline">{moduleConfig[event.moduleKey]?.singular || 'Asset'}</Badge>
                  <span>{event.label}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
