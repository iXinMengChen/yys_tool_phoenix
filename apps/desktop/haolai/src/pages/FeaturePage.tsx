'use client'

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { assetUrl } from '@/lib/assetUrl'
import { ArrowLeft, Search } from 'lucide-react'
import { CalculatorPage, CollectionsPage, GameIconProvider, HeroSkillsPage, PvePage, RelicsPage, SpeedPage } from '@phoenix/ui/pages'
import { useAccount } from '@/features/account/context'

type Feature = 'speed' | 'pve' | 'hero-skills' | 'calculator' | 'relics' | 'collections'
const gameAssets = {
  assetUrl,
  collectionImageUrl: (kind: 'suits' | 'heroes', id: number) => assetUrl(`${kind}/${id}.png`),
}

function localArtworkUrl(url?: string) {
  if (!url) return undefined
  const semantic = /^\/cbg\/images\/(heroes|suits|skins|currency|sceneskin|decocardhouse|headskin|badge|yingyuan)\/(.+\.png)$/.exec(url)
  if (semantic) return assetUrl(`${semantic[1]}/${semantic[2]}`)
  const skin = /^\/cbg\/collection-images\/(?:skins|premiumSkins|onmyojiSkins)\/(\d+)\/(\d+)$/.exec(url)
  if (skin) return assetUrl(`skins/${skin[2]}/${skin[1]}.png`)
  const collection = /^\/cbg\/collection-images\/(yards|summonRooms|heroRooms|battleThemes|onmyojiRooms|frames|honors)\/(\d+)$/.exec(url)
  if (collection) {
    const kind = { yards: 'sceneskin', summonRooms: 'decocardhouse', heroRooms: 'currency', battleThemes: 'currency', onmyojiRooms: 'currency', frames: 'headskin', honors: 'badge' }[collection[1]]
    return assetUrl(`${kind}/${collection[2]}.png`)
  }
  return url.startsWith('/cbg/') ? undefined : url
}

function EmptyState() {
  return <section className="work-panel empty-state">
    <Search size={32} className="mb-5 text-primary" aria-hidden="true" />
    <h2 className="text-lg font-medium">还没有可分析的账号</h2>
    <p className="my-3 text-sm text-muted-foreground">先读取藏宝阁商品链接，这里的分析会自动准备好。</p>
    <Link to="/" className="primary-button mt-3"><ArrowLeft size={16} />前往账号查询</Link>
  </section>
}

export default function FeaturePage({ feature }: { feature: Feature }) {
  const { dataset, staticData, staticAssetVersion } = useAccount()
  let page: ReactNode

  if (!dataset) {
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
          resolveImageUrl={url => {
             const source = localArtworkUrl(url)
             return source && staticAssetVersion ? `${source}?v=${staticAssetVersion}` : source
           }}
          renderLink={({ href, className, children }) => <Link to={href} className={className}>{children}</Link>}
          collectionsHref="/collections"
          homeHref="/"
        />
        break
      case 'relics':
        page = <RelicsPage key={dataset.account?.sourceUrl} dataset={dataset} />
        break
    }
  }

  return <GameIconProvider assets={gameAssets}>{page}</GameIconProvider>
}
