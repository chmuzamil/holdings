import { Card } from '../ui/Card'
import { Progress } from '../ui/Progress'
import { getFounderInsights } from '../../lib/intelligence-helpers'
import { getBurnRateTrend, getCostByProvider, getRenewalForecast } from '../../lib/insights-helpers'
import './command-center.css'

export function InsightsView({ records, flatRecords, displayCurrency, money, fromUsd, toUsd }) {
  const insights = getFounderInsights(records, toUsd)
  const burnTrend = getBurnRateTrend(records, toUsd)
  const providerCosts = getCostByProvider(records, toUsd)
  const renewalForecast = getRenewalForecast(flatRecords, toUsd)
  const trendMax = Math.max(...burnTrend.months.map((m) => m.monthlyUsd), 1)

  const highlights = [
    { label: 'Most Expensive Asset', value: insights.mostExpensive?.name, sub: insights.mostExpensive ? money(fromUsd(insights.mostExpensive.monthlyUsd, displayCurrency), displayCurrency) : null },
    { label: 'Most Connected Project', value: insights.mostConnectedProject?.project.name, sub: insights.mostConnectedProject ? `${insights.mostConnectedProject.connections} connections` : null },
    { label: 'Most Expensive Project', value: insights.mostExpensiveProject?.project.name, sub: insights.mostExpensiveProject ? money(fromUsd(insights.mostExpensiveProject.monthlyUsd, displayCurrency), displayCurrency) : null },
  ].filter((item) => item.value)

  return (
    <section className="page-content cc-page insights-page">
      <div className="cc-grid-2">
        <Card className="cc-stat-card">
          <span>Monthly Burn</span>
          <strong>{money(fromUsd(insights.monthlyUsd, displayCurrency), displayCurrency)}</strong>
          <small>
            {burnTrend.changePercent >= 0 ? '+' : ''}{burnTrend.changePercent}% vs 6 months ago (run-rate estimate)
          </small>
        </Card>
        <Card className="cc-stat-card">
          <span>Annual Burn</span>
          <strong>{money(fromUsd(insights.annualUsd, displayCurrency), displayCurrency)}</strong>
          <small>Projected from current recurring costs</small>
        </Card>
      </div>

      <Card className="command-panel">
        <h3 className="section-title">Burn rate trend</h3>
        <div className="burn-trend-chart">
          {burnTrend.months.map((month) => (
            <div className="burn-trend-col" key={month.label}>
              <div
                className={`burn-trend-bar ${month.isCurrent ? 'current' : ''}`}
                style={{ height: `${Math.max(12, (month.monthlyUsd / trendMax) * 100)}%` }}
                title={money(fromUsd(month.monthlyUsd, displayCurrency), displayCurrency)}
              />
              <span>{month.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {providerCosts.length > 0 && (
        <Card className="command-panel">
          <h3 className="section-title">Cost by provider</h3>
          <div className="provider-cost-list">
            {providerCosts.map((row) => (
              <div className="provider-cost-row" key={row.provider}>
                <div className="provider-cost-meta">
                  <span>{row.provider}</span>
                  <strong>{money(fromUsd(row.monthlyUsd, displayCurrency), displayCurrency)}/mo</strong>
                </div>
                <Progress value={row.percent} />
                <small>{row.types.join(' · ')} · {row.percent}% of spend</small>
              </div>
            ))}
          </div>
        </Card>
      )}

      {renewalForecast.length > 0 && (
        <Card className="command-panel">
          <h3 className="section-title">Renewal forecast</h3>
          <div className="renewal-forecast-list">
            {renewalForecast.map((bucket) => (
              <div className="renewal-forecast-row" key={bucket.key}>
                <div>
                  <strong>{bucket.label}</strong>
                  <small>{bucket.count} renewal{bucket.count === 1 ? '' : 's'}</small>
                </div>
                <span>{money(fromUsd(bucket.liabilityUsd, displayCurrency), displayCurrency)} liability</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {highlights.length > 0 && (
        <div className="cc-grid-3">
          {highlights.map((item) => (
            <Card key={item.label} className="cc-stat-card">
              <span>{item.label}</span>
              <strong style={{ fontSize: 18 }}>{item.value}</strong>
              {item.sub && <small>{item.sub}</small>}
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
