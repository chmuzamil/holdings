import { Edit3, ExternalLink, Eye, Trash2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { DropdownMenu } from '../ui/DropdownMenu'
import {
  devStatusVariant,
  getPortfolioName,
  normalizeRepoRecord,
  timeAgo,
} from '../../lib/repo-helpers'

export function RepoRow({ record, onView, onEdit, onDelete }) {
  const repo = normalizeRepoRecord(record)
  const portfolioName = getPortfolioName(repo)

  return (
    <article className={`repo-table-row polish ${repo.archived ? 'archived' : ''}`.trim()}>
      <div className="repo-main">
        <Avatar name={portfolioName} size="sm" />
        <div className="repo-copy">
          <strong className="repo-portfolio-name">{portfolioName}</strong>
          {repo.description && <p className="repo-description">{repo.description}</p>}
        </div>
      </div>

      <div className="repo-metric-cell">
        <Badge variant="outline">{repo.category}</Badge>
      </div>
      <div className="repo-metric-cell">
        <Badge variant={devStatusVariant(repo.projectStatus)}>{repo.projectStatus}</Badge>
      </div>
      <div className="repo-metric-cell repo-language">{repo.language || '—'}</div>
      <div className="repo-metric-cell repo-push muted-xs">
        {timeAgo(repo.lastCommitAt || repo.updatedAt)}
      </div>

      <div className="repo-actions">
        <button className="ui-btn ui-btn-ghost" type="button" onClick={() => onView(repo)}>
          <Eye size={15} />
          View
        </button>
        <DropdownMenu
          items={[
            ...(repo.url ? [{
              label: 'Open GitHub',
              icon: <ExternalLink size={14} />,
              onClick: () => window.open(repo.url, '_blank', 'noopener,noreferrer'),
            }] : []),
            { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => onEdit(record) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(record) },
          ]}
        />
      </div>
    </article>
  )
}
