// Visit counts for the public demo only. The Umami tag is added to index.html
// when VITE_UMAMI_WEBSITE_ID and VITE_UMAMI_SCRIPT_URL are set (only in
// .env.demo), so every other build has no tracker and this does nothing.
// Send fixed event names and small fixed details only, never anything typed.

/** Sends a custom event if the tracker is on the page; waits for it to load. */
export function track(name, data) {
  const send = () => window.umami?.track(name, data)
  if (window.umami) return send()
  document.querySelector('script[data-website-id]')?.addEventListener('load', send, { once: true })
}
