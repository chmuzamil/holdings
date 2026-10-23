import { Card } from '../ui/Card'
import { Progress } from '../ui/Progress'
import { getFounderInsights } from '../../lib/intelligence-helpers'
import { getCashForecast, getCostByProvider } from '../../lib/insights-helpers'
import { percentLabel } from '../../lib/format'
import './command-center.css'

export function InsightsView({ records, displayCurrency, money, fromUsd, toUsd }) {
  const insights = getFounderInsights(records, toUsd)
  const providerCosts = getCostByProvider(records, toUsd)
  const forecast = getCashForecast(records, toUsd)
  const forecastMax = Math.max(...forecast.map((month) => month.totalUsd), 1)
  const forecastTotal = forecast.reduce((sum, month) => sum + month.totalUsd, 0)
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)

  const highlights = [
    { label: 'Costliest item', value: insights.mostExpensive?.name, sub: insights.mostExpensive ? `${show(insights.mostExpensive.monthlyUsd)}/mo` : null },
    { label: 'Costliest project', value: insights.mostExpensiveProject?.project.name, sub: insights.mostExpensiveProject ? `${show(insights.mostExpensiveProject.monthlyUsd)}/mo` : null },
    { label: 'Most connected project', value: insights.mostConnectedProject?.project.name, sub: insights.mostConnectedProject ? `${insights.mostConnectedProject.connections} linked items` : null },
  ].filter((item) => item.value)

  return (
    <section className="page-content cc-page insights-page">
      <div className="cc-grid-2">
        <Card className="cc-stat-card">
          <span>Monthly cost</span>
          <strong>{show(insights.monthlyUsd)}</strong>
          <small>Everything you pay for, with yearly costs spread over 12 months</small>
        </Card>
        <Card className="cc-stat-card">
          <span>Next 12 months</span>
          <strong>{show(forecastTotal)}</strong>
          <small>What you&apos;ll actually pay, month by month below</small>
        </Card>
      </div>

      <Card className="command-panel">
        <h3 className="section-title">Money due each month</h3>
        <div className="forecast-chart" aria-hidden="true">
          {forecast.map((month) => (
            <div className="forecast-col" key={month.key} title={month.renewals.map((item) => `${item.name}: ${show(item.usd)}`).join('\n')}>
              <span className="forecast-value">{show(month.totalUsd)}</span>
              <div className="forecast-track">
                <div
                  className={`forecast-bar ${month.renewals.length ? 'has-renewals' : ''}`}
                  style={{ height: `${(month.totalUsd / forecastMax) * 100}%` }}
                />
              </div>
              <span className="forecast-label">{month.label}</span>
            </div>
          ))}
        </div>
        <div className="sr-only">
          <table>
            <caption>Money due each month for the next 12 months</caption>
          <tbody>
            {forecast.map((month) => (
              <tr key={month.key}>
                <th scope="row">{month.label} {month.year}</th>
                <td>{show(month.totalUsd)}</td>
                <td>{month.renewals.map((item) => item.name).join(', ')}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <ul className="forecast-renewals">
          {forecast.filter((month) => month.renewals.length).map((month) => (
            <li key={month.key}>
              <strong>{month.label} {month.year}</strong>
              <span>{month.renewals.map((item) => `${item.name} ${show(item.usd)}`).join(' · ')}</span>
            </li>
          ))}
        </ul>
        <p className="settings-status">
          Each bar is your monthly bills plus any yearly renewals (like domains) due that month.
        </p>
      </Card>

      {providerCosts.length > 0 && (
        <Card className="command-panel">
          <h3 className="section-title">Cost by provider</h3>
          <div className="provider-cost-list">
            {providerCosts.map((row) => (
              <div className="provider-cost-row" key={row.provider}>
                <div className="provider-cost-meta">
                  <span>{row.provider}</span>
                  <strong>{show(row.monthlyUsd)}/mo</strong>
                </div>
                <Progress value={row.share.percent} label={`${row.provider}: ${percentLabel(row.share)} of spending`} />
                <small>{row.types.join(' · ')} · {percentLabel(row.share)} of spending</small>
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
              <strong className="cc-stat-name">{item.value}</strong>
              {item.sub && <small>{item.sub}</small>}
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
