import { useEffect, useMemo, useState } from 'react'
import { BrandMark } from '../shared/BrandMark'
import { api, createSaver, getSession } from '../../lib/server-api'
import { RECORDS_KEY, SETTINGS_KEY } from '../../lib/storage'
import './server.css'

const BACKUP_KEY = 'holdings-local-backup'

function readLocal(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

/**
 * Copies the server's data into this browser's working copy before the app
 * starts. On the first sign-in with an empty server, uploads what this
 * browser already has instead.
 */
async function loadIntoBrowser() {
  const remote = await api('GET', '/api/data')
  const local = { records: readLocal(RECORDS_KEY), settings: readLocal(SETTINGS_KEY) }

  if (!remote.data) {
    const data = Object.fromEntries(Object.entries(local).filter(([, value]) => value))
    const saved = await api('PUT', '/api/data', { version: 0, data })
    return { version: saved.version, data }
  }

  const { records, settings } = remote.data
  const hasLocal = local.records && JSON.stringify(local.records) !== JSON.stringify(records ?? null)
  if (hasLocal) {
    // Keep what this browser had, in case it never reached the server.
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), ...local }))
  }
  if (records) window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
  if (settings) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  return { version: remote.version, data: remote.data }
}

/**
 * Decides how the app runs. Without a server (or in the demo) it renders the
 * app straight away and data stays in this browser. With one, it asks for
 * the login first, then hands the app a saver.
 */
export function ServerGate({ skip, children }) {
  const [phase, setPhase] = useState(skip ? 'local' : 'checking')
  const [session, setSession] = useState(null)
  const [loaded, setLoaded] = useState(null)
  const [syncStatus, setSyncStatus] = useState('saved')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (skip) return
    getSession().then((next) => {
      if (!next) return setPhase('local')
      setSession(next)
      setPhase(next.setupNeeded ? 'setup' : next.authenticated ? 'loading' : 'login')
    })
  }, [skip])

  useEffect(() => {
    if (phase !== 'loading') return
    loadIntoBrowser()
      .then((result) => {
        setLoaded(result)
        setPhase('ready')
      })
      .catch((error) => {
        if (error.status === 401) return setPhase('login')
        setLoadError(error.message)
      })
  }, [phase])

  const server = useMemo(() => {
    if (phase !== 'ready' || !loaded) return null
    const saver = createSaver({ version: loaded.version, saved: loaded.data, onStatus: setSyncStatus })
    return {
      saver,
      async refreshSession() {
        const next = await getSession()
        if (next) setSession(next)
        return next
      },
      async logout() {
        await saver.flush()
        await api('POST', '/api/logout').catch(() => {})
        window.localStorage.removeItem(RECORDS_KEY)
        window.localStorage.removeItem(SETTINGS_KEY)
        window.location.reload()
      },
    }
  }, [phase, loaded])

  // Warn before closing the tab with changes that haven't reached the server.
  useEffect(() => {
    if (!['pending', 'saving'].includes(syncStatus)) return
    const onBeforeUnload = (event) => {
      server?.saver.flush()
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [syncStatus, server])

  if (phase === 'local') return children(null)
  if (phase === 'ready' && server) return children({ ...server, session, syncStatus })
  if (phase === 'setup') return <SetupScreen onDone={() => setPhase('loading')} />
  if (phase === 'login') return <LoginScreen onDone={() => setPhase('loading')} />
  // Usually takes a few milliseconds; a blank page beats a flash of a card.
  if (phase === 'checking') return null

  return (
    <AuthShell title="Holdings">
      {loadError
        ? <p className="auth-error" role="alert">Couldn&apos;t load your data: {loadError} <button type="button" className="link-button" onClick={() => window.location.reload()}>Try again</button></p>
        : <p role="status">Loading…</p>}
    </AuthShell>
  )
}

function AuthShell({ title, intro, children }) {
  return (
    <main className="auth-screen" id="main-content">
      <div className="auth-card">
        <BrandMark size={36} />
        <h1>{title}</h1>
        {intro && <p className="auth-intro">{intro}</p>}
        {children}
      </div>
    </main>
  )
}

function useSubmit(action) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await action(new FormData(event.currentTarget), setError)
    } catch (caught) {
      setError(caught.message)
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, onSubmit, setError }
}

function SetupScreen({ onDone }) {
  const { error, busy, onSubmit } = useSubmit(async (form, setError) => {
    if (form.get('password') !== form.get('confirm')) return setError('The two passwords don’t match.')
    await api('POST', '/api/setup', { setupCode: form.get('setupCode'), password: form.get('password') })
    onDone()
  })

  return (
    <AuthShell
      title="Create your login"
      intro="This server keeps your Holdings data. Only you can open it. Find the setup code in the server's log."
    >
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>Setup code</span>
          <input name="setupCode" required autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="ABCD-EFGH-JKLM" />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" required minLength={12} autoComplete="new-password" aria-describedby="password-hint" />
        </label>
        <p className="auth-hint" id="password-hint">At least 12 characters. A few random words works well.</p>
        <label>
          <span>Password again</span>
          <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create login'}</button>
      </form>
    </AuthShell>
  )
}

function LoginScreen({ onDone }) {
  const [needsCode, setNeedsCode] = useState(false)
  const { error, busy, onSubmit } = useSubmit(async (form) => {
    try {
      await api('POST', '/api/login', { password: form.get('password'), code: form.get('code') || undefined })
      onDone()
    } catch (caught) {
      if (caught.body?.needsCode) setNeedsCode(true)
      // Asking for the code isn't a mistake, so don't show it as one.
      if (caught.body?.needsCode && !form.get('code')) return
      throw caught
    }
  })

  return (
    <AuthShell title="Sign in to Holdings">
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>Password</span>
          <input name="password" type="password" required autoComplete="current-password" autoFocus />
        </label>
        {needsCode && (
          <label>
            <span>Code from your authenticator app</span>
            <input name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" required autoComplete="one-time-code" autoFocus placeholder="123456" />
          </label>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-hint">Forgot your password or lost your phone? See “Locked out?” in the self-hosting guide.</p>
    </AuthShell>
  )
}
