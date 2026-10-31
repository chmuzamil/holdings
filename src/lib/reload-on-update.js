// After Holdings is updated, a tab opened before the update asks for code
// files that no longer exist, and the page goes blank. Vite reports this as
// a "vite:preloadError" event; reloading once loads the new version. If a
// reload happened moments ago, the error is left to show, so it never loops.

const KEY = 'holdings-reloaded-at'
const WINDOW_MS = 30_000

export function handlePreloadError(event, { storage = window.sessionStorage, reload = () => window.location.reload(), now = Date.now() } = {}) {
  let last = 0
  try {
    last = Number(storage.getItem(KEY)) || 0
  } catch {
    // Storage can be blocked; reloading once is still right.
  }
  if (now - last < WINDOW_MS) return false
  try {
    storage.setItem(KEY, String(now))
  } catch {
    // Without storage there is no loop guard, so don't reload.
    return false
  }
  event.preventDefault()
  reload()
  return true
}
