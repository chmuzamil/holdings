import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Drawer({ open, onClose, title, description, children }) {
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="ui-drawer-overlay" role="presentation" onClick={onClose} />
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ui-drawer-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          <button className="ui-btn ui-btn-icon ui-btn-ghost" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </>
  )
}
