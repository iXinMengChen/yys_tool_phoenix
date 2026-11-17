'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { BookmarkPlus, Play, Settings2, Square, Trash2 } from 'lucide-react'
import type { CalculatorMetric, CalculatorProgress, CalculatorResult, CbgStaticData, HeroStaticPayload, RelicDataset, RelicCalculationRequest } from '@phoenix/types'
import { defaultExtraAttributes, extraAttributeFields, getTheoreticalRelicPanelRange, isMetricSubAttribute, mainAttributeOptions, metricOptions, panelAttributeAliases, panelFields } from '@phoenix/utils'
import { RelicCard } from '../components/RelicCard'
import { HeroPortrait } from '../components/GameIcon'
import { PickerDialog } from '../components/PickerDialog'
import { FilterOption } from '../components/FilterOption'
import { CalculatorHeroPicker, CalculatorSuitPicker, type CalculatorSuitOption } from './CalculatorPickers'
import { CalculatorShortcuts } from './CalculatorShortcuts'
import { CalculatorMethodInfo } from './CalculatorMethodInfo'
import { calculatorLibraryKey, createId, parseCalculatorLibrary } from './calculatorState'
import type { CalculatorConfig, CalculatorLibrary, MainAttributes } from './calculatorState'

const numeric = z.coerce.number().finite().min(0).max(10000000)
const optionalNumeric = z.union([z.literal(''), z.coerce.number().finite().min(0).max(10000000)])
const schema = z.object({
  heroId: z.string(), metric: z.enum(['attack', 'health', 'defense', 'speed', 'critRate', 'critDamage', 'effectHit', 'effectResistance', 'hitResistance', 'damage', 'healing', 'defenseOutput']),
  fourPiece: z.string(), resultLimit: z.coerce.number().int().min(1).max(50),
  attack: numeric, health: numeric, defense: numeric, speed: numeric, critRate: numeric, critDamage: numeric, effectHit: numeric, effectResistance: numeric,
  minAttack: optionalNumeric, minHealth: optionalNumeric, minDefense: optionalNumeric, minSpeed: optionalNumeric, minCritRate: optionalNumeric, minCritDamage: optionalNumeric, minEffectHit: optionalNumeric, minEffectResistance: optionalNumeric,
  maxAttack: optionalNumeric, maxHealth: optionalNumeric, maxDefense: optionalNumeric, maxSpeed: optionalNumeric, maxCritRate: optionalNumeric, maxCritDamage: optionalNumeric, maxEffectHit: optionalNumeric, maxEffectResistance: optionalNumeric,
  extraAttackPercent: numeric, extraHealthPercent: numeric, extraDefensePercent: numeric, extraSpeed: numeric, extraCritRate: numeric, extraCritDamage: numeric, extraEffectHit: numeric, extraEffectResistance: numeric,
})
type FormValues = z.output<typeof schema>
type FormInput = z.input<typeof schema>
type ConstraintField = 'minAttack' | 'minHealth' | 'minDefense' | 'minSpeed' | 'minCritRate' | 'minCritDamage' | 'minEffectHit' | 'minEffectResistance' | 'maxAttack' | 'maxHealth' | 'maxDefense' | 'maxSpeed' | 'maxCritRate' | 'maxCritDamage' | 'maxEffectHit' | 'maxEffectResistance'
type ExtraField = 'extraAttackPercent' | 'extraHealthPercent' | 'extraDefensePercent' | 'extraSpeed' | 'extraCritRate' | 'extraCritDamage' | 'extraEffectHit' | 'extraEffectResistance'
type ResultContext = { heroId: string; heroName: string; baseStats: RelicCalculationRequest['baseStats']; panelConstraints: RelicCalculationRequest['filters']['panelConstraints'] }
type SavedResult = { id: string; label: string; metric: CalculatorMetric; result: CalculatorResult; context?: ResultContext; isExcluded: boolean }
const defaultValues: FormValues = {
  heroId: '', metric: 'damage', fourPiece: '', resultLimit: 5,
  attack: 0, health: 0, defense: 0, speed: 100, critRate: 0, critDamage: 150, effectHit: 0, effectResistance: 0,
  minAttack: '', minHealth: '', minDefense: '', minSpeed: '', minCritRate: '', minCritDamage: '', minEffectHit: '', minEffectResistance: '',
  maxAttack: '', maxHealth: '', maxDefense: '', maxSpeed: '', maxCritRate: '', maxCritDamage: '', maxEffectHit: '', maxEffectResistance: '',
  extraAttackPercent: 0, extraHealthPercent: 0, extraDefensePercent: 0, extraSpeed: 0, extraCritRate: 0, extraCritDamage: 0, extraEffectHit: 0, extraEffectResistance: 0,
}
function constraintField(prefix: 'min' | 'max', key: string) { return `${prefix}${key[0].toUpperCase()}${key.slice(1)}` as ConstraintField }
function extraField(key: string) { return `extra${key[0].toUpperCase()}${key.slice(1)}` as ExtraField }
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter(item => item !== value) : [...values, value] }

