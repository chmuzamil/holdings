import { useState } from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import { formatMoney } from '../../lib/currency'
import { productMonthlyUsd } from '../../lib/revenue'

const SOURCES = {
  lemonsqueezy: {
    label: 'Lemon Squeezy',
    fields: [{ name: 'apiKey', label: 'API key', secret: true }],
    help: (
      <>
        In Lemon Squeezy, open <a href="https://app.lemonsqueezy.com/settings/api" target="_blank" rel="noreferrer">Settings → API</a> and
        create an API key (a test-mode key shows test data). Lemon Squeezy keys can&apos;t be limited to reading: Holdings only reads,
        but the key could change your store, for example refund or cancel, so keep your server locked down.
      </>
    ),
  },
  paddle: {
    label: 'Paddle',
    fields: [{ name: 'apiKey', label: 'API key', secret: true }],
    help: (
      <>
        Paddle Billing only, not Paddle Classic. In Paddle, open <a href="https://vendors.paddle.com/authentication-v2" target="_blank" rel="noreferrer">Developer
        tools → Authentication</a> and create an API key with only <strong>subscription.read</strong>, plus <strong>product.read</strong> to
        see products nobody subscribes to yet. A sandbox key (pdl_sdbx_…) reads your sandbox.
      </>
    ),
  },
  custom: {
    label: 'Custom URL',
    option: 'Custom URL (App Store, Google Play, anything else)',
    fields: [
      { name: 'url', label: 'URL', type: 'url', placeholder: 'https://numbers.example/revenue.json' },
      { name: 'token', label: 'Token (optional, sent as a Bearer header)', secret: true, optional: true },
    ],
    help: (
      <>
        A URL that answers with JSON like{' '}
        <code>{'{"products": [{"id": "ios-pro", "name": "Notes Pro (iOS)", "monthlyRevenue": 120.5, "currency": "USD"}]}'}</code>.
        A small script can build it from App Store Connect or Google Play reports, RevenueCat, Gumroad or your own database. The format
        is in docs/self-hosting.md. Only your server reads it.
      </>
    ),
  },
}

/** Revenue from Lemon Squeezy, Paddle or a custom URL (self-hosted only). */
export function RevenueSources({ sources, ratesPerUsd }) {
  const [adding, setAdding] = useState('')
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState('')

  async function run(what, work, done) {
    setBusy(what)
    setMessage({ tone: '', text: '' })
    try {
      await work()
      setMessage({ tone: 'ok', text: done })
      return true
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
      return false
    } finally {
      setBusy('')
    }
  }

  if (!sources.connections) return null
  const ids = Object.keys(SOURCES)
  const connected = ids.filter((id) => sources.connections[id]?.connected)
  const available = ids.filter((id) => !sources.connections[id]?.connected)
  const form = adding && SOURCES[adding]
  const status = message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>More revenue sources</h2>
        <p>
          Revenue from Lemon Squeezy, Paddle, or a URL you control (for App Store, Google Play or anything else), next to
          Stripe. Holdings only reads. Link products to a project when you edit it, and its monthly revenue fills itself in.
        </p>
      </div>

      {connected.map((id) => {
        const report = sources.reports[id]
        return (
          <div key={id} className="revenue-source">
            <div className="checklist">
              <span>{SOURCES[id].label}: connected with a {sources.connections[id].hint}{report?.mode === 'test' && ' (test data)'}</span>
              {report && <span>Checked {new Date(report.checkedAt).toLocaleString()}</span>}
            </div>
            {sources.errors[id] && <p className="auth-error" role="alert">{sources.errors[id]}</p>}
            {report?.products.length > 0 && (
              <ul className="stripe-products">
                {report.products.map((product) => {
                  const usd = productMonthlyUsd(product, ratesPerUsd)
                  return (
                    <li key={product.id}>
                      <span>{product.name}</span>
                      <span className="stripe-products-amount">
                        {usd === null ? 'Getting exchange rate…' : `${formatMoney(usd)}/mo`}
                        {product.subscriptions > 0 && ` · ${product.subscriptions === 1 ? '1 subscription' : `${product.subscriptions} subscriptions`}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {report && !report.products.length && <p className="settings-status">No products found.</p>}
            {report?.skippedItems > 0 && (
              <p className="settings-status">
                {report.skippedItems} {report.skippedItems === 1 ? 'subscription uses' : 'subscriptions use'} usage-based or tiered pricing
                and {report.skippedItems === 1 ? 'isn’t' : 'aren’t'} counted.
              </p>
            )}
            {report?.warnings.map((warning) => <p key={warning} className="settings-status runbook-warning">{warning}</p>)}
            <div className="settings-actions">
              <button className="ghost-button" type="button" disabled={Boolean(busy)} onClick={() => run(`refresh-${id}`, () => sources.refresh(id), `Updated from ${SOURCES[id].label}.`)}>
                <RefreshCw size={16} />
                {busy === `refresh-${id}` ? 'Reading…' : 'Refresh'}
              </button>
              <button className="ghost-button" type="button" disabled={Boolean(busy)} onClick={() => run(`disconnect-${id}`, () => sources.disconnect(id), `Disconnected ${SOURCES[id].label}. Its keys were deleted from your server.`)}>
                <Unplug size={16} />
                Disconnect
              </button>
            </div>
          </div>
        )
      })}
      {connected.length > 0 && <p className="settings-status">Monthly amounts from active subscriptions, before discounts and tax. One-off payments aren&apos;t included.</p>}

      {available.length > 0 && (
        <form
          key={adding}
          className="settings-form account-form registrar-connect"
          onSubmit={(event) => {
            event.preventDefault()
            const id = adding
            const credentials = Object.fromEntries(new FormData(event.currentTarget))
            run('connect', async () => {
              await sources.connect(id, credentials)
              setAdding('')
            }, `Connected ${SOURCES[id].label}. Now link its products to your projects.`)
          }}
        >
          <label>
            <span>{connected.length ? 'Connect another' : 'Connect'}</span>
            <select value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Choose…</option>
              {available.map((id) => <option key={id} value={id}>{SOURCES[id].option ?? SOURCES[id].label}</option>)}
            </select>
          </label>
          {form && (
            <>
              {form.fields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    type={field.secret ? 'password' : field.type ?? 'text'}
                    required={!field.optional}
                    autoComplete="off"
                    spellCheck="false"
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
              <div className="settings-actions notify-actions">
                <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'connect' ? 'Checking…' : 'Connect'}</button>
              </div>
              <p className="settings-status">{form.help} Keys are stored encrypted on your server and never shown again.</p>
            </>
          )}
        </form>
      )}
      {status}
    </div>
  )
}
