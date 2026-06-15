import { Activity, Database, FolderGit2, Globe2, Layers, Plus, Sparkles } from 'lucide-react'

const VARIANTS = {
  default: { icon: Database, tone: 'sky' },
  calm: { icon: Sparkles, tone: 'emerald' },
  projects: { icon: Layers, tone: 'violet' },
  domains: { icon: Globe2, tone: 'sky' },
  repos: { icon: FolderGit2, tone: 'amber' },
  activity: { icon: Activity, tone: 'cyan' },
}

export function EmptyState({ title, text, action, actionLabel, variant = 'default', icon: IconOverride }) {
  const variantConfig = VARIANTS[variant] || VARIANTS.default
  const Icon = IconOverride || variantConfig.icon

  return (
    <div className={`empty-state empty-state-${variantConfig.tone}`}>
      <div className="empty-state-icon">
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button type="button" onClick={action}>
          <Plus size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
