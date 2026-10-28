import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/server-api'
import { statusByItem } from '../../lib/uptime'

const REFRESH_MS = 60_000

/** Item id → linked monitor, for UptimeBadge. Empty without a server. */
export const UptimeContext = createContext({})

/** Uptime status from the self-hosted server, refreshed every minute while Holdings is open. */
export function useUptime(server) {
  const hasServer = Boolean(server)
  const [state, setState] = useState({ settings: null, monitors: [], error: '', checkedAt: null })

  const load = useCallback(() => api('GET', '/api/uptime').then(setState).catch(() => {}), [])

  useEffect(() => {
    if (!hasServer) return
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [hasServer, load])

  const save = useCallback(async (input) => {
    const next = await api('PUT', '/api/uptime', input)
    setState(next)
    return next
  }, [])

  const byItem = useMemo(
    () => (state.settings?.enabled ? statusByItem(state.monitors, state.settings.links) : {}),
    [state],
  )
  return { ...state, byItem, save, reload: load }
}
