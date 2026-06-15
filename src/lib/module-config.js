import {
  FolderGit2,
  Globe2,
  Layers,
  Server,
  UserCircle,
  WalletCards,
} from 'lucide-react'

export const moduleConfig = {
  projects: {
    title: 'Projects',
    singular: 'Project',
    icon: Layers,
  },
  domains: {
    title: 'Domains',
    singular: 'Domain',
    icon: Globe2,
  },
  servers: {
    title: 'VPS / Servers',
    singular: 'Server',
    icon: Server,
  },
  repos: {
    title: 'GitHub Repos',
    singular: 'Repository',
    icon: FolderGit2,
  },
  accounts: {
    title: 'Accounts',
    singular: 'Account',
    icon: UserCircle,
  },
  subscriptions: {
    title: 'Subscriptions',
    singular: 'Subscription',
    icon: WalletCards,
  },
}
