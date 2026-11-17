'use client'

import { ArrowRight, Copy, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import type { RelicDataset, RelicView } from '@phoenix/types'
import { CBG_CHANNEL_LABELS, displayGold, displayHeadAndTail, displayNumber, displayPrice, displayRelicSpeed, displayUsageStatus, getCbgChannelFromUrl, getFullSpeedRelics, getPveSuitScoreRanking } from '@phoenix/utils'
import { SuitIcon, useGameIconAssets } from '../components/GameIcon'

type LinkProps = { href: string; className?: string; children: ReactNode }
const defaultLink = ({ href, className, children }: LinkProps) => <a href={href} className={className}>{children}</a>

function DataItems({ items }: { items: [string, ReactNode][] }) {
  return <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">{items.map(([label, value]) => <div className="border-b border-border py-3" key={label}>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1.5 break-words text-base font-semibold tabular-nums">{value ?? '—'}</dd>
  </div>)}</dl>
}

function PositionCounts({ relics, fullSpeed = false }: { relics: Pick<RelicView, 'position'>[]; fullSpeed?: boolean }) {
  const counts = new Map<number, number>()
  for (const { position } of relics) if (position) counts.set(position, (counts.get(position) ?? 0) + 1)
  return <div className="mt-5">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
      <h3 className="text-xs font-medium">{fullSpeed ? '各号位满速数量' : '各号位御魂数量'}</h3>
      <span className="text-xs text-muted-foreground">{fullSpeed ? '6 星满级且副属性满速' : '按号位统计全部御魂'}</span>
    </div>
    <dl className="grid grid-cols-3 border-y border-border sm:grid-cols-6">{[1, 2, 3, 4, 5, 6].map(position => <div className="px-2 py-3" key={position}>
      <dt className="text-xs text-muted-foreground">{position}号位</dt>
      <dd className="mt-1 text-lg font-semibold text-primary tabular-nums">{displayNumber(counts.get(position) ?? 0)}</dd>
    </div>)}</dl>
  </div>
}

function PvpSummary({ score, stage }: { score?: number; stage?: string | number }) {
  const assets = useGameIconAssets()
  const isMaster = score !== undefined && score >= 3000
  return <span className="inline-flex flex-wrap items-center gap-2">
    <span>{isMaster ? '名士' : stage === undefined ? '—' : `${stage}段`}</span>
    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">{isMaster ? <><img src={assets.assetUrl('pvp-star.png')} alt="" width={17} height={17} />{Math.floor((score - 3000) / 30)}星</> : `${displayNumber(score)}分`}</span>
  </span>
}

