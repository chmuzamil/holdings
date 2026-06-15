import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { HealthScoreCard } from '../shared/HealthScoreCard'
import {
  getHealthRecommendations,
  getHealthScoreBreakdown,
  getHealthScoreTimeline,
} from '../../lib/health-score'
import './command-center.css'

const PRIORITY_VARIANT = { high: 'danger', medium: 'warning', low: 'outline' }

export function ProjectHealthView({ records, flatRecords }) {
  const health = getHealthScoreBreakdown(records, flatRecords)
  const recommendations = getHealthRecommendations(health)
  const timeline = getHealthScoreTimeline(records, flatRecords)

  return (
    <section className="page-content cc-page health-page">
      <Card className="command-panel">
        <HealthScoreCard health={health} showBreakdown />
      </Card>

      <Card className="command-panel">
        <h3 className="section-title">Score over time</h3>
        <div className="health-timeline">
          {timeline.map((point, index) => (
            <div className="health-timeline-item" key={`${point.label}-${index}`}>
              <div className="health-timeline-score">
                <strong>{point.score}</strong>
                <span>{point.label}</span>
              </div>
              <p>{point.reason}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="command-panel">
        <h3 className="section-title">Recommendations</h3>
        <div className="health-rec-list">
          {recommendations.length ? recommendations.map((rec) => (
            <div className="health-rec-item" key={rec.text}>
              <Badge variant={PRIORITY_VARIANT[rec.priority]}>{rec.priority}</Badge>
              <div>
                <strong>{rec.text}</strong>
                <small>{rec.action}</small>
              </div>
            </div>
          )) : (
            <p className="settings-status">No recommendations — your health score is in good shape.</p>
          )}
        </div>
      </Card>
    </section>
  )
}
