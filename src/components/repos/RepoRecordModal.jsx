import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  emptyRepoRecord,
  repoDevStatuses,
  repoProjectTags,
  repoCategories,
  repoVisibilities,
} from '../../lib/repo-helpers'

function TagInput({ tags, onChange, placeholder }) {
  const [draft, setDraft] = useState('')

  function addTag(value) {
    const next = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !tags.includes(item))
    if (next.length) onChange([...tags, ...next])
    setDraft('')
  }

  return (
    <div className="repo-tag-input">
      {tags.map((tag) => (
        <BadgeChip key={tag} label={tag} onRemove={() => onChange(tags.filter((item) => item !== tag))} />
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addTag(draft)
          }
        }}
        onBlur={() => draft && addTag(draft)}
      />
    </div>
  )
}

function BadgeChip({ label, onRemove }) {
  return (
    <span className="repo-tech-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label}
      <button type="button" onClick={onRemove} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}>
        <X size={12} />
      </button>
    </span>
  )
}

export function RepoRecordModal({ modal, setModal, saveRecord }) {
  const values = { ...emptyRepoRecord, ...modal.values }

  function update(key, value) {
    setModal((current) => ({
      ...current,
      values: { ...current.values, [key]: value },
    }))
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={saveRecord}>
        <div className="modal-heading">
          <div>
            <h2>{modal.mode === 'create' ? 'Add' : 'Edit'} Repository</h2>
            <p>Track repositories, project status, tech stack, and connected assets.</p>
          </div>
          <button type="button" onClick={() => setModal(null)}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="repo-form-grid">
            <label>
              <span>Project name</span>
              <input value={values.name} onChange={(e) => update('name', e.target.value)} placeholder="Founder OS" required />
            </label>
            <label>
              <span>GitHub slug</span>
              <input value={values.githubName} onChange={(e) => update('githubName', e.target.value)} placeholder="founder-os" />
            </label>
            <label>
              <span>Owner / org</span>
              <input value={values.owner} onChange={(e) => update('owner', e.target.value)} />
            </label>
            <label className="full-span">
              <span>Description</span>
              <textarea value={values.description} onChange={(e) => update('description', e.target.value)} rows={3} />
            </label>
            <label className="full-span">
              <span>GitHub URL</span>
              <input value={values.url} onChange={(e) => update('url', e.target.value)} placeholder="https://github.com/owner/repo" />
            </label>
            <label>
              <span>Visibility</span>
              <select value={values.visibility} onChange={(e) => update('visibility', e.target.value)}>
                {repoVisibilities.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select value={values.category} onChange={(e) => update('category', e.target.value)}>
                {repoCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Development status</span>
              <select value={values.devStatus} onChange={(e) => update('devStatus', e.target.value)}>
                {repoDevStatuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Primary language</span>
              <input value={values.language} onChange={(e) => update('language', e.target.value)} placeholder="TypeScript" />
            </label>
            <label className="full-span">
              <span>Tech stack</span>
              <TagInput
                tags={values.techStack || []}
                onChange={(techStack) => update('techStack', techStack)}
                placeholder="React, Next.js, Supabase"
              />
            </label>
            <label className="full-span">
              <span>Project tags</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {repoProjectTags.map((tag) => (
                  <label key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={(values.projectTags || []).includes(tag)}
                      onChange={(e) => {
                        const current = values.projectTags || []
                        update(
                          'projectTags',
                          e.target.checked ? [...current, tag] : current.filter((item) => item !== tag),
                        )
                      }}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </label>
            <label><span>Stars</span><input type="number" min="0" value={values.stars} onChange={(e) => update('stars', e.target.value)} /></label>
            <label><span>Forks</span><input type="number" min="0" value={values.forks} onChange={(e) => update('forks', e.target.value)} /></label>
            <label><span>Open issues</span><input type="number" min="0" value={values.openIssues} onChange={(e) => update('openIssues', e.target.value)} /></label>
            <label><span>Watchers</span><input type="number" min="0" value={values.watchers} onChange={(e) => update('watchers', e.target.value)} /></label>
            <label><span>Created</span><input type="date" value={values.createdAt} onChange={(e) => update('createdAt', e.target.value)} /></label>
            <label><span>Last updated</span><input type="date" value={values.updatedAt} onChange={(e) => update('updatedAt', e.target.value)} /></label>
            <label><span>Last commit</span><input type="date" value={values.lastCommitAt} onChange={(e) => update('lastCommitAt', e.target.value)} /></label>
            <label><span>Connected domain</span><input value={values.connectedDomain} onChange={(e) => update('connectedDomain', e.target.value)} /></label>
            <label><span>Deployment</span><input value={values.deployment} onChange={(e) => update('deployment', e.target.value)} placeholder="Vercel" /></label>
            <label><span>Database</span><input value={values.database} onChange={(e) => update('database', e.target.value)} placeholder="Supabase" /></label>
            <label><span>Live URL</span><input value={values.liveUrl} onChange={(e) => update('liveUrl', e.target.value)} /></label>
            <label><span>Docs URL</span><input value={values.docsUrl} onChange={(e) => update('docsUrl', e.target.value)} /></label>
            <label className="full-span">
              <span>Notes</span>
              <textarea value={values.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setModal(null)}>Cancel</button>
          <button className="primary-button" type="submit">
            <Plus size={16} />
            Save repository
          </button>
        </div>
      </form>
    </div>
  )
}
