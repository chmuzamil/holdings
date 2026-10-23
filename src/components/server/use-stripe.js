import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/server-api'

const noop = () => {}

/**
 * Stripe connection and revenue from the self-hosted server.
 * status: 'off' (no server) | 'loading' | 'disconnected' | 'connected' | 'error'
 */
export function useStripe(server, onRevenue = noop) {
  // The server object changes with every save; only whether there is one matters here.
  const hasServer = Boolean(server)
  const [state, setState] = useState({ status: hasServer ? 'loading' : 'off', hint: '', revenue: null, error: '' })

  const loadRevenue = useCallback(async (refresh = false) => {
    try {
      const revenue = await api('GET', `/api/revenue/stripe${refresh ? '?refresh=1' : ''}`)
      setState((current) => ({ ...current, status: 'connected', revenue, error: '' }))
      onRevenue(revenue)
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: error.message }))
      if (refresh) throw error
    }
  }, [onRevenue])

  useEffect(() => {
    if (!hasServer) return
    let cancelled = false
    api('GET', '/api/integrations/stripe')
      .then((connection) => {
        if (cancelled) return
        if (!connection.connected) return setState({ status: 'disconnected', hint: '', revenue: null, error: '' })
        setState((current) => ({ ...current, hint: connection.hint }))
        return loadRevenue()
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, status: 'error', error: error.message }))
      })
    return () => {
      cancelled = true
    }
  }, [hasServer, loadRevenue])

  const connect = useCallback(async (key) => {
    const result = await api('PUT', '/api/integrations/stripe', { key })
    setState({ status: 'connected', hint: result.hint, revenue: result.revenue, error: '' })
    onRevenue(result.revenue)
  }, [onRevenue])

  const disconnect = useCallback(async () => {
    await api('DELETE', '/api/integrations/stripe')
    setState({ status: 'disconnected', hint: '', revenue: null, error: '' })
  }, [])

  return { ...state, connect, disconnect, refresh: () => loadRevenue(true) }
}
