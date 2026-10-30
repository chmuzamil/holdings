import { useState } from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import { formatMoney } from '../../lib/currency'
import { productMonthlyUsd } from '../../lib/revenue'

const STRIPE_KEYS_URL = 'https://dashboard.stripe.com/apikeys'

export function StripeSettings({ stripe, ratesPerUsd }) {
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState(false)

  async function run(action, done) {
    setBusy(true)
    setMessage({ tone: '', text: '' })
    try {
      await action()
      setMessage({ tone: 'ok', text: done })
      return true
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const products = stripe.revenue?.products ?? []
  const status = message.text && (
    <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>
      {message.text}
    </p>
  )

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Revenue from Stripe</h2>
        <p>
          Show each project&apos;s real monthly revenue. Holdings reads active subscriptions with a read-only key; it can&apos;t
          change anything in Stripe. Link products to a project when you edit it.
        </p>
      </div>

      {stripe.status === 'loading' && <p className="settings-status" role="status">Checking…</p>}

      {(stripe.status === 'disconnected' || (stripe.status === 'error' && !stripe.hint)) && (
        <form
          className="settings-form account-form"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const key = new FormData(form).get('key')
            run(() => stripe.connect(key), 'Connected. Now link products to your projects.').then((ok) => ok && form.reset())
          }}
        >
          <label>
            <span>Restricted key</span>
            <input name="key" type="password" required autoComplete="off" spellCheck="false" placeholder="rk_live_…" />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
          <p className="settings-status">
            In Stripe, open{' '}
            <a href={STRIPE_KEYS_URL} target="_blank" rel="noreferrer">Developers → API keys</a>
            {' '}and create a restricted key with <strong>Read</strong> access to Subscriptions and Products only. It is
            stored encrypted on your server and never shown again.
          </p>
          {status}
        </form>
      )}

      {stripe.hint && (
        <>
          <div className="checklist">
            <span>Connected with a {stripe.hint}</span>
            {stripe.revenue && <span>Checked {new Date(stripe.revenue.checkedAt).toLocaleString()}</span>}
          </div>
          {stripe.status === 'error' && <p className="auth-error" role="alert">{stripe.error}</p>}
          {products.length > 0 && (
            <ul className="stripe-products">
              {products.map((product) => {
                const usd = productMonthlyUsd(product, ratesPerUsd)
                return (
                  <li key={product.id}>
                    <span>{product.name}{!product.active && ' (archived)'}</span>
                    <span className="stripe-products-amount">
                      {usd === null ? 'Getting exchange rate…' : `${formatMoney(usd)}/mo`}
                      {' · '}
                      {product.subscriptions === 1 ? '1 subscription' : `${product.subscriptions} subscriptions`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {stripe.revenue?.skippedItems > 0 && (
            <p className="settings-status">
              {stripe.revenue.skippedItems} subscription {stripe.revenue.skippedItems === 1 ? 'item uses' : 'items use'} metered or tiered
              pricing and {stripe.revenue.skippedItems === 1 ? 'isn’t' : 'aren’t'} counted.
            </p>
          )}
          <p className="settings-status">Monthly amounts from active subscriptions, before discounts and tax. One-off payments aren&apos;t included.</p>
          <div className="settings-actions">
            <button className="ghost-button" type="button" disabled={busy} onClick={() => run(stripe.refresh, 'Updated from Stripe.')}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="ghost-button" type="button" disabled={busy} onClick={() => run(stripe.disconnect, 'Disconnected. The key was deleted from your server.')}>
              <Unplug size={16} />
              Disconnect
            </button>
          </div>
          {status}
        </>
      )}
    </div>
  )
}
