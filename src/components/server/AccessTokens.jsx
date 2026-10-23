import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { api } from '../../lib/server-api'

const when = (value) => (value ? new Date(value).toLocaleString() : 'never')

/** Read-only tokens for the MCP server (docs/mcp.md). */
export function AccessTokens() {
  const [tokens, setTokens] = useState(null)
  const [created, setCreated] = useState(null)
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api('GET', '/api/tokens')
      .then((result) => setTokens(result.tokens))
      .catch((error) => setMessage({ tone: 'error', text: error.message }))
  }, [])

  async function create(event) {
    event.preventDefault()
    const form = event.currentTarget
    setMessage({ tone: '', text: '' })
    try {
      const token = await api('POST', '/api/tokens', { name: new FormData(form).get('name') })
      setCreated(token)
      setCopied(false)
      setTokens((current) => [...(current ?? []), { id: token.id, name: token.name, createdAt: new Date().toISOString(), lastUsedAt: null }])
      form.reset()
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    }
  }

  async function remove(token) {
    if (!window.confirm(`Delete "${token.name}"? Agents using it lose access straight away.`)) return
    try {
      await api('DELETE', '/api/tokens', { id: token.id })
      setTokens((current) => current.filter((item) => item.id !== token.id))
      if (created?.id === token.id) setCreated(null)
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    }
  }

  const command = created
    && `claude mcp add holdings -e HOLDINGS_TOKEN=${created.token} -- node /path/to/holdings/packages/mcp/dist/holdings-mcp.js --url ${window.location.origin}`

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Access tokens for AI agents</h2>
        <p>
          Let Claude, Cursor or another agent read your Holdings data through the MCP server. A token can only read; it
          can&apos;t change anything or see your login settings. Setup is in docs/mcp.md.
        </p>
      </div>

      <form className="settings-form account-form" onSubmit={create}>
        <label>
          <span>Name</span>
          <input name="name" required maxLength={60} placeholder="Claude on my laptop" autoComplete="off" />
        </label>
        <button className="primary-button" type="submit">Create token</button>
      </form>

      {created && (
        <div className="token-created" role="status">
          <p><strong>Copy this token now.</strong> It won&apos;t be shown again.</p>
          <code className="totp-secret">{created.token}</code>
          <p>For Claude Code, run this (change the path to where Holdings is):</p>
          <code className="token-command">{command}</code>
          <div className="settings-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => navigator.clipboard?.writeText(created.token).then(() => setCopied(true), () => {})}
            >
              <Copy size={16} />
              {copied ? 'Copied' : 'Copy token'}
            </button>
          </div>
        </div>
      )}

      {tokens?.length > 0 && (
        <ul className="stripe-products">
          {tokens.map((token) => (
            <li key={token.id}>
              <span>{token.name}</span>
              <span className="stripe-products-amount">
                Created {when(token.createdAt)} · last used {when(token.lastUsedAt)}
                {' '}
                <button className="link-button" type="button" onClick={() => remove(token)} aria-label={`Delete token ${token.name}`}>
                  <Trash2 size={14} aria-hidden="true" /> Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {message.text && <p className="auth-error" role="alert">{message.text}</p>}
    </div>
  )
}
