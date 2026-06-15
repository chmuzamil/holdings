import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, FolderGit2, HeartPulse, Layers, TrendingUp } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../EmptyState'
import { getAttentionItems, getDashboardWidgets, getTotalMonthlyBurn } from '../../lib/intelligence-helpers'
import { getHealthScoreBreakdown } from '../../lib/health-score'
import './dashboard.css'
import '../ui/ui.css'

function SummaryTile({ icon: Icon, label, value, detail, onClick }) {
  return (
    <button type="button" className="overview-summary-tile" onClick={onClick}>
      <Icon size={18} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <ArrowRight size={14} />
    </button>
  )
}

export function DashboardView({
  records,
  flatRecords,
  displayCurrency,
  money,
  prettyDate,
  fromUsd,
  toUsd,
  getReminder,
  setActivePage,
}) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 280)
    return () => window.clearTimeout(t)
  }, [])

  const monthlyUsd = getTotalMonthlyBurn(records, toUsd)
  const widgets = getDashboardWidgets(records, flatRecords, toUsd)
  const health = getHealthScoreBreakdown(records, flatRecords)
  const attentionCount = getAttentionItems(records, flatRecords).length
  const projectCount = (records.projects || []).length
  const activeProjects = (records.projects || []).filter((p) => p.status !== 'Archived').length

  const signalWidgets = [
    widgets.nextRenewal && {
      label: 'Next renewal',
      value: widgets.nextRenewal.name,
      detail: `${getReminder(widgets.nextRenewal)} · ${prettyDate(widgets.nextRenewal.renewalDate || widgets.nextRenewal.expiryDate)}`,
      onClick: () => setActivePage('attention'),
    },
    widgets.mostExpensiveProject && {
      label: 'Highest project burn',
      value: money(fromUsd(widgets.mostExpensiveProject.monthlyUsd, displayCurrency), displayCurrency),
      detail: widgets.mostExpensiveProject.project.name,
      onClick: () => setActivePage('projects'),
    },
    widgets.latestRepo?.lastCommitAt && {
      label: 'Latest repo activity',
      value: widgets.latestRepo.name,
      detail: prettyDate(widgets.latestRepo.lastCommitAt),
      onClick: () => setActivePage('repos'),
    },
  ].filter(Boolean)

  if (loading) {
    return (
      <section className="page-content overview-page">
        <div className="overview-summary-grid">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 72, borderRadius: 10 }} />)}
        </div>
      </section>
    )
  }

  const hasSignals = attentionCount > 0 || signalWidgets.length > 0 || projectCount > 0

  return (
    <section className="page-content overview-page">
      <div className="overview-toolbar">
        <button type="button" className="overview-health-pill" onClick={() => setActivePage('project-health')}>
          <HeartPulse size={16} />
          <span>Health</span>
          <strong>{health.score}</strong>
          <Badge variant={health.score >= 75 ? 'success' : health.score >= 50 ? 'warning' : 'danger'}>{health.label}</Badge>
        </button>
      </div>

      <div className="overview-summary-grid">
        <SummaryTile
          icon={AlertCircle}
          label="Attention"
          value={attentionCount ? `${attentionCount} open` : 'All clear'}
          detail="Warnings and renewals"
          onClick={() => setActivePage('attention')}
        />
        <SummaryTile
          icon={TrendingUp}
          label="Monthly burn"
          value={money(fromUsd(monthlyUsd, displayCurrency), displayCurrency)}
          detail="Recurring infrastructure spend"
          onClick={() => setActivePage('insights')}
        />
        <SummaryTile
          icon={Layers}
          label="Projects"
          value={`${activeProjects} active`}
          detail={projectCount ? `${projectCount} total` : 'No projects yet'}
          onClick={() => setActivePage('projects')}
        />
        <SummaryTile
          icon={FolderGit2}
          label="Repositories"
          value={`${records.repos.length} tracked`}
          detail={widgets.latestRepo ? `Last push ${prettyDate(widgets.latestRepo.lastCommitAt)}` : 'No recent activity'}
          onClick={() => setActivePage('repos')}
        />
      </div>

      {signalWidgets.length > 0 && (
        <div className="overview-signals">
          <p className="overview-section-label">Signals</p>
          <div className="v3-widget-grid">
            {signalWidgets.map((w) => (
              <Card key={w.label} className="v3-widget clickable" onClick={w.onClick} role="button" tabIndex={0}>
                <span>{w.label}</span>
                <strong>{w.value}</strong>
                {w.detail && <small>{w.detail}</small>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {!hasSignals && (
        <EmptyState variant="calm" title="Your overview is clear" text="Add projects and assets — each page will surface a different lens on your stack." />
      )}
    </section>
  )
}
