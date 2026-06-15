import { Badge } from '../ui/Badge'
import { Progress } from '../ui/Progress'
import { HEALTH_FACTORS } from '../../lib/health-score'

export function HealthScoreCard({ health, showBreakdown = false, compact = false }) {
  if (!health) return null

  return (
    <div className={`health-score-card-ui ${compact ? 'compact' : ''}`.trim()}>
      <div className="health-score-top">
        <div>
          <span className="health-score-label">Health Score</span>
          {!compact && <p className="health-score-desc">Based on renewals, links, repo activity, and domain checks.</p>}
        </div>
        <div className="health-score-value-wrap">
          <strong className="health-score-num">{health.score}</strong>
          <Badge variant={health.score >= 75 ? 'success' : health.score >= 50 ? 'warning' : 'danger'}>
            {health.label}
          </Badge>
        </div>
      </div>
      <Progress value={health.score} color={health.score >= 75 ? '#34d399' : health.score >= 50 ? '#fbbf24' : '#f87171'} />
      {showBreakdown && (
        <>
          {health.factors?.length > 0 && (
            <ul className="health-factor-list">
              {health.factors.map((f) => (
                <li key={f.text} data-type={f.type}>{f.text}</li>
              ))}
            </ul>
          )}
          <details className="health-how">
            <summary>How is this calculated?</summary>
            <ul>
              {HEALTH_FACTORS.map((f) => (
                <li key={f.id}><strong>{f.label}</strong> — {f.weight}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}
