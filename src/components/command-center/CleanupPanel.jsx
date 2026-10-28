import { Card } from '../ui/Card'

const describe = {
  unused: (item) => ({
    title: item.assets[0].name,
    why: 'Not used by any project.',
    action: 'Link it to the project that needs it, or cancel it.',
  }),
  'archived-only': (item) => ({
    title: item.assets[0].name,
    why: `Only used by archived ${item.projects.length === 1 ? 'project' : 'projects'}: ${item.projects.join(', ')}.`,
    action: 'Cancel it if those projects are really done.',
  }),
  duplicate: (item) => ({
    title: item.assets.map((asset) => asset.name).join(' and '),
    why: `${item.assets.length} subscriptions with ${item.assets[0].provider.trim()}.`,
    action: 'Check whether you need all of them.',
  }),
  'cancelled-but-renews': (item) => ({
    title: item.assets[0].name,
    why: `Marked cancelled, but it still shows a renewal on ${item.assets[0].renewsAt}.`,
    action: 'Make sure it is really cancelled with the provider, then clear the date.',
  }),
}

/**
 * What you may be paying for without needing it. Each line is a question,
 * not a verdict, and "for everything" items can be marked so they stop
 * showing up.
 */
export function CleanupPanel({ cleanup, show, onKeep, keptCount = 0, onShowKept }) {
  if (!cleanup.suggestions.length && !keptCount) return null
  const kept = keptCount > 0 && (
    <p className="cleanup-summary">
      {keptCount === 1 ? '1 item is' : `${keptCount} items are`} marked as for everything and not suggested.{' '}
      <button type="button" className="link-button" onClick={onShowKept}>Show them again</button>
    </p>
  )
  if (!cleanup.suggestions.length) {
    return (
      <Card className="command-panel">
        <h3 className="section-title">Worth a look</h3>
        {kept}
      </Card>
    )
  }
  return (
    <Card className="command-panel">
      <h3 className="section-title">Worth a look</h3>
      <p className="cleanup-summary">
        {cleanup.savingMonthlyUsd > 0
          ? <>You could save up to <strong>{show(cleanup.savingMonthlyUsd)}/mo</strong> if you don&apos;t need these.</>
          : 'A few things to double-check.'}
      </p>
      <ul className="impact-list">
        {cleanup.suggestions.map((item) => {
          const text = describe[item.reason](item)
          const key = `${item.reason}-${item.assets.map((asset) => asset.id).join('-')}`
          return (
            <li key={key}>
              <div className="impact-item cleanup-item">
                <span>
                  <strong>{text.title}</strong>
                  <br />
                  {text.why} {text.action}
                  {item.reason === 'unused' && (
                    <>
                      {' '}
                      <button type="button" className="link-button" onClick={() => onKeep(item.assets[0].id)}>
                        It&apos;s for everything, stop suggesting
                      </button>
                    </>
                  )}
                </span>
                {item.savingMonthlyUsd !== null && <span className="cleanup-saving">{show(item.savingMonthlyUsd)}/mo</span>}
              </div>
            </li>
          )
        })}
      </ul>
      {kept}
    </Card>
  )
}
