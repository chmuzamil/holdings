import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getAllAssets, getImpact, getRiskiestItems } from '../../lib/project-helpers'
import './command-center.css'

const KIND_GROUPS = [
  ['server', 'Servers'],
  ['domain', 'Domains'],
  ['card', 'Payment cards'],
  ['credential', 'Keys and tokens'],
  ['certificate', 'Certificates'],
  ['subscription', 'Subscriptions'],
  ['account', 'Accounts'],
  ['repo', 'Repos'],
]

const RELATION = {
  points_to: 'points to',
  deploys_to: 'deploys to',
  paid_with: 'is paid with',
  depends_on: 'depends on',
}

const KIND_NOUN = {
  server: 'server',
  domain: 'domain',
  repo: 'repo',
  subscription: 'subscription',
  account: 'account',
  card: 'card',
  credential: 'key',
  certificate: 'certificate',
}

// "shop.example points to Main VPS" or, for longer chains,
// "app.example points to Proxy, which depends on Main VPS".
function explain(path, stopped, nameOf) {
  return path
    .map((step, index) => {
      const target = index + 1 < path.length ? nameOf(path[index + 1].assetId) : stopped.name
      return `${index === 0 ? '' : 'which '}${RELATION[step.relation] || 'depends on'} ${target}`
    })
    .join(', ')
}

export function ImpactView({ records, toUsd, money, fromUsd, displayCurrency, selectedId, onSelect, setActivePage }) {
  const show = (usd) => money(fromUsd(usd, displayCurrency), displayCurrency)
  const assets = getAllAssets(records, toUsd)
  const ranked = getRiskiestItems(records, toUsd)
  const currentId = selectedId && assets.some((asset) => asset.id === selectedId) ? selectedId : ranked[0]?.stopped.id
  const impact = getImpact(records, toUsd, currentId)
  const nameOf = (id) => assets.find((asset) => asset.id === id)?.name ?? id

  if (!assets.length) {
    return (
      <section className="page-content">
        <EmptyState variant="calm" title="Nothing to check yet" text="Add a server or domain and link it to a project." />
      </section>
    )
  }

  return (
    <section className="page-content cc-page impact-page">
      <Card className="command-panel">
        <label className="impact-picker">
          <span>If this stops…</span>
          <select value={currentId || ''} onChange={(event) => onSelect(event.target.value)}>
            {!currentId && <option value="">Choose something</option>}
            {KIND_GROUPS.map(([kind, label]) => {
              const items = assets.filter((asset) => asset.kind === kind)
              return items.length ? (
                <optgroup key={kind} label={label}>
                  {items.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </optgroup>
              ) : null
            })}
          </select>
        </label>

        {impact && (
          <p className="impact-summary" role="status" aria-live="polite">
            {impact.affectedProjects.length === 0 && impact.affectedAssets.length === 0 && impact.affectedSubdomains.length === 0 ? (
              <>Nothing else uses <strong>{impact.stopped.name}</strong>. If it stops, no project is affected.</>
            ) : impact.affectedProjects.length === 0 ? (
              <>
                If <strong>{impact.stopped.name}</strong> stops, no project is affected
                {impact.affectedSubdomains.length > 0 && (
                  <>, but {impact.affectedSubdomains.map((item) => `${item.subdomain}.${item.asset.name}`).join(', ')} stop{impact.affectedSubdomains.length === 1 ? 's' : ''} working</>
                )}
                .
              </>
            ) : (
              <>
                If <strong>{impact.stopped.name}</strong> stops,{' '}
                <strong>{impact.affectedProjects.length} project{impact.affectedProjects.length === 1 ? '' : 's'}</strong>{' '}
                {impact.affectedProjects.length === 1 ? 'is' : 'are'} affected
                {impact.revenueAtRiskUsd > 0 && <>, earning <strong className="money-loss">{show(impact.revenueAtRiskUsd)}/mo</strong> between them</>}
                .
                {impact.projectsWithUnknownRevenue > 0 && (
                  <> {impact.projectsWithUnknownRevenue} of them {impact.projectsWithUnknownRevenue === 1 ? "doesn't" : "don't"} track revenue, so the real figure may be higher.</>
                )}
              </>
            )}
          </p>
        )}
      </Card>

      {impact && impact.affectedProjects.length > 0 && (
        <Card className="command-panel">
          <h2 className="section-title">Projects affected</h2>
          <ul className="impact-list">
            {impact.affectedProjects.map(({ project, through }) => (
              <li key={project.id}>
                <button type="button" className="impact-item" onClick={() => setActivePage('projects')}>
                  <span>
                    <strong>{project.name}</strong>
                    <small>Uses {through.map((asset) => asset.name).join(', ')}</small>
                  </span>
                  <span className="impact-amount">
                    {project.monthlyRevenueUsd === null ? 'Revenue not tracked' : `${show(project.monthlyRevenueUsd)}/mo`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {impact && impact.affectedAssets.length > 0 && (
        <Card className="command-panel">
          <h2 className="section-title">What stops with it</h2>
          <ul className="impact-list">
            {impact.affectedAssets.map(({ asset, path }) => (
              <li key={asset.id} className="impact-item static">
                <span>
                  <strong>{asset.name}</strong>
                  <small>The {KIND_NOUN[asset.kind] || 'item'} {explain(path, impact.stopped, nameOf)}</small>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {impact && impact.affectedSubdomains.length > 0 && (
        <Card className="command-panel">
          <h2 className="section-title">Subdomains that stop</h2>
          <ul className="impact-list">
            {impact.affectedSubdomains.map(({ asset, subdomain, pointsTo }) => (
              <li key={`${asset.id}-${subdomain}`} className="impact-item static">
                <span>
                  <strong>{subdomain}.{asset.name}</strong>
                  <small>Points to {pointsTo.name}. The rest of {asset.name} keeps working.</small>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ranked.length > 0 && (
        <Card className="command-panel">
          <h2 className="section-title">What the most revenue depends on</h2>
          <ol className="impact-list impact-ranked">
            {ranked.slice(0, 5).map((item) => (
              <li key={item.stopped.id}>
                <button
                  type="button"
                  className="impact-item"
                  aria-current={item.stopped.id === currentId ? 'true' : undefined}
                  onClick={() => onSelect(item.stopped.id)}
                >
                  <span>
                    <strong>{item.stopped.name}</strong>
                    <small>
                      {item.affectedProjects.length} project{item.affectedProjects.length === 1 ? '' : 's'}
                      {item.affectedAssets.length > 0 && `, ${item.affectedAssets.length} other item${item.affectedAssets.length === 1 ? '' : 's'}`}
                      {item.affectedSubdomains.length > 0 && `, ${item.affectedSubdomains.length} subdomain${item.affectedSubdomains.length === 1 ? '' : 's'}`}
                    </small>
                  </span>
                  <span className="impact-amount">{item.revenueAtRiskUsd > 0 ? `${show(item.revenueAtRiskUsd)}/mo affected` : ''}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  )
}
