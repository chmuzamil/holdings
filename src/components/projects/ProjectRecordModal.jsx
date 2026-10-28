import { useId } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../ui/use-dialog'
import {
  emptyProjectRecord,
  projectCategories,
  projectPriorities,
  projectStages,
} from '../../lib/project-helpers'
import { formatMoney } from '../../lib/currency'
import { productMonthlyUsd, projectStripeRevenueUsd } from '../../lib/stripe-revenue'

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

export function ProjectRecordModal({ modal, setModal, saveRecord, records, stripeProducts = null, ratesPerUsd = {} }) {
  const values = modal.values || emptyProjectRecord
  const linkedToStripe = Boolean(stripeProducts && values.stripeProductIds?.length)
  const stripeRevenueUsd = linkedToStripe ? projectStripeRevenueUsd(values, { products: stripeProducts }, ratesPerUsd) : null

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
            <label className="field-group full-width">
              <span>If I&apos;m unavailable, do this (optional, Markdown)</span>
              <textarea
                value={values.runbook || ''}
                onChange={(e) => updateField('runbook', e.target.value)}
                rows={4}
                aria-describedby="project-runbook-warning"
                placeholder={'1. Keep the server paid\n2. Tell customers at [the status page](https://status.example)'}
              />
              <small id="project-runbook-warning" className="field-hint runbook-warning">Never put passwords, keys or card numbers here: say where they are kept instead. Holdings refuses to save anything that looks like one. It goes into the handover and exit packs.</small>
            </label>
            <label className="field-group">
              <span>Stage</span>
              <select value={values.stage || 'idea'} onChange={(e) => updateField('stage', e.target.value)}>
                {projectStages.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Last worked on</span>
              <input type="date" value={values.lastWorkedOn || ''} onChange={(e) => updateField('lastWorkedOn', e.target.value)} />
              <small className="field-hint">Leave empty if a linked GitHub repo shows it.</small>
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
                value={linkedToStripe ? (stripeRevenueUsd ?? values.monthlyRevenueUsd ?? '') : (values.monthlyRevenueUsd ?? '')}
                onChange={(e) => updateField('monthlyRevenueUsd', e.target.value)}
                placeholder="Leave empty if you don't track it"
                disabled={linkedToStripe}
                aria-describedby={linkedToStripe ? 'revenue-from-stripe' : undefined}
              />
              {linkedToStripe && <small id="revenue-from-stripe">Filled in from Stripe.</small>}
            </label>
            {stripeProducts && (
              <fieldset className="field-group full-width form-fieldset">
                <legend>Stripe products</legend>
                <AssetCheckboxList
                  items={stripeProducts.map((product) => {
                    const usd = productMonthlyUsd(product, ratesPerUsd)
                    return { id: product.id, name: usd === null ? product.name : `${product.name} (${formatMoney(usd)}/mo)` }
                  })}
                  selectedIds={values.stripeProductIds || []}
                  onToggle={(id) => toggleId('stripeProductIds', id)}
                  emptyText="No products in Stripe yet."
                />
              </fieldset>
            )}
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

        {modal.error && <p className="form-error" role="alert">{modal.error}</p>}
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
