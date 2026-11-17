'use client'

import { useEffect, useMemo, useState } from 'react'
import type { HeroStaticPayload, PveScoredRelic, RelicDataset } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import { defaultFourPieceSuitNames, fixedOmaSuitNames, getPveEffectiveGrowthTotal, scorePveRelic } from '@phoenix/utils'
import { RelicCard } from '../components/RelicCard'
import { Pagination } from '../components/Pagination'
import { getSuitOptions, SuitFilterPicker } from '../components/SuitFilterPicker'
import { SuitIcon } from '../components/GameIcon'
import { PveDamageTable } from '../components/PveDamageTable'

const effectiveAttributes = ['攻击加成', '暴击', '暴击伤害']
const selectionKey = 'yys-cbg-inspector:pve-four-piece-selection-v1'

function HighScoreRelics({ title, items }: { title: string; items: PveScoredRelic[] }) {
  const [position, setPosition] = useState(1)
  const [page, setPage] = useState(1)
  const visible = items.filter(({ relic }) => relic.position === position)
  const pageCount = Math.max(1, Math.ceil(visible.length / 36))
  const activePage = Math.min(page, pageCount)
  return <section className="space-y-3" aria-label={title}>
    <h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">{items.length} 件</span></h3>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label={`${title}号位`}>
      {[1, 2, 3, 4, 5, 6].map((value) => <Button key={value} size="sm" className="h-auto min-h-12 min-w-0 flex-col gap-0.5 rounded-none border-0 border-b-2 px-1 py-2" variant={position === value ? 'default' : 'outline'} aria-pressed={position === value} onClick={() => { setPosition(value); setPage(1) }}><span>{value} 号位</span><span className="text-xs font-normal tabular-nums opacity-75">{items.filter(({ relic }) => relic.position === value).length} 件</span></Button>)}
    </div>
    {visible.length ? <div className="relic-grid">{visible.slice((activePage - 1) * 36, activePage * 36).map(({ relic, effectiveCount, maximumEffectiveCount }, index) => <div key={relic.id ?? `${activePage}-${index}`} className="min-w-0 space-y-1"><p className="px-1 text-xs font-medium tabular-nums text-primary">有效 {effectiveCount} / {maximumEffectiveCount}<span className="ml-2 font-normal text-muted-foreground">成长值 {getPveEffectiveGrowthTotal(relic).toFixed(2)}</span></p><RelicCard relic={relic} highlightedAttributes={effectiveAttributes} /></div>)}</div> : <p className="empty-state">此号位暂无符合评分标准的御魂，可切换其他号位查看。</p>}
    {pageCount > 1 && (
      <Pagination label={`${title}分页`} page={activePage} pageCount={pageCount} onPageChange={setPage} />
    )}
  </section>
}

