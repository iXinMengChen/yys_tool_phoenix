import { BookOpen, BriefcaseBusiness, Calculator, ChartNoAxesCombined, Gauge, House, Layers3, Sparkles } from 'lucide-react'

export { pageTitleByPath } from './pageTitleByPath'

export const navigationGroups = [
  {
    label: '工具箱',
    items: [{ href: '/', icon: BriefcaseBusiness }],
  },
  {
    label: '账号分析',
    items: [
      { href: '/yys-cbg-inspector/home', icon: House },
      { href: '/yys-cbg-inspector/speed', icon: Gauge },
      { href: '/yys-cbg-inspector/pve', icon: ChartNoAxesCombined },
      { href: '/yys-cbg-inspector/hero-skills', icon: Sparkles },
      { href: '/yys-cbg-inspector/collections', icon: BookOpen },
      { href: '/yys-cbg-inspector/calculator', icon: Calculator },
      { href: '/yys-cbg-inspector/relics', icon: Layers3 },
    ],
  },
] as const
