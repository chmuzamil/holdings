import {
  Activity,
  AlertTriangle,
  Clock,
  FolderGit2,
  GitBranch,
  Globe2,
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
    tagline: 'What you pay, and what needs you soon.',
    icon: LayoutDashboard,
  },
  insights: {
    title: 'Insights',
    tagline: 'Where your money goes, and when.',
    icon: Lightbulb,
  },
  attention: {
    title: 'Attention',
    tagline: 'Renewals coming up and things to tidy.',
    icon: AlertTriangle,
  },
  timeline: {
    title: 'Timeline',
    tagline: 'What you added, and when.',
    icon: Clock,
  },
  'infrastructure-map': {
    title: 'Map',
    tagline: 'What each project runs on.',
    icon: GitBranch,
  },
  projects: {
    title: 'Projects',
    tagline: 'What each project costs and earns.',
    icon: Layers,
  },
  domains: {
    title: 'Domains',
    tagline: 'Your domains and when they renew.',
    icon: Globe2,
  },
  servers: {
    title: 'Servers',
    tagline: 'Where your apps run.',
    icon: Server,
  },
  repos: {
    title: 'Repos',
    tagline: 'Your code, and which project it belongs to.',
    icon: FolderGit2,
  },
  subscriptions: {
    title: 'Subscriptions',
    tagline: 'Services you pay for.',
    icon: WalletCards,
  },
  accounts: {
    title: 'Accounts',
    tagline: 'Accounts your projects depend on.',
    icon: UserCircle,
  },
  settings: {
    title: 'Settings',
    tagline: 'Backups, currency and GitHub.',
    icon: Settings,
  },
}

export function getPageMeta(activePage) {
  return PAGE_META[activePage] || {
    title: 'Holdings',
    tagline: '',
    icon: Activity,
  }
}
