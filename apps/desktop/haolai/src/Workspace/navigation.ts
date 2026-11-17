import { BookOpen, Calculator, ChartNoAxesCombined, Gauge, Layers3, Search, Settings, Sparkles, UsersRound } from 'lucide-react'

export { pageTitleByPath } from './pageTitleByPath'

export const navigationGroups = [
  {
    label: '账号分析',
    items: [
      { href: '/', icon: Search },
      { href: '/account-matcher', icon: UsersRound },
      { href: '/speed', icon: Gauge },
      { href: '/pve', icon: ChartNoAxesCombined },
      { href: '/hero-skills', icon: Sparkles },
      { href: '/collections', icon: BookOpen },
      { href: '/calculator', icon: Calculator },
      { href: '/relics', icon: Layers3 },
    ],
  },
  { label: '桌面', items: [{ href: '/settings', icon: Settings }] },
] as const
