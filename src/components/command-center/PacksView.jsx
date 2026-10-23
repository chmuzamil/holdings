import { useMemo, useState } from 'react'
import { Download, Lock, Printer } from 'lucide-react'
import { buildExitPack, buildHandover, exitPackMarkdown, handoverHtml } from '@holdings/core'
import { Card } from '../ui/Card'
import { EmptyState } from '../EmptyState'
import { getHoldingsData } from '../../lib/project-helpers'
import { MIN_PASSPHRASE_LENGTH, encryptHandover, handoverFileHtml } from '../../lib/handover-file'
import { findSecret } from '../../lib/secrets'
import './command-center.css'

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
const today = () => new Date().toLocaleDateString('en-CA')

function ExitPackCard({ data }) {
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? '')
  const pack = useMemo(() => (projectId ? buildExitPack(data, projectId) : null), [data, projectId])
  const markdown = pack ? exitPackMarkdown(pack) : ''

  function print() {
    const view = window.open('', '_blank')
    if (!view) return
    const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
    view.document.write(`<!doctype html><title>${pack.project.name.replace(/</g, '&lt;')} exit pack</title><pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;max-width:760px;margin:32px auto">${escaped}</pre>`)
    view.document.close()
    view.print()
  }

  return (
    <Card className="command-panel">
      <h2 className="section-title">Exit pack</h2>
      <p className="settings-status">
        Selling a project? This lists everything that goes with it, what it costs and earns, what renews soon, and a
        transfer checklist for each item, like the lists Acquire.com or Microns ask sellers for. No secrets are included.
      </p>
      {data.projects.length ? (
        <>
          <div className="pack-controls">
            <label className="impact-picker">
              <span>Project</span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <div className="pack-actions">
              <button type="button" className="primary-button" onClick={() => download(`${slug(pack.project.name)}-exit-pack-${today()}.md`, markdown, 'text/markdown')}>
                <Download size={16} aria-hidden="true" /> Download (Markdown)
              </button>
              <button type="button" className="ghost-button" onClick={() => download(`${slug(pack.project.name)}-exit-pack-${today()}.json`, JSON.stringify(pack, null, 2), 'application/json')}>
                Data (JSON)
              </button>
              <button type="button" className="ghost-button" onClick={print}>
                <Printer size={16} aria-hidden="true" /> Print
              </button>
            </div>
          </div>
          <pre className="pack-preview" tabIndex={0} aria-label="Exit pack preview">{markdown}</pre>
        </>
      ) : (
        <EmptyState variant="calm" title="No projects yet" text="Add a project to make an exit pack." />
      )}
    </Card>
  )
}

function HandoverCard({ data, handover, setHandover }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState(false)
  const doc = useMemo(() => buildHandover(data, handover), [data, handover])
  const update = (key) => (event) => setHandover({ ...handover, [key]: event.target.value })

  async function create(event) {
    event.preventDefault()
    const secret = findSecret(handover.message)
    if (secret) {
      setStatus(`Your note looks like it contains a ${secret}. Say where it is kept instead.`)
      return
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setStatus(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words work well.`)
      return
    }
    if (passphrase !== confirm) {
      setStatus('The two passphrases are different.')
      return
    }
    setStatus('Locking the file…')
    try {
      const payload = await encryptHandover(handoverHtml(doc), passphrase)
      download(`handover-${today()}.html`, handoverFileHtml(payload, { owner: handover.owner }), 'text/html')
      setPassphrase('')
      setConfirm('')
      setStatus('Done. Give the file and the passphrase to them separately, for example the file by email and the passphrase in person.')
    } catch (error) {
      setStatus(`Couldn't create the file: ${error.message}`)
    }
  }

  return (
    <Card className="command-panel">
      <h2 className="section-title">Handover pack</h2>
      <p className="settings-status">
        If you were suddenly unavailable, could someone you trust keep things running? This makes a locked file for them:
        what is due soon, what each project runs on, where keys and logins are kept, and which card pays for what. It never
        contains passwords or keys. They open it in any browser with the passphrase; nothing is uploaded anywhere.
      </p>
      <form className="handover-form" onSubmit={create}>
        <label>
          <span>Your name</span>
          <input value={handover.owner} onChange={update('owner')} autoComplete="name" />
        </label>
        <label>
          <span>Who it is for</span>
          <input value={handover.recipient} onChange={update('recipient')} />
        </label>
        <label className="full-span">
          <span>A note to them</span>
          <textarea
            rows={4}
            value={handover.message}
            onChange={update('message')}
            placeholder="Who to call first, where the password manager's emergency kit is, what you would want done."
          />
        </label>
        <label>
          <span>Passphrase</span>
          <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" />
        </label>
        <label>
          <span>Passphrase again</span>
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        </label>
        <div className="pack-actions full-span">
          <button type="submit" className="primary-button">
            <Lock size={16} aria-hidden="true" /> Download locked file
          </button>
          <button type="button" className="ghost-button" aria-expanded={preview} onClick={() => setPreview((value) => !value)}>
            {preview ? 'Hide preview' : 'Preview what is inside'}
          </button>
        </div>
        <p className="settings-status full-span" role="status" aria-live="polite">{status}</p>
      </form>
      {preview && (
        <div className="pack-preview handover-preview" tabIndex={0} aria-label="Handover preview">
          <h3>{doc.title}</h3>
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h4>{section.heading}</h4>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items.length > 0 && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>
      )}
      <p className="settings-status">
        Holdings doesn&apos;t keep the passphrase, so it can&apos;t be recovered. Make a new file whenever things change.
      </p>
    </Card>
  )
}

export function PacksView({ records, toUsd, handover, setHandover }) {
  const data = getHoldingsData(records, toUsd)
  return (
    <section className="page-content cc-page packs-page">
      <ExitPackCard data={data} />
      <HandoverCard data={data} handover={handover} setHandover={setHandover} />
    </section>
  )
}