export default function CalculatorPage({ dataset, heroes, staticData }: { dataset: RelicDataset; heroes?: HeroStaticPayload; staticData?: CbgStaticData | null }) {
  const defaultHero = Object.values(heroes?.heroesById || {}).find(hero => hero.name === '须佐之男')
  const { register, control, handleSubmit, setValue, getValues, reset, formState: { errors } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { ...defaultValues, ...defaultHero?.baseStats, heroId: defaultHero ? String(defaultHero.id) : '' } })
  const selectedHeroId = useWatch({ control, name: 'heroId' })
  const selectedFourPiece = useWatch({ control, name: 'fourPiece' })
  const [restoredHeroName, setRestoredHeroName] = useState('')
  const [mainAttributes, setMainAttributes] = useState<MainAttributes>(() => Object.fromEntries(([2, 4, 6] as const).map(position => [position, mainAttributeOptions[position]])))
  const [twoPieceAttributes, setTwoPieceAttributes] = useState<string[]>([])
  const [twoPieceNames, setTwoPieceNames] = useState<string[]>([])
  const [results, setResults] = useState<CalculatorResult[] | null>(null)
  const [resultMetric, setResultMetric] = useState<CalculatorMetric>('damage')
  const [resultContext, setResultContext] = useState<ResultContext>()
  const [savedResults, setSavedResults] = useState<SavedResult[]>([])
  const [library, setLibrary] = useState<CalculatorLibrary>({ singles: [] })
  const [isLibraryReady, setIsLibraryReady] = useState(false)
  const [singleLabel, setSingleLabel] = useState('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [isFastMode, setIsFastMode] = useState(false)
  const [status, setStatus] = useState('')
  const [elapsed, setElapsed] = useState<number>()
  const [progress, setProgress] = useState<CalculatorProgress | null>(null)
  const [isExtraOpen, setIsExtraOpen] = useState(false)
  const [libraryDialog, setLibraryDialog] = useState<'config' | 'saveConfig' | 'relics' | 'exclude' | null>(null)
  const [selectedSavedId, setSelectedSavedId] = useState<string>()
  const [excludedDraft, setExcludedDraft] = useState<string[]>([])
  const watchedValues = useWatch({ control })
  const currentPanelRanges = Object.fromEntries(panelFields.flatMap(({ key }) => {
    const min = watchedValues[constraintField('min', key)], max = watchedValues[constraintField('max', key)]
    return min === '' && max === '' ? [] : [[key, { min: min === '' || min === undefined ? undefined : Number(min), max: max === '' || max === undefined ? undefined : Number(max) }]]
  }))
  const selectedSaved = savedResults.find(saved => saved.id === selectedSavedId)
  const savedRelicCount = new Set(savedResults.flatMap(saved => saved.result.relics.map(relic => String(relic.id)))).size
  const worker = useRef<Worker | null>(null)
  const relicsByPosition = useMemo(() => Object.fromEntries(Object.entries(dataset.relicsByPosition).map(([position, relics]) => [position, relics.map((relic, index) => relic.id ? relic : { ...relic, id: `calculator-${position}-${index}` })])), [dataset])
  const allRelics = useMemo(() => Object.values(relicsByPosition).flat(), [relicsByPosition])
  const suitOptions = useMemo(() => {
    const options = new Map<string, CalculatorSuitOption>()
    for (const relic of allRelics) if (relic.suit) options.set(relic.suit.name, { id: relic.suit.id, name: relic.suit.name, twoPieceAttribute: relic.suit.twoPieceAttribute, isOma: Boolean(relic.suit.isTwoPieceSet || relic.setBonusAttribute) })
    const config = staticData?.relicSuits
    const omaIds = new Set(Object.keys(config?.two_suit_yuhun || {}).map(Number))
    for (const [id, name, , twoPieceAttribute] of config?.yuhun_list || []) options.set(name, { id: Number(id), name, twoPieceAttribute, isOma: omaIds.has(Number(id)) })
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [allRelics, staticData?.relicSuits])
  const suitAttributes = useMemo(() => Object.fromEntries(suitOptions.flatMap(suit => suit.twoPieceAttribute && !suit.isOma ? [[suit.name, suit.twoPieceAttribute]] : [])), [suitOptions])
  const heroOptions = useMemo(() => Object.values(heroes?.heroesById || {}).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), [heroes])
  const excludedIds = useMemo(() => new Set(savedResults.filter(saved => saved.isExcluded).flatMap(saved => saved.result.relics.map(relic => String(relic.id)))), [savedResults])

  useEffect(() => {
    if (!defaultHero || getValues('heroId')) return
    setValue('heroId', String(defaultHero.id))
    panelFields.forEach(({ key }) => setValue(key, defaultHero.baseStats[key]))
  }, [defaultHero, getValues, setValue])
  useEffect(() => () => { worker.current?.terminate(); worker.current = null }, [])
  useEffect(() => {
    let isActive = true
    queueMicrotask(() => {
      if (!isActive) return
      try { setLibrary(parseCalculatorLibrary(window.localStorage.getItem(calculatorLibraryKey))) }
      catch { setStatus('无法读取已保存的配置；仍可设置条件并计算。') }
      setIsLibraryReady(true)
    })
    return () => { isActive = false }
  }, [])

  function invalidate() {
    worker.current?.terminate()
    worker.current = null
    setIsCalculating(false)
    setResults(null)
    setElapsed(undefined)
    setProgress(null)
  }
  function clearPanelRanges() {
    for (const { key } of panelFields) {
      setValue(constraintField('min', key), Number(getValues(key)) || 0)
      setValue(constraintField('max', key), '')
    }
  }
  function applyPanelShortcut(ranges: NonNullable<RelicCalculationRequest['filters']['panelConstraints']>) {
    const active = panelFields.every(({ key }) => {
      const range = ranges[key]
      return !range || ((range.min === undefined || currentPanelRanges[key]?.min === range.min) && (range.max === undefined || currentPanelRanges[key]?.max === range.max))
    })
    for (const { key } of panelFields) {
      const range = ranges[key]
      if (!range) continue
      const base = Number(getValues(key)) || 0
      const min = active ? base : Math.max(range.min ?? base, base)
      const previousMax = getValues(constraintField('max', key))
      const max = active ? '' : range.max !== undefined ? Math.max(range.max, min) : previousMax === '' ? '' : Math.max(Number(previousMax), min)
      setValue(constraintField('min', key), min)
      setValue(constraintField('max', key), max)
    }
  }
  function selectHero(id: string) {
    setValue('heroId', id)
    const hero = heroes?.heroesById?.[id]
    setRestoredHeroName(hero?.name || '')
    if (hero) panelFields.forEach(({ key }) => {
      setValue(key, hero.baseStats[key])
      setValue(constraintField('min', key), hero.baseStats[key])
      setValue(constraintField('max', key), '')
    })
  }
  function validate(values: FormValues) {
    for (const { key, label } of panelFields) {
      const min = values[constraintField('min', key)], max = values[constraintField('max', key)]
      if (min !== '' && max !== '' && min > max) { setStatus(`${label}的下限不能大于上限。`); return false }
    }
    if (twoPieceAttributes.length + twoPieceNames.length > (values.fourPiece ? 1 : 3)) {
      setStatus(values.fourPiece ? '四件套之外最多再要求一个两件套。' : '六个位置最多容纳三个两件套。')
      return false
    }
    return true
  }
  function makeRequest(values: FormValues, fastMode = false): RelicCalculationRequest {
    const baseStats = Object.fromEntries(panelFields.map(({ key }) => [key, values[key]])) as RelicCalculationRequest['baseStats']
    const panelConstraints = Object.fromEntries(panelFields.flatMap(({ key }) => {
      const min = values[constraintField('min', key)], max = values[constraintField('max', key)]
      return min === '' && max === '' ? [] : [[key, { min: min === '' ? undefined : min, max: max === '' ? undefined : max }]]
    }))
    return {
      relicsByPosition, baseStats, metric: values.metric,
      filters: {
        quality: 6, level: 15, fastMode, mainAttributes, excludedRelicIds: excludedIds,
        requiredFourPiece: values.fourPiece || undefined,
        requiredTwoPieceNames: new Set(twoPieceNames), requiredTwoPieceAttributes: new Set(twoPieceAttributes),
        suitTwoPieceAttributes: new Map(Object.entries(suitAttributes)), panelConstraints,
        extraAttributes: Object.fromEntries(extraAttributeFields.map(({ key }) => [key, values[extraField(key)]])),
      }, resultLimit: fastMode ? 1 : values.resultLimit,
    }
  }
  function run(request: RelicCalculationRequest) {
    invalidate()
    setStatus('正在搜索六个位置的御魂组合…')
    setIsCalculating(true)
    const startedAt = performance.now()
    try {
      const current = new Worker(new URL('../calculator.worker.ts', import.meta.url), { type: 'module' })
      worker.current = current
      function finish() { current.terminate(); if (worker.current === current) { worker.current = null; setIsCalculating(false) } }
      current.onmessage = (event: MessageEvent<
        | { type: 'progress'; progress: CalculatorProgress }
        | { type: 'results'; results: CalculatorResult[] }
        | { type: 'error'; message: string }
      >) => {
        if (worker.current !== current) return
        const data = event.data
        if (data.type === 'results') {
          setResults(data.results || [])
          setElapsed(performance.now() - startedAt)
          setStatus(data.results?.length ? `已找到 ${data.results.length} 组候选搭配。` : '没有满足条件的组合，试试放宽面板或套装条件。')
          finish()
        } else if (data.type === 'error') { setResults(null); setStatus(data.message || '计算失败'); finish() }
        else if (data.type === 'progress') {
          setProgress(data.progress)
          setElapsed(performance.now() - startedAt)
          if (data.progress.results) setResults(data.progress.results.filter(result => result.relics.length === 6))
        }
      }
      current.onerror = () => { if (worker.current === current) { setResults(null); setStatus('计算未能启动，请重试。'); finish() } }
      current.postMessage({ type: 'single', request })
    } catch {
      worker.current?.terminate()
      worker.current = null
      setIsCalculating(false)
      setStatus('计算未能启动，请重试。')
    }
  }
  function startSingle(values: FormValues, fastMode = false) {
    if (isCalculating || !validate(values)) return
    if (values.attack === 0 && values.metric === 'damage') { setStatus('请先选择式神或填写基础攻击。'); return }
    const request = makeRequest(values, fastMode)
    setResultMetric(values.metric)
    setResultContext({ heroId: values.heroId, heroName: heroes?.heroesById?.[values.heroId]?.name || restoredHeroName || '自定义基础面板', baseStats: request.baseStats, panelConstraints: request.filters.panelConstraints })
    run(request)
  }
  function applyConfig(config: CalculatorConfig) {
    const values: FormValues = { ...defaultValues, ...config.baseStats, heroId: config.heroId ? String(config.heroId) : '', metric: config.metric, fourPiece: config.relicSuitSelection.fourPiece || '', resultLimit: config.resultLimit }
    for (const { key } of panelFields) {
      values[constraintField('min', key)] = config.constraints[key]?.min ?? ''
      values[constraintField('max', key)] = config.constraints[key]?.max ?? ''
    }
    for (const { key } of extraAttributeFields) values[extraField(key)] = config.extraAttributes[key]
    reset(values)
    setRestoredHeroName(config.heroName)
    setMainAttributes(structuredClone(config.mainAttributes))
    setTwoPieceAttributes([...config.relicSuitSelection.twoPieceAttributes])
    setTwoPieceNames([...config.relicSuitSelection.omaTwoPieces])
  }
  function persistLibrary(next: CalculatorLibrary) {
    try { window.localStorage.setItem(calculatorLibraryKey, JSON.stringify(next)); setLibrary(next); return true }
    catch { setStatus('无法保存配置，请检查浏览器存储空间或权限后重试。'); return false }
  }
  function saveSingleConfig(values: FormValues) {
    if (!validate(values)) return
    const label = singleLabel.trim()
    if (!label) { setStatus('请先填写单人配置名称。'); return }
    const existing = library.singles.find(item => item.label === label)
    if (!existing && library.singles.length >= 50) { setStatus('单人配置最多 50 套，请先删除不再使用的配置。'); return }
    const request = makeRequest(values)
    const config: CalculatorConfig = {
      id: existing?.id || createId(), label, heroId: values.heroId ? Number(values.heroId) : undefined,
      heroName: heroes?.heroesById?.[values.heroId]?.name || restoredHeroName || '自定义面板', baseStats: request.baseStats,
      metric: values.metric, resultLimit: values.resultLimit, constraints: request.filters.panelConstraints || {},
      extraAttributes: { ...defaultExtraAttributes, ...request.filters.extraAttributes }, mainAttributes: structuredClone(mainAttributes),
      relicSuitSelection: { fourPiece: values.fourPiece || undefined, twoPieceAttributes: [...twoPieceAttributes], omaTwoPieces: [...twoPieceNames] },
    }
    const singles = existing ? library.singles.map(item => item.id === existing.id ? config : item) : [...library.singles, config]
    if (persistLibrary({ singles })) { setStatus(`已${existing ? '覆盖' : '保存'}单人配置「${label}」。`); setLibraryDialog(null) }
  }
  function saveResult(result: CalculatorResult, label: string, metric: CalculatorMetric) {
    if (!label.trim()) { setStatus('请先填写方案名称。'); return }
    setSavedResults(previous => [...previous, { id: createId(), label: label.trim(), metric, result, context: resultContext, isExcluded: true }])
    setStatus(`方案「${label.trim()}」已保存；后续计算会排除其中御魂。离开本页、刷新或切换账号后将清除。`)
  }

  const summaryHeroId = selectedHeroId || ''
  const summaryHeroName = heroes?.heroesById?.[selectedHeroId || '']?.name || restoredHeroName || '自定义基础面板'
  const summarySuits = [selectedFourPiece && `4件 ${selectedFourPiece}`, ...twoPieceAttributes.map(value => `2件 ${value}`), ...twoPieceNames.map(value => `2件 ${value}`)].filter(Boolean)
  return <div className="page-stack calculator-page">
    <header className="analysis-header">
      <h1>御魂计算器</h1>
      <p className="calculator-source text-xs text-muted-foreground">御魂来源：{dataset?.account?.name || dataset?.account?.title || '未命名账号'}{dataset?.account?.serverName ? ` · ${dataset.account.serverName}` : ''} · {Object.values(relicsByPosition).reduce((count, relics) => count + relics.length, 0).toLocaleString('zh-CN')} 件</p>
    </header>
    <form className="work-panel calculator-form" onSubmit={event => { void handleSubmit(values => startSingle(values, isFastMode))(event) }}>
      <div className="mb-3"><h2 className="section-heading">配置计算条件</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">使用六星 +15 御魂。伤害指标为攻击 × 暴伤；需要满暴时请设置暴击下限 100。</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CalculatorHeroPicker heroes={heroOptions} heroId={selectedHeroId || ''} restoredHeroName={restoredHeroName} disabled={isCalculating} onSelect={selectHero} />
        <label className="grid gap-1 text-sm">计算目标<select className="field" {...register('metric')}>{metricOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <CalculatorSuitPicker suits={suitOptions} fourPiece={selectedFourPiece || ''} twoPieceAttributes={twoPieceAttributes} omaTwoPieces={twoPieceNames} disabled={isCalculating}
          onFourPieceChange={name => { if (!name || selectedFourPiece || twoPieceAttributes.length + twoPieceNames.length <= 1) setValue('fourPiece', name) }}
          onToggleAttribute={attribute => setTwoPieceAttributes(previous => previous.includes(attribute) || previous.length + twoPieceNames.length < (selectedFourPiece ? 1 : 3) ? toggle(previous, attribute) : previous)}
          onToggleOma={name => setTwoPieceNames(previous => previous.includes(name) || previous.length + twoPieceAttributes.length < (selectedFourPiece ? 1 : 3) ? toggle(previous, name) : previous)} />
      </div>
      <fieldset className="calculator-condition-group"><legend className="mb-2 text-sm font-medium">主属性 <span className="font-normal text-muted-foreground">不选即不限，可多选</span></legend><CalculatorShortcuts kind="main" mainAttributes={mainAttributes} panelRanges={currentPanelRanges} disabled={isCalculating} onMainChange={setMainAttributes} onPanelApply={applyPanelShortcut} onPanelClear={clearPanelRanges} /><div className="grid gap-3 lg:grid-cols-3">{([2, 4, 6] as const).map(position => <div key={position}><p className="mb-2 text-xs text-muted-foreground">{position} 号位</p><div className="flex flex-wrap gap-2">{mainAttributeOptions[position].map(label => <FilterOption key={label} checked={mainAttributes[position]?.includes(label) || false} onChange={() => setMainAttributes(previous => ({ ...previous, [position]: toggle(previous[position] || [], label) }))}>{label}</FilterOption>)}</div></div>)}</div></fieldset>
      <fieldset className="calculator-condition-group">
        <legend className="mb-2 text-sm font-medium">最终面板范围</legend>
        <CalculatorShortcuts kind="panel" mainAttributes={mainAttributes} panelRanges={currentPanelRanges} disabled={isCalculating} onMainChange={setMainAttributes} onPanelApply={applyPanelShortcut} onPanelClear={clearPanelRanges} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{panelFields.map(({ key, label, suffix }) => {
          const base = Math.max(0, Number(watchedValues[key]) || 0)
          const range = getTheoreticalRelicPanelRange(key, base)
          const extra = key === 'attack' || key === 'health' || key === 'defense'
            ? base * Math.max(0, Number(watchedValues[extraField(`${key}Percent`)]) || 0) / 100
            : Math.max(0, Number(watchedValues[extraField(key)]) || 0)
          const display = (value: number) => String(Number(value.toFixed(2)))
          return <div key={key} className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground">{label}{suffix}</p>
            <div className="flex items-center gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted-foreground">下限<input type="number" step="any" min="0" placeholder={display(base + extra + range.min)} className="field w-full min-w-0" aria-label={`${label}下限`} {...register(constraintField('min', key))} /></label>
              <span className="pt-5 text-muted-foreground" aria-hidden="true">–</span>
              <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted-foreground">上限<input type="number" step="any" min="0" placeholder={display(base + extra + range.max)} className="field w-full min-w-0" aria-label={`${label}上限`} {...register(constraintField('max', key))} /></label>
            </div>
          </div>
        })}</div>
      </fieldset>
      <div className="mt-4 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="quiet-button" aria-expanded={isExtraOpen} aria-controls="calculator-extra-attributes" onClick={() => setIsExtraOpen(previous => !previous)}><Settings2 size={15} />额外属性 · {isExtraOpen ? '收起' : '展开'}</button><button type="button" className="quiet-button text-muted-foreground" disabled={isCalculating} onClick={() => { for (const { key } of extraAttributeFields) setValue(extraField(key), defaultExtraAttributes[key]) }}>清空额外属性</button></div><fieldset id="calculator-extra-attributes" hidden={!isExtraOpen} className="mt-3"><legend className="sr-only">额外属性</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{extraAttributeFields.map(({ key, label, suffix }) => <label key={key} className="grid gap-1 text-xs text-muted-foreground">额外{label}{suffix}<input type="number" min="0" step="any" className="field w-full" {...register(extraField(key))} /></label>)}</div></fieldset></div>
      <div className="calculator-actions">
        <label className="grid gap-1 text-xs text-muted-foreground">最多返回<input type="number" min="1" max="50" className="field w-24" {...register('resultLimit')} /></label>
        <div className="calculator-mode">
        <label className="relative flex min-h-11 cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-50">
          <input type="checkbox" role="switch" className="peer sr-only" checked={isFastMode} disabled={isCalculating} onChange={event => setIsFastMode(event.target.checked)} aria-describedby="calculator-fast-hint" />
          <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-muted-foreground transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
          极速计算
        </label>
        <span id="calculator-fast-hint" hidden={!isFastMode} className="text-xs text-muted-foreground">只返回最优的 1 组</span>
        </div>
        <button className="primary-button calculator-start" disabled={isCalculating}><Play size={15} />开始单人计算</button>
        {isCalculating && <button type="button" className="quiet-button" onClick={() => { invalidate(); setStatus('计算已停止。') }}><Square size={14} />停止</button>}
      </div>
      {Object.keys(errors).length > 0 && <p role="alert" className="mt-4 text-sm text-destructive">请输入有效的非负面板数值，结果数需为 1–50。</p>}
      <div className="calculator-library">
        <button type="button" className="quiet-button" disabled={isCalculating || !isLibraryReady} onClick={() => { setSingleLabel(''); setStatus(''); setLibraryDialog('saveConfig') }}><BookmarkPlus size={15} />保存配置</button>
        <button type="button" className="quiet-button" disabled={isCalculating || !isLibraryReady} onClick={() => setLibraryDialog('config')}>已保存配置 · {library.singles.length}</button>
        <button type="button" className="quiet-button" disabled={isCalculating} onClick={() => { setSelectedSavedId(undefined); setLibraryDialog('relics') }}>已保存御魂 · {savedRelicCount}</button>
        <button type="button" className="quiet-button" disabled={isCalculating} onClick={() => { setExcludedDraft(savedResults.filter(saved => saved.isExcluded).map(saved => saved.id)); setLibraryDialog('exclude') }}>排除御魂 · {excludedIds.size}</button>
      </div>
    </form>

    {status && <p role="status" className="text-sm leading-6 text-muted-foreground">{status}</p>}
    {isCalculating && <section aria-label="计算过程" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status">计算过程 · {({ preparing: '筛选御魂', matching: '搜索组合', validating: '校验面板', ranking: '排列结果' } as const)[progress?.stage || 'matching']}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{progress && progress.totalRelics > 0 ? `本阶段已处理 ${progress.processedRelics.toLocaleString('zh-CN')} / ${progress.totalRelics.toLocaleString('zh-CN')}` : '正在准备搜索…'}{elapsed !== undefined && ` · ${(elapsed / 1000).toFixed(1)} 秒`}</span>
      </div>
      <progress className="h-2 w-full accent-primary" aria-label="当前计算阶段进度" max={progress?.totalRelics || 1} value={progress && progress.totalRelics > 0 ? progress.processedRelics : undefined} />
    </section>}
    <section className="work-panel calculator-results">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3">{summaryHeroId && <HeroPortrait heroId={Number(summaryHeroId)} size={44} />}<div><h2 className="section-heading">{summaryHeroName}</h2><p className="mt-1 text-xs text-muted-foreground">{metricOptions.find(option => option.value === watchedValues.metric)?.label} · 六星 +15 · {isCalculating ? '计算中' : elapsed === undefined ? '尚未计算' : `耗时 ${(elapsed / 1000).toFixed(2)} 秒`}</p></div></div><div className="flex flex-wrap gap-2">{summarySuits.length ? summarySuits.map(value => <span key={value} className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{value}</span>) : <span className="text-xs text-muted-foreground">不限套装</span>}</div></div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{isCalculating ? '计算中的候选组合' : '最优组合'}{results ? `（${results.length} 组）` : ''}</h3><p className="text-xs text-muted-foreground">极速计算只返回 1 组，普通计算按设定数量返回。</p></div>
      {results?.length ? <ResultList results={results} metric={resultMetric} context={resultContext} onSave={isCalculating ? undefined : saveResult} /> : <p className="calculator-empty">{isCalculating ? '正在计算，请稍候…' : results ? '没有找到满足条件的组合。' : '设置条件后开始计算。'}</p>}
    </section>
    <CalculatorMethodInfo />
    <ConfigLibrary items={library.singles} label={singleLabel} onLabelChange={setSingleLabel} disabled={isCalculating || !isLibraryReady} mode={libraryDialog === 'config' || libraryDialog === 'saveConfig' ? libraryDialog : null} onClose={() => setLibraryDialog(null)} status={status}
      onSave={() => { void handleSubmit(saveSingleConfig, () => setStatus('请先检查计算条件中的数值。'))() }}
      onApply={id => { const config = library.singles.find(item => item.id === id); if (!config) return; invalidate(); applyConfig(config); setSingleLabel(config.label); setLibraryDialog(null); setStatus(`已应用单人配置「${config.label}」。`) }}
      onDelete={id => { if (persistLibrary({ singles: library.singles.filter(item => item.id !== id) })) setStatus('已删除单人配置，当前条件不变。') }} />
    <PickerDialog open={libraryDialog === 'relics'} onOpenChange={open => { if (!open) setLibraryDialog(null) }} title={selectedSaved ? selectedSaved.label : '已保存御魂'} description="方案和御魂仅在本次页面访问期间保留；离开本页、刷新或切换账号后将清除。" className={selectedSaved ? 'max-w-5xl!' : 'max-w-2xl!'}>
      {selectedSaved ? <><div className="mb-4 flex items-center justify-between gap-2"><button type="button" className="quiet-button" onClick={() => setSelectedSavedId(undefined)}>返回方案列表</button><button type="button" className="quiet-button" disabled={isCalculating} onClick={() => { setSavedResults(previous => previous.filter(item => item.id !== selectedSaved.id)); setSelectedSavedId(undefined); setStatus('已删除保存方案；没有被其他方案排除的御魂已恢复可用。') }}><Trash2 size={15} />删除这组御魂</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selectedSaved.result.relics.map((relic, index) => <RelicCard key={relic.id || index} relic={relic} />)}</div></> : savedResults.length ? <ul className="divide-y divide-border">{savedResults.map(saved => <li key={saved.id} className="flex items-center justify-between gap-2 py-2"><button type="button" className="quiet-button min-w-0 flex-1 justify-start text-left" onClick={() => setSelectedSavedId(saved.id)}><span className="break-words">{saved.label} · {saved.result.relics.length} 件{saved.isExcluded ? ' · 已排除' : ''}</span></button><button type="button" className="quiet-button" disabled={isCalculating} aria-label={`删除方案${saved.label}并恢复御魂`} onClick={() => { setSavedResults(previous => previous.filter(item => item.id !== saved.id)); setStatus('已删除保存方案；没有被其他方案排除的御魂已恢复可用。') }}><Trash2 size={15} /></button></li>)}</ul> : <p className="py-8 text-center text-sm text-muted-foreground">暂无保存的御魂。计算完成后可从结果行保存方案。</p>}
    </PickerDialog>
    <PickerDialog open={libraryDialog === 'exclude'} onOpenChange={open => { if (!open) setLibraryDialog(null) }} title="排除御魂" description="选择要排除的已保存方案。计算时不会使用其中御魂；共享御魂仍以其他已排除方案为准。" className="max-w-2xl!">
      <p className="mb-3 text-sm">已选择 {excludedDraft.length} 个方案</p>
      {savedResults.length ? <div className="space-y-2">{savedResults.map(saved => <FilterOption key={saved.id} className="w-full justify-start p-3 md:py-3" checked={excludedDraft.includes(saved.id)} onChange={() => setExcludedDraft(previous => toggle(previous, saved.id))}><span className="break-words">{saved.label} · {saved.result.relics.length} 件御魂</span></FilterOption>)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">暂无保存的御魂方案。</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setExcludedDraft([])}>清空已选</button><button type="button" className="quiet-button" onClick={() => setLibraryDialog(null)}>取消</button><button type="button" className="primary-button" disabled={isCalculating} onClick={() => { setSavedResults(previous => previous.map(saved => ({ ...saved, isExcluded: excludedDraft.includes(saved.id) }))); setLibraryDialog(null); setStatus('已更新排除范围，将对后续计算生效。') }}>应用排除</button></div>
    </PickerDialog>
  </div>
}

function ConfigLibrary({ items, label, onLabelChange, disabled, mode, onClose, status, onSave, onApply, onDelete }: {
  items: CalculatorConfig[]; label: string; onLabelChange: (value: string) => void; disabled: boolean; mode: 'config' | 'saveConfig' | null; onClose: () => void; status: string
  onSave: () => void; onApply: (id: string) => void; onDelete: (id: string) => void
}) {
  return <>
    <PickerDialog open={mode === 'saveConfig'} onOpenChange={open => { if (!open) onClose() }} title="保存当前快捷配置" description="仅保存条件与基础面板，不保存账号御魂。配置存于此浏览器，可跨账号应用；同名保存会覆盖。" className="max-w-md!">
      <label className="grid gap-1 text-sm">配置名称<input className="field" maxLength={200} value={label} onChange={event => onLabelChange(event.target.value)} /></label>
      {items.some(item => item.label === label.trim()) && <p className="mt-3 text-xs text-muted-foreground">同名配置将直接覆盖原有内容。</p>}
      {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className="quiet-button" onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={disabled || !label.trim()} onClick={onSave}><BookmarkPlus size={15} />{items.some(item => item.label === label.trim()) ? '覆盖保存' : '保存'}</button></div>
    </PickerDialog>
    <PickerDialog open={mode === 'config'} onOpenChange={open => { if (!open) onClose() }} title={`已保存配置 · ${items.length} / 50`} className="max-w-2xl!">
      {!items.length && <p className="py-8 text-center text-sm text-muted-foreground">尚未保存配置。</p>}
      <ul className="divide-y divide-border">{items.map(item => <li key={item.id} className="flex items-center gap-2 py-3 text-sm"><button type="button" className="grid min-w-0 flex-1 gap-1 rounded-lg border border-border p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring" disabled={disabled} onClick={() => onApply(item.id)}><strong className="break-words">{item.label}</strong><span className="text-xs text-muted-foreground">{item.heroName} · {metricOptions.find(option => option.value === item.metric)?.label}</span><span className="break-words text-xs text-muted-foreground">{[item.relicSuitSelection.fourPiece && `4件 ${item.relicSuitSelection.fourPiece}`, ...item.relicSuitSelection.twoPieceAttributes, ...item.relicSuitSelection.omaTwoPieces].filter(Boolean).join(' · ') || '不限套装'}</span><span className="break-words text-xs text-muted-foreground">{([2, 4, 6] as const).map(position => `${position}号位 ${(item.mainAttributes[position] || []).join(' / ') || '不限'}`).join(' · ')}</span>{Object.keys(item.constraints).length > 0 && <span className="break-words text-xs text-primary">{panelFields.flatMap(({ key, label, suffix }) => { const range = item.constraints[key]; return range ? [`${label} ${range.min ?? '不限'}–${range.max ?? '不限'}${suffix || ''}`] : [] }).join(' · ')}</span>}</button><button type="button" className="quiet-button shrink-0" disabled={disabled} aria-label={`删除配置${item.label}`} onClick={() => onDelete(item.id)}><Trash2 size={15} /></button></li>)}</ul>
    </PickerDialog>
  </>
}

function ResultList({ results, metric, context, onSave }: { results: CalculatorResult[]; metric: CalculatorMetric; context?: ResultContext; onSave?: (result: CalculatorResult, name: string, metric: CalculatorMetric) => void }) {
  return <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="计算结果" tabIndex={0}>
    <table className="w-full min-w-300 text-left text-xs tabular-nums">
      <thead className="border-b border-border bg-muted/50"><tr>
        <th scope="col" className="p-3 font-medium text-primary">{metricOptions.find(option => option.value === metric)?.label}</th>
        <th scope="col" className="p-3 font-medium">套装</th>
        {panelFields.filter(field => field.key !== metric).map(field => <th key={field.key} scope="col" className={`whitespace-nowrap p-3 font-medium ${isMetricSubAttribute(field.label, metric) ? 'text-primary' : ''}`}>{field.label}</th>)}
        <th scope="col" className="sticky right-0 bg-muted p-3 font-medium">御魂详情</th>
      </tr></thead>
      <tbody className="divide-y divide-border">{results.map((result, index) => <ResultRow key={result.relics.map(relic => relic.id).join('-')} result={result} index={index} metric={metric} context={context} onSave={onSave} />)}</tbody>
    </table>
  </div>
}

function ResultRow({ result, index, metric, context, onSave }: { result: CalculatorResult; index: number; metric: CalculatorMetric; context?: ResultContext; onSave?: (result: CalculatorResult, name: string, metric: CalculatorMetric) => void }) {
  const [label, setLabel] = useState(`方案 ${index + 1}`)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const constraints = panelFields.flatMap(field => {
    const range = context?.panelConstraints?.[field.key]
    if (!range || (range.min === undefined && range.max === undefined)) return []
    return [{ ...field, range }]
  })
  const highlightedAttributes = Object.keys(panelAttributeAliases).filter(attribute => isMetricSubAttribute(attribute, metric) || constraints.some(constraint => constraint.key === panelAttributeAliases[attribute]))
  return <tr className="hover:bg-muted/25">
    <td className="whitespace-nowrap p-3 font-semibold text-primary">{result.score.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{metric === 'speed' && context && <small className="ml-1 font-normal">（御魂 +{(result.panel.speed - context.baseStats.speed).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}）</small>}</td>
    <td className="p-3">{result.suits.join(' / ') || '散件'}</td>
    {panelFields.filter(field => field.key !== metric).map(field => <td key={field.key} className={`whitespace-nowrap p-3 ${isMetricSubAttribute(field.label, metric) ? 'font-medium text-primary' : ''}`}>{result.panel[field.key].toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{field.suffix}{field.key === 'speed' && context && <small className="ml-1 text-muted-foreground">（御魂 +{(result.panel.speed - context.baseStats.speed).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}）</small>}</td>)}
    <td className="sticky right-0 bg-background px-2 py-1">
      <div className="flex items-center gap-1 whitespace-nowrap"><button type="button" className="quiet-button text-primary" aria-label={`查看方案${index + 1}御魂详情`} onClick={() => setIsDetailsOpen(true)}>查看</button>{onSave && <button type="button" className="quiet-button text-primary" aria-label={`保存方案${index + 1}`} onClick={() => setIsSaveOpen(true)}><BookmarkPlus size={15} />保存</button>}</div>
      <PickerDialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen} title={`方案 ${index + 1} · 御魂详情`} className="max-w-5xl!">
        <article className="min-w-0">
          <header className="flex items-center gap-3">
            {context?.heroId && <HeroPortrait heroId={Number(context.heroId)} size={44} />}
            <div>
              <h3 className="text-sm font-semibold">{result.suits.join(' / ') || '散件'}</h3>
              {context && <p className="mt-1 text-xs text-muted-foreground">{context.heroName}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{metricOptions.find(option => option.value === metric)?.label}<strong className="ml-2 text-sm font-semibold tabular-nums text-primary">{result.score.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</strong></p>
            </div>
          </header>
          {constraints.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">本次面板约束</span>{constraints.map(({ key, label: fieldLabel, suffix = '', range }) => <span key={key} className="rounded border border-primary/25 bg-primary/5 px-2 py-1 text-primary">{fieldLabel} {range.min !== undefined && `≥ ${range.min}${suffix}`}{range.min !== undefined && range.max !== undefined && ' · '}{range.max !== undefined && `≤ ${range.max}${suffix}`}</span>)}</div>}
          <dl className="my-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-xs tabular-nums sm:grid-cols-4">{panelFields.map(field => <div key={field.key}>
            <dt className={isMetricSubAttribute(field.label, metric) ? 'font-medium text-primary' : 'text-muted-foreground'}>{field.label}</dt><dd className="mt-1 font-semibold">{result.panel[field.key].toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{field.suffix}</dd>
            {context && <dd className="mt-1 text-[11px] leading-5 text-muted-foreground"><span className="sr-only">基础属性</span>{context.baseStats[field.key].toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{field.suffix}<span className="mx-1">+</span><span className="sr-only">御魂与额外加成</span>{(result.panel[field.key] - context.baseStats[field.key]).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{field.suffix}</dd>}
          </div>)}</dl>
          {context && <p className="-mt-2 mb-3 text-xs text-muted-foreground">面板明细：基础属性 + 御魂与额外加成；数值对应本次计算时的条件。</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.relics.map((relic, position) => <RelicCard key={relic.id || position} relic={relic} highlightedAttributes={highlightedAttributes} />)}</div>
        </article>
      </PickerDialog>
      {onSave && <PickerDialog open={isSaveOpen} onOpenChange={setIsSaveOpen} title="保存方案" description="保存后会在后续计算中排除本方案的御魂，可随时取消排除。" className="max-w-md!">
        <label className="grid gap-1 text-sm">方案名称<input className="field" maxLength={200} aria-label={`方案${index + 1}保存名称`} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setIsSaveOpen(false)}>取消</button><button type="button" className="primary-button" disabled={!label.trim()} onClick={() => { onSave(result, label, metric); setIsSaveOpen(false) }}><BookmarkPlus size={15} />保存方案</button></div>
      </PickerDialog>}
    </td>
  </tr>
}
