import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { LogOut, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/server-api'
import { AccessTokens } from './AccessTokens'
import { NotificationSettings } from './NotificationSettings'
import { StripeSettings } from './StripeSettings'

/** Renders a QR code as SVG squares (no innerHTML). */
function QrCode({ text, label }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`
      }
    }
    return { size: count + 8, path: d }
  }, [text])

  return (
    <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

function useAction() {
  const [status, setStatus] = useState({ tone: '', text: '' })
  const [busy, setBusy] = useState(false)
  async function run(event, action) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setStatus({ tone: '', text: '' })
    try {
      const text = await action(new FormData(form))
      form.reset()
      setStatus({ tone: 'ok', text })
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }
  return { status, busy, run }
}

function Status({ status }) {
  if (!status.text) return <p className="settings-status" role="status" aria-live="polite" />
  return (
    <p className={status.tone === 'error' ? 'auth-error' : 'settings-status'} role={status.tone === 'error' ? 'alert' : 'status'}>
      {status.text}
    </p>
  )
}

export function AccountSettings({ server, stripe, ratesPerUsd }) {
  const totpEnabled = Boolean(server.session?.totpEnabled)

  return (
    <>
      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>Your login</h2>
          <p>You are signed in to your own Holdings server. Your data is saved there, so it follows you to other browsers.</p>
        </div>
        <div className="checklist">
          <span><ShieldCheck size={16} /> Two-step login is {totpEnabled ? 'on' : 'off'}</span>
        </div>
        <div className="settings-actions">
          <button className="ghost-button" type="button" onClick={server.logout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
      <TwoStepSettings server={server} enabled={totpEnabled} />
      <PasswordSettings totpEnabled={totpEnabled} />
      <NotificationSettings />
      <StripeSettings stripe={stripe} ratesPerUsd={ratesPerUsd} />
      <AccessTokens />
    </>
  )
}

function TwoStepSettings({ server, enabled }) {
  const [pending, setPending] = useState(null)
  const { status, busy, run } = useAction()

  if (enabled) {
    return (
      <div className="panel settings-wide">
        <div className="panel-heading">
          <h2>Two-step login</h2>
          <p>Signing in needs your password and a code from your authenticator app. To turn it off, confirm both.</p>
        </div>
        <form
          className="settings-form account-form"
          onSubmit={(event) => run(event, async (form) => {
            await api('POST', '/api/totp/disable', { password: form.get('password'), code: form.get('code') })
            await server.refreshSession()
            return 'Two-step login is off.'
          })}
        >
          <label>
            <span>Password</span>
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <label>
            <span>Code</span>
            <input name="code" inputMode="numeric" required autoComplete="one-time-code" placeholder="123456" />
          </label>
          <button className="danger-button" type="submit" disabled={busy}>Turn off</button>
          <Status status={status} />
        </form>
      </div>
    )
  }

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Two-step login</h2>
        <p>Add a 6-digit code from an authenticator app (1Password, Bitwarden, Aegis, Google Authenticator) to your password. Recommended if this server is on the internet.</p>
      </div>
      {!pending ? (
        <form
          className="settings-form account-form"
          onSubmit={(event) => run(event, async (form) => {
            setPending(await api('POST', '/api/totp/setup', { password: form.get('password') }))
            return ''
          })}
        >
          <label>
            <span>Confirm your password</span>
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>Set up</button>
          <Status status={status} />
        </form>
      ) : (
        <div className="totp-setup">
          <QrCode text={pending.uri} label="QR code for your authenticator app" />
          <div>
            <p>1. Scan this code with your authenticator app. Can&apos;t scan? Enter this key instead:</p>
            <code className="totp-secret">{pending.secret.match(/.{1,4}/g).join(' ')}</code>
            <form
              className="auth-form"
              onSubmit={(event) => run(event, async (form) => {
                await api('POST', '/api/totp/enable', { code: form.get('code') })
                setPending(null)
                await server.refreshSession()
                return 'Two-step login is on. Other devices were signed out.'
              })}
            >
              <label>
                <span>2. Enter the code the app shows</span>
                <input name="code" inputMode="numeric" required autoComplete="one-time-code" placeholder="123456" />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>Turn on</button>
            </form>
            <Status status={status} />
          </div>
        </div>
      )}
    </div>
  )
}

function PasswordSettings({ totpEnabled }) {
  const { status, busy, run } = useAction()
  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Change password</h2>
        <p>Other devices are signed out when you change it.</p>
      </div>
      <form
        className="settings-form account-form"
        onSubmit={(event) => run(event, async (form) => {
          if (form.get('newPassword') !== form.get('confirm')) throw new Error('The two new passwords don’t match.')
          await api('POST', '/api/password', {
            currentPassword: form.get('currentPassword'),
            newPassword: form.get('newPassword'),
            code: form.get('code') || undefined,
          })
          return 'Password changed.'
        })}
      >
        <label>
          <span>Current password</span>
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label>
          <span>New password</span>
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <label>
          <span>New password again</span>
          <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        {totpEnabled && (
          <label>
            <span>Code</span>
            <input name="code" inputMode="numeric" required autoComplete="one-time-code" placeholder="123456" />
          </label>
        )}
        <button className="primary-button" type="submit" disabled={busy}>Change password</button>
        <Status status={status} />
      </form>
    </div>
  )
}
