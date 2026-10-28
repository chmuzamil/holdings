import { useId } from 'react'

/** An on/off switch with a visible label. Space and Enter toggle it, like a button. */
export function Switch({ checked, onChange, label, description, disabled = false }) {
  const descriptionId = useId()
  return (
    <div className="ui-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        className="ui-switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
        <span className="ui-switch-label">{label}</span>
      </button>
      {description && <p id={descriptionId} className="ui-switch-description">{description}</p>}
    </div>
  )
}
