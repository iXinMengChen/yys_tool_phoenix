'use client'

import { useMemo, useState } from 'react'
import type { RelicDataset, RelicView } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import { compareAttributeLabels } from '@phoenix/utils'
import { RotateCcw } from 'lucide-react'
import { RelicCard } from '../components/RelicCard'
import { Pagination } from '../components/Pagination'
import { FilterOption } from '../components/FilterOption'
import { getSuitOptions, SuitFilterPicker } from '../components/SuitFilterPicker'

export function RelicList({ items, highlightedAttributes }: { items: RelicView[]; highlightedAttributes?: string[] }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / 48))
  const activePage = Math.min(page, pageCount)

  return (
    <div className="space-y-3">
      {items.length ? (
        <div className="relic-grid">
          {items.slice((activePage - 1) * 48, activePage * 48).map((relic, index) => (
            <RelicCard key={relic.id ?? `${activePage}-${index}`} relic={relic} highlightedAttributes={highlightedAttributes} />
          ))}
        </div>
      ) : <p className="empty-state">没有符合筛选条件的御魂，试试调整套装或属性。</p>}
      {pageCount > 1 && (
        <Pagination label="御魂分页" page={activePage} pageCount={pageCount} onPageChange={setPage} summary={`共 ${items.length} 件`} />
      )}
    </div>
  )
}

