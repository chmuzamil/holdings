import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  FolderGit2,
  Globe2,
  Layers,
  Plus,
  Server,
  WalletCards,
} from 'lucide-react'

const items = [
  { label: 'Project', moduleKey: 'projects', icon: Layers },
  { label: 'Domain', moduleKey: 'domains', icon: Globe2 },
  { label: 'Server', moduleKey: 'servers', icon: Server },
  { label: 'Repository', moduleKey: 'repos', icon: FolderGit2 },
  { label: 'Subscription', moduleKey: 'subscriptions', icon: WalletCards },
]

export function AddAssetDropdown({ onAdd }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="add-asset-dropdown" ref={ref}>
      <button type="button" className="primary-button add-asset-trigger" onClick={() => setOpen((v) => !v)}>
        <Plus size={17} />
        Add Asset
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="add-asset-menu">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.moduleKey}
                type="button"
                className="add-asset-item"
                onClick={() => {
                  onAdd(item.moduleKey)
                  setOpen(false)
                }}
              >
                <Icon size={15} />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
