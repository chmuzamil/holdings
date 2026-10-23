import {
  ChevronDown,
  FolderGit2,
  Globe2,
  Layers,
  Plus,
  Server,
  WalletCards,
} from 'lucide-react'
import { useMenu } from '../ui/use-menu'

const items = [
  { label: 'Project', moduleKey: 'projects', icon: Layers },
  { label: 'Domain', moduleKey: 'domains', icon: Globe2 },
  { label: 'Server', moduleKey: 'servers', icon: Server },
  { label: 'Repo', moduleKey: 'repos', icon: FolderGit2 },
  { label: 'Subscription', moduleKey: 'subscriptions', icon: WalletCards },
]

export function AddAssetDropdown({ onAdd }) {
  const { open, closeAndRefocus, rootRef, menuRef, triggerProps } = useMenu()

  return (
    <div className="add-asset-dropdown" ref={rootRef}>
      <button type="button" className="primary-button add-asset-trigger" {...triggerProps}>
        <Plus size={17} aria-hidden="true" />
        Add
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="add-asset-menu" role="menu" ref={menuRef} aria-label="Add">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.moduleKey}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="add-asset-item"
                onClick={() => {
                  closeAndRefocus()
                  onAdd(item.moduleKey)
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
