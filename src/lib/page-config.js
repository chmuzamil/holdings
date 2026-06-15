import {
  Activity,
  AlertTriangle,
  Clock,
  FolderGit2,
  GitBranch,
  Globe2,
  HeartPulse,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Server,
  Settings,
  UserCircle,
  WalletCards,
} from 'lucide-react'

export const PAGE_META = {
  dashboard: {
    title: 'Overview',
    tagline: 'Everything that needs your attention today.',
    icon: LayoutDashboard,
  },
  insights: {
    title: 'Insights',
    tagline: 'Spending trends and infrastructure analytics.',
    icon: Lightbulb,
  },
  attention: {
    title: 'Attention Center',
    tagline: 'Issues requiring action.',
    icon: AlertTriangle,
  },
  timeline: {
    title: 'Timeline',
    tagline: 'Chronological history of your infrastructure.',
    icon: Clock,
  },
  'infrastructure-map': {
    title: 'Infrastructure Map',
    tagline: 'Relationships between projects, domains, servers, and repositories.',
    icon: GitBranch,
  },
  'project-health': {
    title: 'Project Health',
    tagline: 'Portfolio health and risk indicators.',
    icon: HeartPulse,
  },
  projects: {
    title: 'Projects',
    tagline: 'Everything you are building.',
    icon: Layers,
  },
  domains: {
    title: 'Domains',
    tagline: 'Managed domains and renewals.',
    icon: Globe2,
  },
  servers: {
    title: 'Servers',
    tagline: 'Infrastructure and hosting assets.',
    icon: Server,
  },
  repos: {
    title: 'Repositories',
    tagline: 'GitHub repositories and activity.',
    icon: FolderGit2,
  },
  subscriptions: {
    title: 'Subscriptions',
    tagline: 'Recurring services and SaaS costs.',
    icon: WalletCards,
  },
  accounts: {
    title: 'Accounts',
    tagline: 'Online accounts and platform access.',
    icon: UserCircle,
  },
  settings: {
    title: 'Settings',
    tagline: 'GitHub sync, storage, and preferences.',
    icon: Settings,
  },
}

/** @deprecated use PAGE_META */
export const intelligencePages = PAGE_META

export function getPageMeta(activePage) {
  return PAGE_META[activePage] || {
    title: 'Founder OS',
    tagline: 'Your personal command center.',
    icon: Activity,
  }
}
