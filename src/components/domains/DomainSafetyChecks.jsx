import { Badge } from '../ui/Badge'
import { getDomainRisks } from '../../lib/domain-risk'

const STATUS = {
  pass: { variant: 'success', label: 'OK' },
  warn: { variant: 'warning', label: 'Fix' },
  fail: { variant: 'danger', label: 'Fix now' },
  tip: { variant: 'outline', label: 'Tip' },
  unknown: { variant: 'outline', label: 'Unknown' },
}

/** The domain's safety checks, each with what to do when it isn't fine. */
export function DomainSafetyChecks({ record }) {
  const risks = getDomainRisks(record)
  return (
    <div className="domain-drawer-section">
      <h4>Safety checks</h4>
      <ul className="domain-safety-list">
        {risks.checks.map((check) => (
          <li key={check.key}>
            <Badge variant={STATUS[check.status].variant}>{STATUS[check.status].label}</Badge>
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
              {check.action && <span className="domain-safety-action">{check.action}</span>}
            </div>
          </li>
        ))}
      </ul>
      <p className="domain-safety-note">
        {risks.checkedAt ? `From the DNS check on ${risks.checkedAt}. ` : ''}
        DKIM isn&apos;t checked: it needs the selector name your mail provider uses.
      </p>
    </div>
  )
}
