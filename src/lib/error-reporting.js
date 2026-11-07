import { createErrorReporter } from '@holdings/core'

// Optional: sends errors in the browser to Sentry or GlitchTip when the build
// has VITE_SENTRY_DSN. Without it this does nothing. Events carry only the
// error, its stack and the version; see packages/core/src/error-report.ts.

/** Starts reporting uncaught errors; returns false when it is off. */
export function startErrorReporting(env = import.meta.env, target = window) {
  const report = createErrorReporter({
    dsn: env.VITE_SENTRY_DSN ?? '',
    release: `holdings@${env.VITE_APP_VERSION}`,
    environment: env.VITE_SENTRY_ENVIRONMENT || (env.VITE_DEMO === 'true' ? 'demo' : 'production'),
    platform: 'javascript',
    send: (url, body) => fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' }),
  })
  if (!report) return false
  // Errors from scripts on other origins (browser extensions) have no details; skip them.
  target.addEventListener('error', (event) => {
    if (event.error) report(event.error)
  })
  target.addEventListener('unhandledrejection', (event) => report(event.reason))
  return true
}
