import { AlertTriangle, Check, CloudUpload } from 'lucide-react'

const LABELS = {
  saved: { text: 'Saved', icon: Check },
  pending: { text: 'Saving…', icon: CloudUpload },
  saving: { text: 'Saving…', icon: CloudUpload },
  conflict: { text: 'Not saved', icon: AlertTriangle, tone: 'danger' },
  'signed-out': { text: 'Not saved', icon: AlertTriangle, tone: 'danger' },
  error: { text: 'Not saved', icon: AlertTriangle, tone: 'warning' },
}

/** Small "Saved" / "Saving…" note in the top bar when a server is in use. */
export function SyncStatus({ status }) {
  const { text, icon: Icon, tone } = LABELS[status] ?? LABELS.saved
  return (
    <span className="sync-status" data-tone={tone} role="status" aria-live="polite">
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  )
}

/** Explains a failed save and what to do about it. */
export function SyncProblem({ status, onRetry }) {
  const reload = <button type="button" className="link-button" onClick={() => window.location.reload()}>Reload</button>
  const message = {
    conflict: <>Your data was changed in another tab or device, so your latest change here wasn&apos;t saved. {reload} to get the newest copy.</>,
    'signed-out': <>You were signed out, so your latest change wasn&apos;t saved. {reload} and sign in again.</>,
    error: <>Couldn&apos;t reach the server. Your changes are kept in this browser for now. <button type="button" className="link-button" onClick={onRetry}>Try again</button></>,
  }[status]
  if (!message) return null
  return (
    <div className="page-content">
      <p className="rate-warning" role="alert">{message}</p>
    </div>
  )
}
