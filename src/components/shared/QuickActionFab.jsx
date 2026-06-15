import { useState } from 'react'
import {
  FolderGit2,
  Globe2,
  Layers,
  Plus,
  Server,
  WalletCards,
  X,
} from 'lucide-react'
import './quick-action-fab.css'

const actions = [
  { label: 'Add Project', moduleKey: 'projects', icon: Layers },
  { label: 'Add Domain', moduleKey: 'domains', icon: Globe2 },
  { label: 'Add Server', moduleKey: 'servers', icon: Server },
  { label: 'Add Repo', moduleKey: 'repos', icon: FolderGit2 },
  { label: 'Add Subscription', moduleKey: 'subscriptions', icon: WalletCards },
]

export function QuickActionFab({ onAction }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`quick-fab ${open ? 'open' : ''}`.trim()}>
      {open && (
        <div className="quick-fab-menu">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.moduleKey}
                type="button"
                className="quick-fab-action"
                onClick={() => {
                  onAction(action.moduleKey)
                  setOpen(false)
                }}
              >
                <Icon size={15} />
                {action.label}
              </button>
            )
          })}
        </div>
      )}
      <button
        type="button"
        className="quick-fab-trigger"
        aria-label={open ? 'Close quick actions' : 'Quick actions'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} /> : <Plus size={20} />}
      </button>
    </div>
  )
}