export default function RelicsPage({ dataset }: { dataset: RelicDataset }) {
  const [position, setPosition] = useState('1')
  const [suitNames, setSuitNames] = useState<string[]>([])
  const [mainAttribute, setMainAttribute] = useState('')
  const [subAttributes, setSubAttributes] = useState<string[]>([])
  const [sortAttribute, setSortAttribute] = useState('')
  const [direction, setDirection] = useState('desc')
  const allRelics = useMemo(() => Object.values(dataset.relicsByPosition).flat(), [dataset])
  const suits = useMemo(() => getSuitOptions(allRelics), [allRelics])
  const attributes = useMemo(() => [...new Set(allRelics.flatMap((relic) => (relic.subAttributes || []).map((attribute) => attribute.label)))].sort(compareAttributeLabels), [allRelics])
  const positionRelics = useMemo(() => dataset.relicsByPosition[position] || [], [position, dataset.relicsByPosition])
  const matchesFilters = (relic: RelicView) => (!suitNames.length || suitNames.includes(relic.suit?.name || '')) && (![2, 4, 6].includes(relic.position ?? 0) || !mainAttribute || relic.mainAttribute?.label === mainAttribute) && subAttributes.every((label) => relic.subAttributes?.some((attribute) => attribute.label === label))
  const mainAttributes = [...new Set(positionRelics.map((relic) => relic.mainAttribute?.label).filter((label): label is string => Boolean(label)))].sort(compareAttributeLabels)
  const filtered = useMemo(() => positionRelics.filter((relic) => (
    (!suitNames.length || suitNames.includes(relic.suit?.name || '')) &&
    (![2, 4, 6].includes(relic.position ?? 0) || !mainAttribute || relic.mainAttribute?.label === mainAttribute) &&
    subAttributes.every((label) => relic.subAttributes?.some((attribute) => attribute.label === label))
  )).sort((a, b) => {
    if (!sortAttribute) return 0
    const valueOf = (relic: RelicView) => relic.enhancement?.totals?.find((attribute) => attribute.label === sortAttribute)?.total ?? relic.subAttributes?.find((attribute) => attribute.label === sortAttribute)?.value ?? 0
    return (valueOf(a) - valueOf(b)) * (direction === 'desc' ? -1 : 1)
  }), [positionRelics, suitNames, mainAttribute, subAttributes, sortAttribute, direction])

  function resetFilters() {
    setSuitNames([])
    setMainAttribute('')
    setSubAttributes([])
    setSortAttribute('')
    setDirection('desc')
  }

  return (
    <div className="page-stack min-w-0">
      <header className="analysis-header">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">御魂仓库</h1>
        <p className="text-sm text-muted-foreground">账号库存 <strong className="ml-1 font-semibold tabular-nums text-foreground">{allRelics.length}</strong> 件</p>
      </header>
      <div className="analysis-split">
      <aside className="analysis-rail space-y-5" aria-label="御魂筛选">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">筛选条件</h2>
          <Button variant="ghost" size="sm" onClick={resetFilters}><RotateCcw aria-hidden="true" />重置筛选</Button>
        </div>
        <p className="text-xs text-muted-foreground">所有条件同时生效；2、4、6 号位可筛选主属性。</p>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <label className="grid content-start gap-2 text-sm font-medium">主属性
            <select className="field w-full" disabled={![2, 4, 6].includes(Number(position))} value={mainAttribute} onChange={(event) => setMainAttribute(event.target.value)}>
              <option value="">不限主属性</option>
              {mainAttributes.map((label) => <option key={label}>{label}</option>)}
            </select>
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">副属性排序
            <select className="field w-full" value={sortAttribute} onChange={(event) => setSortAttribute(event.target.value)}>
              <option value="">保持原始顺序</option>
              {attributes.map((label) => <option key={label}>{label}</option>)}
            </select>
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">排序方向
            <select className="field w-full" value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="desc">从高到低</option><option value="asc">从低到高</option>
            </select>
          </label>
        </div>
        <fieldset className="min-w-0 border-t border-border pt-4">
          <legend className="pr-2 text-sm font-medium">副属性 · 同时包含所选属性</legend>
          <div className="flex flex-wrap gap-1.5">
            {attributes.map((label) => <FilterOption key={label} checked={subAttributes.includes(label)} onChange={(event) => { setSubAttributes((current) => event.target.checked ? [...current, label] : current.filter((item) => item !== label)); if (event.target.checked && !sortAttribute) setSortAttribute(label) }}>{label}</FilterOption>)}
          </div>
        </fieldset>
        <fieldset className="min-w-0 border-t border-border pt-4">
          <legend className="pr-2 text-sm font-medium">套装筛选 <span className="font-normal text-muted-foreground">· {suitNames.length ? `已选 ${suitNames.length} 种` : '全部套装'}</span></legend>
          <div className="flex flex-wrap items-center gap-2">
            <SuitFilterPicker title="选择御魂种类" options={suits} selected={suitNames} onChange={setSuitNames} />
            {suitNames.length > 0 && <span className="text-sm text-muted-foreground">{suitNames.join('、')}</span>}
          </div>
        </fieldset>
      </aside>
      <section aria-label="御魂列表" className="analysis-body space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="御魂号位">
          {[1, 2, 3, 4, 5, 6].map((value) => {
            const items = dataset.relicsByPosition[String(value)] || []
            return <Button key={value} size="sm" className="h-auto min-h-12 min-w-0 flex-col gap-0.5 rounded-none border-0 border-b-2 px-1 py-2" variant={position === String(value) ? 'default' : 'outline'} aria-pressed={position === String(value)} onClick={() => { setPosition(String(value)); if (![2, 4, 6].includes(value) || !items.some((relic) => relic.mainAttribute?.label === mainAttribute)) setMainAttribute('') }}><span>{value} 号位</span><span className="text-xs font-normal tabular-nums opacity-75">{items.filter(matchesFilters).length} / {items.length}</span></Button>
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><h2 className="text-base font-semibold">{position} 号位御魂</h2><p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">筛选结果 <strong className="font-semibold text-primary">{filtered.length}</strong> / {positionRelics.length} 件</p></div>
        <RelicList key={`${position}-${suitNames.join(',')}-${mainAttribute}-${subAttributes.join(',')}-${sortAttribute}-${direction}`} items={filtered} highlightedAttributes={subAttributes} />
      </section>
      </div>
    </div>
  )
}
