'use client'

import { useMemo, useState } from 'react'
import type { HeroStaticPayload, HeroView, RelicDataset } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import { Search } from 'lucide-react'
import { HeroPortrait } from '../components/GameIcon'
import { FilterOption } from '../components/FilterOption'
import { PickerDialog } from '../components/PickerDialog'

const rarityLabels: Record<number, string> = { 6: 'UR', 5: 'SP', 4: 'SSR' }
const visibleRarities = [6, 5, 4]
const yinYangShiIds = new Set([10, 11, 12, 13, 15, 16])

function meetsRequirement(hero: HeroView, requirement: number) {
  const required = String(requirement).padStart(3, '0')
  const levels = hero.skillLevels.slice(0, 3)
  return levels.length === 3 && levels.every((level, index) => level >= Number(required[index]))
}

function skillTotal(hero: HeroView) {
  return hero.skillLevels.slice(0, 3).reduce((total, level) => total + level, 0)
}

export default function HeroSkillsPage({ dataset, heroPayload }: { dataset: RelicDataset; heroPayload?: HeroStaticPayload }) {
  const [search, setSearch] = useState('')
  const [isHeroOpen, setIsHeroOpen] = useState(false)
  const [isSimplified, setIsSimplified] = useState(false)
  const [selectedHero, setSelectedHero] = useState<HeroView | null>(null)
  const staticHeroes = heroPayload?.heroesById
  const hasStaticData = Boolean(staticHeroes && Object.keys(staticHeroes).length)
  const heroes = useMemo(() => (dataset.heroes || []).filter((hero) => visibleRarities.includes(hero.rarity) && hero.heroId < 900 && !yinYangShiIds.has(hero.heroId)), [dataset.heroes])
  const requirementFor = (heroId: number) => staticHeroes?.[String(heroId)]?.lowestRank ?? 155
  const keyword = search.trim().toLocaleLowerCase()
  const grouped = useMemo(() => {
    const groups = new Map<string, HeroView[]>()
    heroes.filter((hero) => !staticHeroes?.[String(hero.heroId)]?.isCollaboration).forEach((hero) => groups.set(hero.name, [...(groups.get(hero.name) || []), hero]))
    return groups
  }, [heroes, staticHeroes])
  const deficientHeroes = useMemo(() => [...grouped.values()]
    .filter((instances) => !instances.some((hero) => meetsRequirement(hero, staticHeroes?.[String(hero.heroId)]?.lowestRank ?? 155)))
    .map((instances) => [...instances].sort((a, b) => skillTotal(b) - skillTotal(a) || b.level - a.level)[0]!)
    .filter((hero) => !staticHeroes?.[String(hero.heroId)]?.isCollaboration), [grouped, staticHeroes])
  const duplicateHeroes = useMemo(() => [...grouped.values()].flatMap((instances) => {
    const qualified = instances.filter((hero) => meetsRequirement(hero, staticHeroes?.[String(hero.heroId)]?.lowestRank ?? 155))
    return qualified.length >= 2 && !staticHeroes?.[String(instances[0]!.heroId)]?.isCollaboration ? qualified : []
  }), [grouped, staticHeroes])
  const filtered = useMemo(() => heroes.filter((hero) => (
    !keyword || hero.name.toLocaleLowerCase().includes(keyword) || String(hero.heroId).includes(keyword)
  )).sort((a, b) => b.level - a.level || b.rarity - a.rarity || b.heroId - a.heroId), [heroes, keyword])
  const unowned = useMemo(() => {
    if (dataset.heroes === undefined) return []
    const owned = new Set(heroes.map((hero) => hero.heroId))
    return Object.values(staticHeroes || {}).filter((hero) => (
      hero.id < 900 && !yinYangShiIds.has(hero.id) && !hero.isCollaboration && !owned.has(hero.id) &&
      visibleRarities.includes(hero.rarityCode ?? 0) &&
      (!keyword || hero.name.toLocaleLowerCase().includes(keyword) || String(hero.id).includes(keyword))
    )).sort((a, b) => (a.rarityCode ?? 0) - (b.rarityCode ?? 0) || b.id - a.id)
  }, [dataset.heroes, heroes, staticHeroes, keyword])
  const visibleCount = filtered.length
  const duplicateIds = new Set(duplicateHeroes.map((hero) => hero.instanceId))
  const deficientIds = new Set(deficientHeroes.map((hero) => hero.instanceId))
  const sections = [
    { title: '存在多号机的式神', heroes: filtered.filter((hero) => duplicateIds.has(hero.instanceId)) },
    { title: '技能未达标', heroes: filtered.filter((hero) => deficientIds.has(hero.instanceId)), description: '每种式神仅展示最接近满技能的一只。' },
    { title: '联动式神', heroes: filtered.filter((hero) => staticHeroes?.[String(hero.heroId)]?.isCollaboration) },
    ...visibleRarities.map((value) => ({ title: rarityLabels[value]!, heroes: filtered.filter((hero) => hero.rarity === value && !staticHeroes?.[String(hero.heroId)]?.isCollaboration) })),
  ]

  return (
    <div className="page-stack min-w-0">
      <header className="analysis-header">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">式神技能</h1>
        <p className="text-sm text-muted-foreground">御行达摩 <strong className="ml-1 text-lg font-semibold tabular-nums text-primary">{dataset.account?.yuxingDama ?? '未提供'}</strong></p>
      </header>
      <section className="analysis-toolbar space-y-3" aria-label="式神技能筛选">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">搜索式神</span><input className="field w-full sm:max-w-lg" type="search" value={search} placeholder="搜索式神名称或编号" onChange={(event) => setSearch(event.target.value)} /></label>
          <FilterOption checked={isSimplified} onChange={(event) => setIsSimplified(event.target.checked)}>简略模式</FilterOption>
          {dataset.heroes !== undefined && <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">筛选结果：{visibleCount} 个式神</p>}
        </div>
        {!hasStaticData && <p className="text-sm text-muted-foreground">式神资料尚未载入：达标暂按 1 / 5 / 5 判断，暂不能识别联动式神或生成未拥有名单；账号技能等级仍可查看。</p>}
      </section>
      {dataset.heroes === undefined ? <p className="empty-state">当前账号数据未包含式神信息，不能判断技能或未拥有名单。</p> : <>
        <section className="analysis-section min-w-0 space-y-3" aria-label="未拥有式神">
          <h2 className="flex flex-wrap items-baseline gap-2 text-base font-semibold">未拥有式神（排除联动） <span className="font-normal tabular-nums text-muted-foreground">{hasStaticData ? unowned.length : '—'}</span></h2>
          {!hasStaticData ? <p className="py-2 text-sm text-muted-foreground">载入式神资料后，才能生成未拥有名单。</p> : unowned.length ? <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-x-4">
            {unowned.map((hero) => <li key={hero.id} className="flex min-w-0 items-center gap-3 border-b border-border py-3 text-sm">
              {!isSimplified && <HeroPortrait heroId={hero.id} size={40} grayscale />}
              <strong className="wrap-break-word font-semibold">{hero.name}</strong>
            </li>)}
          </ul> : <p className="py-2 text-sm text-muted-foreground">当前搜索范围内没有未拥有的式神。</p>}
        </section>
        {sections.filter(({ title }) => !isSimplified || title === '存在多号机的式神' || title === '技能未达标').map(({ title, heroes: sectionHeroes, description }) => <section key={title} className="analysis-section min-w-0 space-y-3" aria-label={title}>
          <h2 className="flex flex-wrap items-baseline gap-2 text-base font-semibold">{title} <span className="font-normal tabular-nums text-muted-foreground">{sectionHeroes.length}</span></h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {sectionHeroes.length ? <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-x-4">
            {sectionHeroes.filter((hero, index, items) => !isSimplified || title !== '存在多号机的式神' || items.findIndex((item) => item.name === hero.name) === index).map((hero) => {
              const duplicateCount = title === '存在多号机的式神' ? sectionHeroes.filter((item) => item.name === hero.name).length : 0
              return <li key={hero.instanceId} className="min-w-0">
                <button type="button" onClick={() => { setSelectedHero(hero); setIsHeroOpen(true) }} aria-haspopup="dialog" aria-label={`查看${hero.name}技能详情`} className={`flex h-full min-h-14 w-full min-w-0 cursor-pointer items-center gap-3 border-b border-border py-3 text-left text-sm transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring ${isSimplified ? 'justify-between' : ''}`}>
                  {!isSimplified && <HeroPortrait heroId={hero.heroId} size={40} />}
                  <span className="min-w-0">
                    <strong className="block wrap-break-word font-semibold">{hero.name}{isSimplified && duplicateCount > 1 && <span className="ml-1 tabular-nums text-primary">×{duplicateCount}</span>}</strong>
                    {!isSimplified && <span className="flex flex-wrap items-center gap-x-2"><span className="font-semibold tracking-widest tabular-nums text-primary"><span className="sr-only">技能 1 / 2 / 3：</span>{[0, 1, 2].map((index) => hero.skillLevels[index] ?? '—').join('')}</span>{title !== '技能未达标' && <span className="text-xs tabular-nums text-muted-foreground">等级 {hero.level}</span>}</span>}
                  </span>
                </button>
              </li>
            })}
          </ul> : <p className="py-2 text-sm text-muted-foreground">无符合当前筛选条件的式神。</p>}
        </section>)}
      </>}
      {selectedHero && <PickerDialog open={isHeroOpen} onOpenChange={setIsHeroOpen} onOpenChangeComplete={(open) => { if (!open) setSelectedHero(null) }} title={`${selectedHero.name} · 式神技能`} className="sm:max-w-xl">
        <div className="flex items-center gap-4">
          <HeroPortrait heroId={selectedHero.heroId} size={80} />
          <div className="space-y-1"><p className="font-semibold">{selectedHero.name}</p><p className="text-sm text-muted-foreground">{rarityLabels[selectedHero.rarity] || '其他'} · 等级 {selectedHero.level}{staticHeroes?.[String(selectedHero.heroId)]?.isCollaboration ? ' · 联动式神' : ''}</p><p className="text-sm text-muted-foreground">{meetsRequirement(selectedHero, requirementFor(selectedHero.heroId)) ? '技能已达标' : '技能未达标'}</p></div>
        </div>
        <table className="data-table mt-4 w-full text-left text-sm tabular-nums">
          <caption className="sr-only">技能等级与最低要求，按原技能槽位顺序显示</caption>
          <thead><tr><th scope="col">技能槽位</th><th scope="col">当前等级</th><th scope="col">最低要求</th></tr></thead>
          <tbody>{[0, 1, 2].map((index) => <tr key={index}><th scope="row" className="font-medium">技能 {index + 1}</th><td>{selectedHero.skillLevels[index] ?? '—'}</td><td>{String(requirementFor(selectedHero.heroId)).padStart(3, '0')[index]}</td></tr>)}</tbody>
        </table>
        <Button className="mt-4" onClick={() => setIsHeroOpen(false)}>关闭</Button>
      </PickerDialog>}
    </div>
  )
}