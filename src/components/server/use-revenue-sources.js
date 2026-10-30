import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/server-api'

/**
 * Revenue from Lemon Squeezy, Paddle and custom URLs on the self-hosted
 * server. `connections` is null until loaded; `reports` holds each source's
 * latest revenue, and `errors` what went wrong reading it.
 */
export function useRevenueSources(server) {
  const hasServer = Boolean(server)
  const [connections, setConnections] = useState(null)
  const [reports, setReports] = useState({})
  const [errors, setErrors] = useState({})

  const load = useCallback(async (id, refresh = false) => {
    try {
      const report = await api('GET', `/api/revenue/source?source=${id}${refresh ? '&refresh=1' : ''}`)
      setReports((current) => ({ ...current, [id]: report }))
      setErrors((current) => ({ ...current, [id]: '' }))
    } catch (error) {
      setErrors((current) => ({ ...current, [id]: error.message }))
      if (refresh) throw error
    }
  }, [])

  useEffect(() => {
    if (!hasServer) return
    let cancelled = false
    api('GET', '/api/integrations/revenue')
      .then((result) => {
        if (cancelled) return
        setConnections(result)
        Object.entries(result).filter(([, connection]) => connection.connected).forEach(([id]) => load(id))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasServer, load])

  const connect = useCallback(async (id, credentials) => {
    const result = await api('PUT', '/api/integrations/revenue', { source: id, credentials })
    setConnections((current) => ({ ...current, [id]: { connected: true, hint: result.hint } }))
    setReports((current) => ({ ...current, [id]: result.revenue }))
    setErrors((current) => ({ ...current, [id]: '' }))
  }, [])

  const disconnect = useCallback(async (id) => {
    await api('DELETE', `/api/integrations/revenue?source=${id}`)
    setConnections((current) => ({ ...current, [id]: { connected: false } }))
    setReports(({ [id]: _removed, ...rest }) => rest)
  }, [])

  return { connections, reports, errors, connect, disconnect, refresh: (id) => load(id, true) }
}
