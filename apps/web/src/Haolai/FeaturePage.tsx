'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { apiBaseUrl } from '@phoenix/config/public-env'
import { ArrowLeft, Search } from 'lucide-react'
import { CalculatorPage, CollectionsPage, GameIconProvider, HeroSkillsPage, PvePage, RelicsPage, SpeedPage } from '@phoenix/ui/pages'
import { useAccount } from './context'
import AccountPage from './pages/AccountPage'

type Feature = 'home' | 'speed' | 'pve' | 'hero-skills' | 'calculator' | 'relics' | 'collections'
const apiRoot = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl
const gameAssets = {
  assetUrl: (path: string) => {
    const match = /^(heroes|suits)\/(\d+)\.png$/.exec(path)
    return match ? `${apiRoot}/cbg/images/${path}` : `/assets/haolai/${path}`
  },
  collectionImageUrl: (kind: 'suits' | 'heroes', id: number) => `${apiRoot}/cbg/images/${kind}/${id}.png`,
}

function EmptyState() {
  return <section className="work-panel empty-state">
    <Search size={32} className="mb-5 text-primary" aria-hidden="true" />
    <h2 className="text-lg font-medium">还没有可分析的账号</h2>
    <p className="my-3 text-sm text-muted-foreground">先读取藏宝阁商品链接，这里的分析会自动准备好。</p>
    <Link href="/yys-cbg-inspector/home" className="primary-button mt-3"><ArrowLeft size={16} />前往账号查询</Link>
  </section>
}

export default function FeaturePage({ feature }: { feature: Feature }) {
  const { dataset, staticData } = useAccount()
  let page: ReactNode

  if (feature === 'home') {
    page = <AccountPage />
  } else if (!dataset) {
    page = <EmptyState />
  } else {
    switch (feature) {
      case 'speed':
        page = <SpeedPage key={dataset.account?.sourceUrl} dataset={dataset} />
        break
      case 'pve':
        page = <PvePage key={dataset.account?.sourceUrl} dataset={dataset} heroPayload={staticData?.heroes} />
        break
      case 'hero-skills':
        page = <HeroSkillsPage key={dataset.account?.sourceUrl} dataset={dataset} heroPayload={staticData?.heroes} />
        break
      case 'calculator':
        page = <CalculatorPage key={dataset.account?.sourceUrl} dataset={dataset} heroes={staticData?.heroes} staticData={staticData} />
        break
      case 'collections':
        page = <CollectionsPage
          key={dataset.account?.sourceUrl}
          dataset={dataset}
          staticData={staticData}
          resolveImageUrl={url => url ? `${apiRoot}${url}` : undefined}
          renderLink={({ href, className, children }) => <Link href={href} className={className}>{children}</Link>}
          collectionsHref="/yys-cbg-inspector/collections"
          homeHref="/yys-cbg-inspector/home"
        />
        break
      case 'relics':
        page = <RelicsPage key={dataset.account?.sourceUrl} dataset={dataset} />
        break
    }
  }

  return <GameIconProvider assets={gameAssets}>{page}</GameIconProvider>
}