export default function PvePage({ dataset, heroPayload }: { dataset: RelicDataset; heroPayload?: HeroStaticPayload }) {
  const [selectedSuitNames, setSelectedSuitNames] = useState<string[] | null>(null)
  const allRelics = useMemo(() => Object.values(dataset.relicsByPosition).flat(), [dataset])
  const suitOptions = useMemo(() => getSuitOptions(allRelics.filter((relic) => !relic.setBonusAttribute && !relic.suit?.isTwoPieceSet)), [allRelics])
  const suitNames = useMemo(() => suitOptions.map(({ name }) => name), [suitOptions])
  const defaultSuits = useMemo(() => {
    const preferred = defaultFourPieceSuitNames.filter((name) => suitNames.includes(name))
    return preferred.length ? preferred : suitNames.slice(0, 7)
  }, [suitNames])
  const activeSuits = useMemo(() => {
    const available = selectedSuitNames?.filter((name) => suitNames.includes(name))
    return available && (!selectedSuitNames?.length || available.length) ? available : defaultSuits
  }, [selectedSuitNames, defaultSuits, suitNames])
  const scored = useMemo(() => allRelics.map(scorePveRelic).filter((item): item is PveScoredRelic => item !== null && item.effectiveCount >= 5).sort((a, b) => b.effectiveCount - a.effectiveCount || getPveEffectiveGrowthTotal(b.relic) - getPveEffectiveGrowthTotal(a.relic)), [allRelics])
  const outputRelics = useMemo(() => scored.filter(({ relic }) => activeSuits.includes(relic.suit?.name || '')), [scored, activeSuits])
  const omaRelics = useMemo(() => scored.filter(({ relic }) => fixedOmaSuitNames.includes(relic.suit?.name || '')), [scored])
  const orderedNames = [...activeSuits, ...fixedOmaSuitNames]
  const scores = orderedNames.flatMap((name) => {
    const relics = scored.filter(({ relic }) => relic.suit?.name === name)
    return relics.length ? [{ name, count: relics.length, total: relics.reduce((sum, item) => sum + item.effectiveCount, 0) }] : []
  })

  useEffect(() => {
    let isActive = true
    queueMicrotask(() => {
      try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(selectionKey) || 'null')
        if (isActive && Array.isArray(saved) && saved.every((name): name is string => typeof name === 'string')) setSelectedSuitNames(saved)
      } catch { /* 读取失败时使用当前账号的默认套装。 */ }
    })
    return () => { isActive = false }
  }, [])

  function selectSuits(names: string[]) {
    setSelectedSuitNames(names)
    try { window.localStorage.setItem(selectionKey, JSON.stringify(names)) } catch { /* 存储不可用时仍保留当前页面选择。 */ }
  }

  return <div className="page-stack min-w-0">
    <header className="analysis-header">
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">PVE 御魂分析</h1>
      <p className="text-sm text-muted-foreground">账号御魂 <strong className="font-semibold tabular-nums text-foreground">{allRelics.length}</strong> 件</p>
    </header>
    <section className="analysis-toolbar space-y-3" aria-label="PVE 四件套选择">
      <div className="flex flex-wrap items-center gap-3">
        <SuitFilterPicker title="选择 PVE 四件套" options={suitOptions} selected={activeSuits} defaults={defaultSuits} onChange={selectSuits} all deferred />
        <p className="text-sm text-muted-foreground">已选 <strong className="tabular-nums text-foreground">{activeSuits.length}</strong> 种四件套 · 固定搭配 3 种逢魔御魂</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{activeSuits.join('、') || '未选择四件套'}；逢魔御魂固定统计土蜘蛛、荒骷髅、鬼灵歌伎。</p>
    </section>
    <PveDamageTable dataset={dataset} heroPayload={heroPayload} suitNames={suitNames} selected={activeSuits} />
    <div className="analysis-split">
      <aside className="analysis-rail space-y-6" aria-label="PVE 评分规则">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">评分规则</h2>
          <dl className="space-y-4 text-sm leading-relaxed">
            <div><dt className="font-medium">御魂范围</dt><dd className="mt-1 text-muted-foreground">满级六星；2、4 号位仅攻击加成，6 号位仅暴击或暴击伤害。</dd></div>
            <div><dt className="font-medium">有效词条</dt><dd className="mt-1 text-muted-foreground">攻击加成、暴击、暴击伤害各计 1 条，普通御魂上限 8 条；逢魔一件套为上述属性时额外 +3 条，上限 11 条。</dd></div>
            <div><dt className="font-medium">展示与汇总</dt><dd className="mt-1 text-muted-foreground">仅展示 5 条及以上；套件总评分为所有展示御魂的有效词条数之和。</dd></div>
          </dl>
        </div>
      </aside>
      <div className="analysis-body space-y-8">
        <section className="space-y-4" aria-label="PVE 套件总评分">
          <h2 className="text-lg font-semibold">套件评分对比</h2>
          <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2">
            {['PVE 四件套总评分', '逢魔御魂总评分'].map((title, index) => {
              const group = scores.filter(({ name }) => fixedOmaSuitNames.includes(name) === Boolean(index))
              return <table key={title} className="w-full border-collapse text-left text-sm tabular-nums">
                <caption className="pb-3 text-left text-sm font-medium">{title}</caption>
                <thead className="border-y border-border text-xs text-muted-foreground"><tr><th scope="col" className="py-2 font-normal">套件</th><th scope="col" className="py-2 text-right font-normal">御魂数</th><th scope="col" className="py-2 text-right font-normal">总评分</th></tr></thead>
                <tbody className="divide-y divide-border">{group.length ? group.map(({ name, count, total }) => <tr key={name}><th scope="row" className="py-3 font-medium"><span className="inline-flex items-center gap-2"><SuitIcon id={allRelics.find((relic) => relic.suit?.name === name)?.suit?.id} size={24} />{name}</span></th><td className="py-3 text-right text-muted-foreground">{count}</td><td className="py-3 text-right font-semibold text-primary">{total}</td></tr>) : <tr><td colSpan={3} className="py-4 text-muted-foreground">暂无达到展示标准的御魂。</td></tr>}</tbody>
              </table>
            })}
          </div>
        </section>
      </div>
    </div>
    <section className="analysis-section space-y-6" aria-labelledby="pve-high-score-heading">
      <h2 id="pve-high-score-heading" className="text-lg font-semibold">高评分御魂</h2>
      <HighScoreRelics title="PVE 输出御魂" items={outputRelics} />
      <div className="border-t border-border pt-6"><HighScoreRelics title="逢魔御魂" items={omaRelics} /></div>
    </section>
  </div>
}
