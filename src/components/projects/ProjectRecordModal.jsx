import { useId } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../ui/use-dialog'
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

  const titleId = useId()
  const dialogRef = useDialog({ onClose: () => setModal(null), initialFocus: 'input' })

  return (
    <div className="modal-backdrop" onClick={() => setModal(null)}>
      <form
        className="modal"
        onSubmit={saveRecord}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{modal.mode === 'create' ? 'Add project' : 'Edit project'}</h2>
            <p>Everything this project runs on, in one place.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="project-form-grid">
            <label className="field-group">
              <span>Project name</span>
              <input value={values.name} onChange={(e) => updateField('name', e.target.value)} required />
            </label>
            <label className="field-group">
              <span>Slug</span>
              <input value={values.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder="my-project" />
            </label>
            <label className="field-group full-width">
              <span>Description</span>
              <textarea value={values.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
            </label>
            <label className="field-group">
              <span>Status</span>
              <select value={values.status} onChange={(e) => updateField('status', e.target.value)}>
                {projectStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Priority</span>
              <select value={values.priority} onChange={(e) => updateField('priority', e.target.value)}>
                {projectPriorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Category</span>
              <select value={values.category} onChange={(e) => updateField('category', e.target.value)}>
                {projectCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Live URL</span>
              <input value={values.liveUrl} onChange={(e) => updateField('liveUrl', e.target.value)} placeholder="https://" />
            </label>
            <label className="field-group">
              <span>Monthly revenue (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={values.monthlyRevenueUsd ?? ''}
                onChange={(e) => updateField('monthlyRevenueUsd', e.target.value)}
                placeholder="Leave empty if you don't track it"
              />
            </label>
            <fieldset className="field-group full-width form-fieldset">
              <legend>Domains</legend>
              <AssetCheckboxList
                items={records.domains}
                selectedIds={values.domainIds || []}
                onToggle={(id) => toggleId('domainIds', id)}
                emptyText="No domains available. Add a domain first."
              />
            </fieldset>
            <fieldset className="field-group full-width form-fieldset">
              <legend>Repositories</legend>
              <AssetCheckboxList
                items={records.repos}
                selectedIds={values.repoIds || []}
                onToggle={(id) => toggleId('repoIds', id)}
                emptyText="No repositories available. Add a repo first."
              />
            </fieldset>
            <fieldset className="field-group full-width form-fieldset">
              <legend>Servers</legend>
              <AssetCheckboxList
                items={records.servers}
                selectedIds={values.serverIds || []}
                onToggle={(id) => toggleId('serverIds', id)}
                emptyText="No servers available. Add a server first."
              />
            </fieldset>
            <fieldset className="field-group full-width form-fieldset">
              <legend>Subscriptions</legend>
              <AssetCheckboxList
                items={records.subscriptions}
                selectedIds={values.subscriptionIds || []}
                onToggle={(id) => toggleId('subscriptionIds', id)}
                emptyText="No subscriptions available."
              />
            </fieldset>
            <label className="field-group full-width">
              <span>Notes</span>
              <textarea value={values.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={() => setModal(null)}>Cancel</button>
          <button type="submit" className="primary-button">
            {modal.mode === 'create' ? 'Add project' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
