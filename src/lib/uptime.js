// Uptime Kuma / Gatus monitors linked to Holdings items (self-hosted only).

/** Holdings item id → the monitor linked to it. */
export function statusByItem(monitors = [], links = {}) {
  const byKey = new Map(monitors.map((monitor) => [monitor.key, monitor]))
  return Object.fromEntries(Object.entries(links)
    .map(([key, itemId]) => [itemId, byKey.get(key)])
    .filter(([, monitor]) => monitor))
}

/**
 * Monitors whose name matches an item's name (ignoring case) and that
 * aren't linked yet: Holdings links these for you.
 */
export function suggestLinks(monitors, items, links = {}) {
  const byName = new Map(items.map((item) => [String(item.name).trim().toLowerCase(), item.id]))
  return Object.fromEntries(monitors
    .filter((monitor) => !links[monitor.key])
    .map((monitor) => [monitor.key, byName.get(monitor.name.trim().toLowerCase())])
    .filter(([, id]) => id))
}
