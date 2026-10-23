import { MoreHorizontal } from 'lucide-react'
import { useMenu } from './use-menu'

export function DropdownMenu({ items, label = 'More actions' }) {
  const { open, closeAndRefocus, rootRef, menuRef, triggerProps } = useMenu()

  return (
    <div className="ui-dropdown" ref={rootRef}>
      <button className="ui-btn ui-btn-icon ui-btn-ghost" type="button" aria-label={label} {...triggerProps}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="ui-dropdown-menu" role="menu" ref={menuRef}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`ui-dropdown-item ${item.danger ? 'ui-dropdown-item-danger' : ''}`.trim()}
              onClick={() => {
                closeAndRefocus()
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
