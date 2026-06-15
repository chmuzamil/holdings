import { Plus, X } from 'lucide-react'
import {
  emptyProjectRecord,
  projectCategories,
  projectPriorities,
  projectStatuses,
} from '../../lib/project-helpers'

function AssetCheckboxList({ items, selectedIds, onToggle, emptyText }) {
  if (!items.length) {
    return <p className="checkbox-empty">{emptyText}</p>
  }

  return (
    <div className="checkbox-list">
      {items.map((item) => (
        <label key={item.id} className="checkbox-item">
          <input
            type="checkbox"
            checked={selectedIds.includes(item.id)}
            onChange={() => onToggle(item.id)}
          />
          <span>{item.name}</span>
        </label>
      ))}
    </div>
  )
}

export function ProjectRecordModal({ modal, setModal, saveRecord, records }) {
  const values = modal.values || emptyProjectRecord

  function updateField(key, value) {
    setModal((current) => ({
      ...current,
      values: { ...current.values, [key]: value },
    }))
  }

  function toggleId(field, id) {
    const current = values[field] || []
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]
    updateField(field, next)
  }

  return (
    <div className="modal-backdrop" onClick={() => setModal(null)}>
      <form className="modal" onSubmit={saveRecord} onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>{modal.mode === 'create' ? 'Add Project' : 'Edit Project'}</h2>
            <p>Connect domains, repos, servers, and subscriptions into one founder project.</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => setModal(null)}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="project-form-grid">
            <div className="field-group">
              <span>Project name</span>
              <input value={values.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div className="field-group">
              <span>Slug</span>
              <input value={values.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder="founder-os" />
            </div>
            <div className="field-group full-width">
              <span>Description</span>
              <textarea value={values.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
            </div>
            <div className="field-group">
              <span>Status</span>
              <select value={values.status} onChange={(e) => updateField('status', e.target.value)}>
                {projectStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            <div className="field-group">
              <span>Priority</span>
              <select value={values.priority} onChange={(e) => updateField('priority', e.target.value)}>
                {projectPriorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </div>
            <div className="field-group">
              <span>Category</span>
              <select value={values.category} onChange={(e) => updateField('category', e.target.value)}>
                {projectCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <div className="field-group">
              <span>Live URL</span>
              <input value={values.liveUrl} onChange={(e) => updateField('liveUrl', e.target.value)} placeholder="https://" />
            </div>
            <div className="field-group full-width">
              <span>Domains</span>
              <AssetCheckboxList
                items={records.domains}
                selectedIds={values.domainIds || []}
                onToggle={(id) => toggleId('domainIds', id)}
                emptyText="No domains available. Add a domain first."
              />
            </div>
            <div className="field-group full-width">
              <span>Repositories</span>
              <AssetCheckboxList
                items={records.repos}
                selectedIds={values.repoIds || []}
                onToggle={(id) => toggleId('repoIds', id)}
                emptyText="No repositories available. Add a repo first."
              />
            </div>
            <div className="field-group full-width">
              <span>Servers</span>
              <AssetCheckboxList
                items={records.servers}
                selectedIds={values.serverIds || []}
                onToggle={(id) => toggleId('serverIds', id)}
                emptyText="No servers available. Add a server first."
              />
            </div>
            <div className="field-group full-width">
              <span>Subscriptions</span>
              <AssetCheckboxList
                items={records.subscriptions}
                selectedIds={values.subscriptionIds || []}
                onToggle={(id) => toggleId('subscriptionIds', id)}
                emptyText="No subscriptions available."
              />
            </div>
            <div className="field-group full-width">
              <span>Notes</span>
              <textarea value={values.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={() => setModal(null)}>Cancel</button>
          <button type="submit" className="primary-button">
            <Plus size={16} />
            Save Project
          </button>
        </div>
      </form>
    </div>
  )
}
