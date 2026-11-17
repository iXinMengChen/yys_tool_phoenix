'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react'
import type { HeroRecord } from '@phoenix/types'
import { rarityLabels, twoPieceAttributeOrder } from '@phoenix/utils'
import { HeroPortrait, SuitIcon } from '../components/GameIcon'
import { PickerDialog } from '../components/PickerDialog'

export type CalculatorSuitOption = { id?: number; name: string; twoPieceAttribute?: string; isOma: boolean }
const optionClass = 'relative flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45'
const selectedClass = 'border-primary bg-primary/10 font-semibold text-primary'
const unselectedClass = 'border-border bg-background text-foreground'

export function CalculatorHeroPicker({ heroes, heroId, restoredHeroName, disabled, onSelect }: {
  heroes: HeroRecord[]; heroId: string; restoredHeroName: string; disabled: boolean; onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const stored: unknown = JSON.parse(localStorage.getItem('yys-cbg-inspector.calculator.recent-heroes') || '[]')
        if (Array.isArray(stored)) setRecentIds([...new Set(stored.filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0).map(String))].slice(0, 8))
      } catch { /* 最近记录不可用时不影响选择。 */ }
    })
    return () => { active = false }
  }, [])
  const selectedHero = heroes.find(hero => String(hero.id) === heroId)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return heroes.filter(hero => `${hero.name} ${hero.id} ${rarityLabels[hero.rarityCode ?? 0] ?? ''}`.toLocaleLowerCase().includes(query))
  }, [heroes, search])
  const groups = useMemo(() => [...new Set(filtered.map(hero => hero.rarityCode ?? 0))].sort((a, b) => b - a).map(rarity => ({ rarity, heroes: filtered.filter(hero => (hero.rarityCode ?? 0) === rarity).sort((a, b) => b.id - a.id) })), [filtered])
  const recentHeroes = recentIds.flatMap(id => filtered.filter(hero => String(hero.id) === id))
  function choose(id: string) {
    if (disabled) return
    onSelect(id)
    if (id) {
      const next = [id, ...recentIds.filter(item => item !== id)].slice(0, 8)
      setRecentIds(next)
      try { localStorage.setItem('yys-cbg-inspector.calculator.recent-heroes', JSON.stringify(next.map(Number))) } catch { /* 不影响本次选择。 */ }
    }
    setOpen(false)
  }
  function heroButton(hero: HeroRecord) {
    const selected = String(hero.id) === heroId
    return <button key={hero.id} type="button" className={`${optionClass} ${selected ? selectedClass : unselectedClass}`} aria-pressed={selected} disabled={disabled} onClick={() => choose(String(hero.id))}>
      <HeroPortrait heroId={hero.id} size={48} />
      <span className="w-full break-words text-center leading-4">{hero.name}</span>
      {selected && <Check className="absolute top-1 right-1 size-3.5" aria-hidden="true" />}
    </button>
  }
  const heroName = selectedHero?.name || (heroId ? restoredHeroName || `式神 #${heroId}` : '等待式神资料')
  return <div className="grid gap-2 text-sm">
    <span id="calculator-hero-label">式神</span>
    <button type="button" className="field flex min-w-0 items-center gap-3 text-left hover:border-primary disabled:opacity-50" aria-labelledby="calculator-hero-label calculator-hero-name" aria-haspopup="dialog" disabled={disabled} onClick={() => { setSearch(''); setOpen(true) }}>
      {heroId ? <HeroPortrait heroId={Number(heroId)} size={36} /> : <UserRound className="size-7 shrink-0 text-primary" aria-hidden="true" />}
      <span id="calculator-hero-name" className="min-w-0 flex-1 break-words">{heroName}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
    {heroId && !selectedHero && <p className="text-xs text-muted-foreground">资料未加载，继续使用预设基础面板。</p>}
    <PickerDialog open={open} onOpenChange={setOpen} title="选择式神" description="搜索名称、编号或稀有度；选择后自动填入基础面板。" className="max-w-4xl!">
      <div className="space-y-5">
        <label className="flex items-center gap-2"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">搜索式神</span><input type="search" className="field w-full min-w-0" placeholder="搜索式神名称、编号或稀有度" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /></label>
        {recentHeroes.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-primary">最近选择</h3><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{recentHeroes.map(heroButton)}</div></section>}
        {groups.map(group => <section key={group.rarity}><h3 className="mb-2 text-sm font-semibold">{rarityLabels[group.rarity] || '其他式神'} <span className="font-normal text-muted-foreground">{group.heroes.length}</span></h3><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{group.heroes.map(heroButton)}</div></section>)}
        {!filtered.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{heroes.length ? '没有匹配的式神，请换个关键词。' : '式神资料尚未加载，请稍候或在导航菜单中更新资料。'}</p>}
      </div>
    </PickerDialog>
  </div>
}

