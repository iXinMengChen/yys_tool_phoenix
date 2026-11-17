'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import type { CbgCollectionEntry, CbgCollectionKind, CbgStaticData, RelicDataset } from '@phoenix/types'
import { getCollectionSections } from '@phoenix/utils'
import { Pagination } from '../components/Pagination'
import { filterCollectionItems } from '../lib/collectionSearch'
import { useImageFallback } from '../hooks/use-image-fallback'

type LinkProps = { href: string; className?: string; children: ReactNode }
type CollectionProps = {
  renderLink?: (props: LinkProps) => ReactNode
  resolveImageUrl?: (url?: string) => string | undefined
  collectionsHref?: string
  homeHref?: string
}
const landscapeKinds: CbgCollectionKind[] = ['yards', 'summonRooms', 'heroRooms', 'battleThemes', 'onmyojiRooms']
const defaultLink = ({ href, className, children }: LinkProps) => <a href={href} className={className}>{children}</a>

function CollectionArtwork({ item, kind, resolveImageUrl }: { item: CbgCollectionEntry; kind: CbgCollectionKind; resolveImageUrl: (url?: string) => string | undefined }) {
  const source = resolveImageUrl(item.imageUrl)
  const overlaySource = resolveImageUrl(item.overlayImageUrl)
  const image = useImageFallback(source)
  const overlay = useImageFallback(overlaySource)
  const portrait = ['premiumSkins', 'skins', 'onmyojiSkins'].includes(kind)
  const landscape = landscapeKinds.includes(kind)
  const aspect = portrait ? 'aspect-[23/38]' : landscape ? 'aspect-[89/49]' : 'aspect-square'
  if (image.failed) return null
  return <div className={`relative ${aspect} w-full overflow-hidden`}>
    <img src={source} alt={`${item.name}官方图片`} className={`absolute object-contain ${overlaySource ? 'bottom-[1%] left-[12%] size-[76%]' : 'inset-0 size-full'}`} onError={image.onError} />
    {!overlay.failed && <img src={overlaySource} alt="" className="absolute inset-0 size-full object-contain" onError={overlay.onError} />}
  </div>
}

export function CollectionSummary({ dataset, staticData, renderLink = defaultLink, collectionsHref = '/collections' }: { dataset: RelicDataset; staticData: CbgStaticData | null } & Pick<CollectionProps, 'renderLink' | 'collectionsHref'>) {
  const sections = getCollectionSections(dataset.collections, staticData?.collections).slice(0, 10)
  return <section className="analysis-section grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8" aria-labelledby="collection-summary">
    <div><h2 className="section-heading" id="collection-summary">收藏</h2>{renderLink({ href: collectionsHref, className: 'mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline', children: <>收藏图鉴<ArrowRight size={14} /></> })}</div>
    <div className="min-w-0"><dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">{sections.map(section => <div className="border-b border-border py-2.5" key={section.kind}><dt className="text-xs text-muted-foreground">{section.label}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{section.ownedCount ?? '—'}</dd></div>)}</dl>
    {!dataset.collections && <p className="mt-3 text-xs leading-6 text-muted-foreground">此记录尚无收藏持有数据，请重新读取商品链接。横线表示未提供。</p>}</div>
  </section>
}

export default function CollectionsPage({ dataset, staticData, renderLink = defaultLink, resolveImageUrl = url => url, homeHref = '/home' }: { dataset: RelicDataset; staticData: CbgStaticData | null } & CollectionProps) {
  const sections = useMemo(() => getCollectionSections(dataset.collections, staticData?.collections), [dataset.collections, staticData?.collections])
  const [kind, setKind] = useState<CbgCollectionKind>('premiumSkins')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [columns, setColumns] = useState(2)
  const gridRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const observer = new ResizeObserver(() => setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').length))
    observer.observe(grid)
    return () => observer.disconnect()
  }, [kind])
  const pageSize = columns * 3
  const section = sections.find(item => item.kind === kind)!
  const items = useMemo(() => [...filterCollectionItems(section, query, dataset.collections, staticData?.heroCatalog)].reverse(), [dataset.collections, query, section, staticData?.heroCatalog])
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  return <div className="page-stack min-w-0 collections-workstation">
    <header className="analysis-header">
      <div><h1>收藏图鉴</h1><p className="mt-2 text-sm text-muted-foreground">{dataset.account?.name || dataset.account?.title || '当前账号'} · {sections.length} 个收藏分类</p></div>
      {!dataset.collections && <p role="status" className="mt-3 max-w-3xl text-sm leading-6">旧历史没有保存收藏持有数据，{renderLink({ href: homeHref, className: 'text-primary underline underline-offset-4', children: '重新读取商品链接' })}后可补齐。</p>}
      {!staticData?.collections && <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">官方收藏资料尚未载入，请使用菜单中的“更新资料”。</p>}
    </header>
    <div className="analysis-split grid min-w-0 items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <nav className="analysis-rail" aria-label="收藏分类">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">{sections.map(item => <button type="button" aria-pressed={kind === item.kind} key={item.kind} onClick={() => { setKind(item.kind); setQuery(''); setPage(0) }} className={`flex min-h-11 min-w-0 items-center justify-between gap-2 border-b px-2 py-3 text-left text-sm transition-colors ${kind === item.kind ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <span className="min-w-0 break-words">{item.label}</span><strong className={`shrink-0 text-xs font-semibold tabular-nums ${kind === item.kind ? 'text-primary' : 'text-foreground'}`}>{item.ownedCount ?? '—'}</strong>
        </button>)}</div>
      </nav>
      <section className="analysis-body min-w-0" aria-labelledby="collection-list-title">
        <div className="analysis-toolbar flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="collection-list-title" className="section-heading">{section.label}</h2>
            <p role="status" aria-live="polite" className="mt-1 text-xs leading-5 text-muted-foreground">显示 <span className="font-medium tabular-nums text-foreground">{pageItems.length}</span> 项，共 <span className="font-medium tabular-nums text-foreground">{items.length}</span> 项</p>
          </div>
          <label className="relative w-full sm:w-64"><span className="sr-only">搜索收藏</span><Search aria-hidden="true" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><input className="field w-full pl-9" type="search" placeholder={kind === 'skins' || kind === 'premiumSkins' ? '搜索皮肤、式神名或描述' : '搜索名称或描述'} value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label>
        </div>
        <ul ref={gridRef} className={`mt-5 grid items-start gap-3 border-t border-border pt-5 sm:gap-4 ${landscapeKinds.includes(kind) ? 'grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,6rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))]'}`}>{pageItems.map(item => <li key={item.id} className="min-w-0">
          <figure className="min-w-0">
            <CollectionArtwork key={`${kind}:${item.id}`} item={item} kind={kind} resolveImageUrl={resolveImageUrl} />
            <figcaption className="flex min-h-12 items-start py-3"><span className="w-full break-words text-sm font-medium leading-5">{item.name}</span></figcaption>
          </figure>
        </li>)}</ul>
        {!items.length && <p className="flex min-h-52 items-center justify-center px-4 py-10 text-center text-sm leading-6 text-muted-foreground">{!section.available ? '此分类尚无持有数据，请重新读取商品链接。' : section.ownedCount === null ? '收藏资料尚未载入，请使用菜单中的“更新资料”后重试。' : query ? '没有符合搜索条件的收藏。' : '此分类暂无收藏。'}</p>}
        {pageCount > 1 && (
          <Pagination className="mt-6 border-t border-border pt-4" label={`${section.label}分页`} page={currentPage + 1} pageCount={pageCount} onPageChange={next => setPage(next - 1)} />
        )}
      </section>
    </div>
  </div>
}
