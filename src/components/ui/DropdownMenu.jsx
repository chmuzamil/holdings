import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export function DropdownMenu({ items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className="ui-dropdown" ref={rootRef}>
      <button
        className="ui-btn ui-btn-icon ui-btn-ghost"
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="ui-dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`ui-dropdown-item ${item.danger ? 'ui-dropdown-item-danger' : ''}`.trim()}
              onClick={() => {
                setOpen(false)
                item.onClick?.()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
