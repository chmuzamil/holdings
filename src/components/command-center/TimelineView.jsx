import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { getAssetTimeline } from '../../lib/intelligence-helpers'
import { moduleConfig } from '../../lib/module-config'
import './command-center.css'

export function TimelineView({ records }) {
  const timeline = getAssetTimeline(records)

  return (
    <section className="page-content cc-page">
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
