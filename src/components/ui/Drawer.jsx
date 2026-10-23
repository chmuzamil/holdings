import { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { useDialog } from './use-dialog'

export function Drawer({ open, onClose, title, description, children }) {
  const titleId = useId()
  const dialogRef = useDialog({ open, onClose })

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
      <aside
        className="ui-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        {...(title ? { 'aria-labelledby': titleId } : { 'aria-label': 'Details' })}
      >
        <div className="ui-drawer-header">
          <div>
            {title && <h2 id={titleId}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          <button className="ui-btn ui-btn-icon ui-btn-ghost" type="button" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </>
  )
}
