import { ArrowRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getAttentionItems } from '../../lib/intelligence-helpers'
import { getLedger } from '../../lib/project-helpers'
import './dashboard.css'
import '../ui/ui.css'

const URGENT = new Set(['critical', 'warning'])

export function DashboardView({ records, flatRecords, displayCurrency, money, fromUsd, toUsd, setActivePage }) {
  const ledger = getLedger(records, toUsd)
  const attention = getAttentionItems(records, flatRecords)
  const urgent = attention.filter((item) => URGENT.has(item.priority))
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)

  const counts = [
    ['projects', 'project', (records.projects || []).length],
    ['domains', 'domain', records.domains.length],
    ['servers', 'server', records.servers.length],
    ['repos', 'repo', records.repos.length],
    ['subscriptions', 'subscription', records.subscriptions.length],
  ].filter(([, , count]) => count > 0)

  return (
    <section className="page-content overview-page">
      <Card className="overview-hero">
        <p className="overview-hero-label">You pay each month</p>
        <p className="overview-hero-number">{show(ledger.costMonthlyUsd)}</p>
        <p className="overview-hero-detail">
          {ledger.projectsWithRevenue > 0 ? (
            <>
              Your projects earn {show(ledger.revenueMonthlyUsd)}, so you{' '}
              {ledger.profitMonthlyUsd >= 0
                ? <span className="money-gain">keep {show(ledger.profitMonthlyUsd)}</span>
                : <span className="money-loss">lose {show(-ledger.profitMonthlyUsd)}</span>}
              .
            </>
          ) : (
            'Add monthly revenue to a project to see what you keep.'
          )}{' '}
          <button type="button" className="link-button" onClick={() => setActivePage('insights')}>See what&apos;s due when</button>
        </p>
      </Card>

      <Card className="overview-attention">
        <div className="overview-section-head">
          <h2>{urgent.length ? 'Needs you soon' : 'Nothing urgent'}</h2>
          {attention.length > 0 && (
            <button type="button" className="link-button" onClick={() => setActivePage('attention')}>
              See all {attention.length}
            </button>
          )}
        </div>
        {urgent.length ? (
          <ul className="overview-attention-list">
            {urgent.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" className={`overview-attention-item ${item.priority}`} onClick={() => setActivePage(item.moduleKey)}>
                  <span>
                    <strong>{item.detail}</strong>
                    <small>{item.label} · {item.action}</small>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-status">Nothing is overdue or due within a month.</p>
        )}
      </Card>

      {counts.length > 0 ? (
        <nav className="overview-counts" aria-label="Your lists">
          {counts.map(([page, noun, count]) => (
            <button key={page} type="button" className="link-button" onClick={() => setActivePage(page)}>
              {count} {noun}{count === 1 ? '' : 's'}
            </button>
          ))}
        </nav>
      ) : (
        <EmptyState variant="calm" title="Nothing here yet" text="Add a project to get started." />
      )}
    </section>
  )
}