export function AccountOverview({ dataset, onCopy, renderLink = defaultLink, speedHref = '/speed', relicsHref = '/relics', pveHref = '/pve' }: { dataset: RelicDataset; onCopy: () => void; renderLink?: (props: LinkProps) => ReactNode; speedHref?: string; relicsHref?: string; pveHref?: string }) {
  const assets = useGameIconAssets()
  const account = dataset.account || {}, dex = account.shikigamiDex, relics = Object.values(dataset.relicsByPosition).flat(), fullSpeedRelics = getFullSpeedRelics(dataset), pveRanking = getPveSuitScoreRanking(dataset)
  const channel = account.channel ?? getCbgChannelFromUrl(account.sourceUrl), channelLabel = channel && channel !== 'official' ? CBG_CHANNEL_LABELS[channel] : undefined
  const sectionClass = 'analysis-section grid min-w-0 gap-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8'
  return <article className="account-data-sheet">
    <header className="analysis-header">
      <div className="min-w-0">
        <h1 className="break-words">{account.title || account.name || '账号概览'}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span>{account.serverName || '—'}</span>{channelLabel && <span>{channelLabel}</span>}{account.listingStatus && <span>{account.listingStatus}</span>}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {account.price !== undefined && <p className="mr-4 text-2xl font-semibold text-primary tabular-nums"><span className="mr-2 text-xs font-normal text-muted-foreground">售价</span>{displayPrice(account.price)}</p>}
        <button className="quiet-button" onClick={onCopy}><Copy size={15} />复制摘要</button>
        {account.sourceUrl && <a className="quiet-button" href={account.sourceUrl} target="_blank" rel="noreferrer">账号链接<ExternalLink size={14} /></a>}
      </div>
    </header>
    <section className={sectionClass} aria-labelledby="account-resources">
      <h2 className="section-heading" id="account-resources">账号资源</h2>
      <DataItems items={[
        ['体力', <span className="inline-flex items-center gap-2" key="stamina"><img src={assets.assetUrl('icon-stamina.png')} alt="" width={24} height={24} />{displayGold(account.stamina)}</span>],
        ['金币', <span className="inline-flex items-center gap-2" key="money"><img src={assets.assetUrl('icon-money.png')} alt="" width={24} height={24} />{displayGold(account.money)}</span>],
        ['风姿度', <span className="inline-flex items-center gap-2" key="fengzidu"><img src={assets.assetUrl('icon-fengzidu.png')} alt="" width={24} height={24} />{displayNumber(account.fengzidu)}</span>],
        ['斗技', <span className="inline-flex flex-wrap items-center gap-2" key="pvp"><img src={assets.assetUrl('icon-pvp.png')} alt="" width={24} height={24} /><PvpSummary score={account.pvpScore} stage={account.pvpStage} /></span>],
        ['等级', displayNumber(account.level)],
        ['勾玉', <span className="inline-flex items-center gap-2" key="jade"><img src={assets.assetUrl('icon-goyu.png')} alt="" width={19} height={19} />{displayNumber(account.soulJade)}</span>],
        ['神秘符咒', displayNumber(account.mysteryTalisman)], ['现世符咒', displayNumber(account.realityTalisman)], ['抽卡能力', `${displayNumber(account.summonPower)} 抽`], ['御行达摩', displayNumber(account.yuxingDama)],
      ]} />
    </section>
    <section className={sectionClass} aria-labelledby="speed-highlights">
      <div><h2 className="section-heading" id="speed-highlights">速度盘点</h2>{renderLink({ href: speedHref, className: 'mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline', children: <>完整分析<ArrowRight size={14} /></> })}</div>
      <div className="min-w-0"><DataItems items={[
        ['散件一速', displayRelicSpeed(account.scatteredFirstSpeed)], ['招财一速', displayRelicSpeed(account.luckyFirstSpeed)], ['头 / 尾', displayHeadAndTail(account.speedHeadCount, account.speedTailCount)], ['满速御魂数量', fullSpeedRelics.length],
      ]} /><PositionCounts relics={fullSpeedRelics} fullSpeed /></div>
    </section>
    <section className={sectionClass} aria-labelledby="hero-dex">
      <h2 id="hero-dex" className="section-heading">式神图鉴</h2>
      <DataItems items={[
        ['SSR图鉴', dex ? `${dex.ssr.owned}/${dex.ssr.total}` : '—'], ['SP图鉴', dex ? `${dex.sp.owned}/${dex.sp.total}` : '—'], ['UR图鉴', dex ? `${dex.ur.owned}/${dex.ur.total}` : '—'], ['500天未收录', displayUsageStatus(dex?.uncollected500Days)], ['999天未收录', displayUsageStatus(dex?.uncollected999Days)], ['SSR/SP未收录券', displayNumber(dex?.uncollectedCoupon)], ['式神数量', displayNumber(account.heroSummary ?? dataset.heroes?.length)],
      ]} />
    </section>
    <section className={sectionClass} aria-labelledby="inventory-heading">
      <div><h2 id="inventory-heading" className="section-heading">御魂库存</h2>{renderLink({ href: relicsHref, className: 'mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline', children: <>查看全部御魂<ArrowRight size={14} /></> })}</div>
      <div className="min-w-0"><DataItems items={[
        ['全部御魂数量', displayNumber(account.relicSummary ?? relics.length)], ['6星满级御魂数量', displayNumber(account.maxLevelRelicCount ?? relics.filter(relic => relic.quality === 6 && relic.level === 15).length)],
      ]} /><PositionCounts relics={relics} /></div>
    </section>
    <section className={sectionClass} aria-labelledby="pve-heading">
      <div><h2 id="pve-heading" className="section-heading">PVE 御魂评分</h2>{renderLink({ href: pveHref, className: 'mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline', children: <>PVE 预览<ArrowRight size={14} /></> })}</div>
      <div className="min-w-0">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">件数为达到评分门槛的御魂数量，评分为这些御魂累计的有效属性条数。</p>
        <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">{pveRanking.map(item => {
          const suit = relics.find(relic => relic.suit?.name === item.suitName)?.suit
          return <div key={item.suitName} className="relative border-b border-border py-3 pl-9">
            <dt className="text-xs font-medium"><span className="absolute top-1/2 left-0 -translate-y-1/2"><SuitIcon id={suit?.id} size={28} /></span>{item.suitName}</dt>
            <dd className="mt-1 text-xs text-muted-foreground">{item.relicCount} 件 <strong className="ml-1 text-base font-semibold text-primary tabular-nums">{item.totalScore}</strong></dd>
          </div>
        })}</dl>
        {!pveRanking.length && <p className="py-5 text-sm text-muted-foreground">暂无符合条件的御魂</p>}
      </div>
    </section>
  </article>
}