export function CalculatorSuitPicker({ suits, fourPiece, twoPieceAttributes, omaTwoPieces, disabled, onFourPieceChange, onToggleAttribute, onToggleOma }: {
  suits: CalculatorSuitOption[]; fourPiece: string; twoPieceAttributes: string[]; omaTwoPieces: string[]; disabled: boolean
  onFourPieceChange: (name: string) => void; onToggleAttribute: (attribute: string) => void; onToggleOma: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<{ kind: 'fourPiece' | 'twoPieceAttribute' | 'omaTwoPiece'; value: string }[]>([])
  const twoPieceRef = useRef<HTMLElement>(null)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const stored: unknown = JSON.parse(localStorage.getItem('yys-cbg-inspector.calculator.recent-relics') || '[]')
        if (Array.isArray(stored)) setRecent(stored.filter((value): value is (typeof recent)[number] => Boolean(value && typeof value === 'object' && ['fourPiece', 'twoPieceAttribute', 'omaTwoPiece'].includes(value.kind) && typeof value.value === 'string' && value.value.length > 0 && value.value.length <= 200)).slice(0, 8))
      } catch { /* 最近记录不可用时不影响选择。 */ }
    })
    return () => { active = false }
  }, [])
  const twoPieceCount = twoPieceAttributes.length + omaTwoPieces.length
  const usedSlots = (fourPiece ? 4 : 0) + twoPieceCount * 2
  const ordinarySuits = suits.filter(suit => !suit.isOma)
  const fourPieceGroups = [...twoPieceAttributeOrder, ...new Set(ordinarySuits.map(suit => suit.twoPieceAttribute || '其他套装').filter(attribute => !twoPieceAttributeOrder.includes(attribute)))].map(attribute => ({ attribute, suits: ordinarySuits.filter(suit => (suit.twoPieceAttribute || '其他套装') === attribute) })).filter(group => group.suits.length)
  const omaSuits = suits.filter(suit => suit.isOma)
  const missingFourPiece = fourPiece && !ordinarySuits.some(suit => suit.name === fourPiece)
  const missingOma = omaTwoPieces.filter(name => !omaSuits.some(suit => suit.name === name))
  const attributes = [...new Set([...twoPieceAttributeOrder, ...twoPieceAttributes])]
  const selectedSuit = suits.find(suit => suit.name === fourPiece)
  const summary = [fourPiece && `4件 ${fourPiece}`, ...twoPieceAttributes.map(attribute => `2件 ${attribute}`), ...omaTwoPieces.map(name => `2件 ${name}`)].filter(Boolean).join(' · ') || '不限制套装'
  function choose(kind: (typeof recent)[number]['kind'], value: string) {
    if (disabled) return
    const selected = kind === 'fourPiece' ? fourPiece === value : kind === 'twoPieceAttribute' ? twoPieceAttributes.includes(value) : omaTwoPieces.includes(value)
    if (!selected && (kind === 'fourPiece' ? !fourPiece && twoPieceCount > 1 : usedSlots >= 6)) return
    if (kind === 'fourPiece') onFourPieceChange(selected ? '' : value)
    else if (kind === 'twoPieceAttribute') onToggleAttribute(value)
    else onToggleOma(value)
    if (!selected) {
      const next = [{ kind, value }, ...recent.filter(item => item.kind !== kind || item.value !== value)].slice(0, 8)
      setRecent(next)
      try { localStorage.setItem('yys-cbg-inspector.calculator.recent-relics', JSON.stringify(next)) } catch { /* 不影响本次选择。 */ }
      const nextSlots = kind === 'fourPiece' ? 4 + twoPieceCount * 2 : usedSlots + 2
      if (nextSlots === 6) setOpen(false)
      else if (kind === 'fourPiece' && window.matchMedia('(max-width: 1023px)').matches) requestAnimationFrame(() => twoPieceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }
  function suitButton(suit: CalculatorSuitOption, kind: 'four' | 'oma') {
    const selected = kind === 'four' ? fourPiece === suit.name : omaTwoPieces.includes(suit.name)
    const blocked = disabled || (!selected && (kind === 'four' ? !fourPiece && twoPieceCount > 1 : usedSlots >= 6))
    return <button type="button" key={suit.name} aria-pressed={selected} disabled={blocked} className={`${optionClass} ${selected ? selectedClass : unselectedClass}`} title={suit.twoPieceAttribute ? `${suit.name} · ${suit.twoPieceAttribute}` : suit.name} onClick={() => choose(kind === 'four' ? 'fourPiece' : 'omaTwoPiece', suit.name)}>
      <SuitIcon id={suit.id} size={38} /><span className="w-full break-words text-center leading-4">{suit.name}</span>{selected && <Check className="absolute top-1 right-1 size-3.5" aria-hidden="true" />}
    </button>
  }
  return <div className="grid gap-2 text-sm">
    <span id="calculator-suit-label">御魂类型</span>
    <button type="button" className="field flex min-w-0 items-center gap-2 text-left hover:border-primary disabled:opacity-50" aria-labelledby="calculator-suit-label calculator-suit-summary" aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
      {selectedSuit ? <SuitIcon id={selectedSuit.id} size={36} /> : <span className="shrink-0 rounded bg-primary/10 px-2 py-1 text-xs font-medium tabular-nums text-primary">{usedSlots}/6</span>}
      <span id="calculator-suit-summary" className="min-w-0 flex-1 break-words text-xs leading-5">{summary}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
    <PickerDialog open={open} onOpenChange={setOpen} title="选择御魂类型" description="四件套单选，两件套属性与逢魔套装可多选。每项两件套要求一组，共用六个御魂位置。" className="max-w-6xl!">
      <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold tabular-nums" aria-live="polite">已要求 {usedSlots} / 6 个位置</p><div className="flex gap-1" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className={`h-2 w-6 rounded-sm ${index < usedSlots ? 'bg-primary' : 'bg-border'}`} />)}</div></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">有四件套时最多再选一组两件套；不选四件套时，最多可选三组两件套。已满时可先取消一项。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {fourPiece && <button type="button" disabled={disabled} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`取消四件套${fourPiece}`} onClick={() => onFourPieceChange('')}><SuitIcon id={selectedSuit?.id} size={24} />4件 {fourPiece}<X className="size-3.5" aria-hidden="true" /></button>}
          {twoPieceAttributes.map(attribute => <button type="button" key={attribute} disabled={disabled} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`取消两件套属性${attribute}`} onClick={() => onToggleAttribute(attribute)}>2件 {attribute}<X className="size-3.5" aria-hidden="true" /></button>)}
          {omaTwoPieces.map(name => <button type="button" key={name} disabled={disabled} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`取消逢魔两件套${name}`} onClick={() => onToggleOma(name)}><SuitIcon id={suits.find(suit => suit.name === name)?.id} size={24} />2件 {name}<X className="size-3.5" aria-hidden="true" /></button>)}
        </div>
      </div>
      {recent.length > 0 && <section className="border-b border-border py-4"><h3 className="mb-2 text-sm font-semibold text-primary">最近选择</h3><div className="flex flex-wrap gap-2">{recent.flatMap(choice => {
        const suit = suits.find(item => item.name === choice.value && item.isOma === (choice.kind === 'omaTwoPiece'))
        if (choice.kind === 'twoPieceAttribute' ? !attributes.includes(choice.value) : !suit) return []
        const selected = choice.kind === 'fourPiece' ? fourPiece === choice.value : choice.kind === 'twoPieceAttribute' ? twoPieceAttributes.includes(choice.value) : omaTwoPieces.includes(choice.value)
        return [<button key={`${choice.kind}-${choice.value}`} type="button" className={`quiet-button border ${selected ? selectedClass : unselectedClass}`} aria-pressed={selected} disabled={disabled || (!selected && (choice.kind === 'fourPiece' ? !fourPiece && twoPieceCount > 1 : usedSlots >= 6))} onClick={() => choose(choice.kind, choice.value)}>{suit && <SuitIcon id={suit.id} size={24} />}{choice.kind === 'fourPiece' ? '4件' : '2件'} {choice.value}</button>]
      })}</div></section>}
      <div className="grid gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">四件套 · 单选</h3><button type="button" className="min-h-11 rounded px-2 text-xs text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring" disabled={disabled || !fourPiece} onClick={() => onFourPieceChange('')}>不限制四件套</button></div>
          <div className="space-y-4">{fourPieceGroups.map(group => <section key={group.attribute}><h4 className="mb-2 text-xs text-muted-foreground">{group.attribute}</h4><div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-6">{group.suits.map(suit => suitButton(suit, 'four'))}</div></section>)}</div>
          {!ordinarySuits.length && <p className="py-6 text-sm text-muted-foreground">套装目录尚未提供四件套资料。</p>}
          {missingFourPiece && <p className="mt-3 text-xs leading-5 text-muted-foreground">预设「{fourPiece}」在当前资料中无对应套装；已保留此条件，可在上方取消。</p>}
        </section>
        <section ref={twoPieceRef} className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5"><h3 className="mb-3 text-sm font-semibold">两件套属性 · 多选</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {attributes.map(attribute => {
            const selected = twoPieceAttributes.includes(attribute)
            const groupSuits = ordinarySuits.filter(suit => suit.twoPieceAttribute === attribute)
            return <button type="button" key={attribute} aria-pressed={selected} disabled={disabled || (!selected && usedSlots >= 6)} className={`flex min-h-14 flex-col items-start gap-1.5 rounded-lg border p-2 text-left text-xs transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 ${selected ? selectedClass : unselectedClass}`} onClick={() => choose('twoPieceAttribute', attribute)}><span className="flex w-full items-center justify-between gap-1">{attribute}{selected && <Check className="size-3.5" aria-hidden="true" />}</span>{groupSuits.length > 0 && <span className="flex flex-wrap gap-1" aria-hidden="true">{groupSuits.map(suit => <SuitIcon key={suit.name} id={suit.id} size={24} />)}</span>}</button>
          })}
        </div><h3 className="mt-6 mb-3 text-sm font-semibold">逢魔两件套 · 按名称多选</h3><div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-3">{omaSuits.map(suit => suitButton(suit, 'oma'))}</div>
          {!omaSuits.length && <p className="text-xs leading-5 text-muted-foreground">套装目录尚未提供逢魔两件套资料。</p>}
          {missingOma.length > 0 && <p className="mt-3 text-xs leading-5 text-muted-foreground">预设「{missingOma.join('、')}」在当前资料中无对应套装；已保留条件，可在上方取消。</p>}
        </section>
      </div>
      <footer className="sticky bottom-0 flex justify-end border-t border-border bg-background p-3 sm:px-5"><button type="button" className="primary-button" onClick={() => setOpen(false)}>完成选择</button></footer>
    </PickerDialog>
  </div>
}
