'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HeroStaticPayload, PveMetric, RelicDataset } from '@phoenix/types'
import { fixedOmaSuitNames } from '@phoenix/utils'
import { Button } from '@phoenix/ui/components/button'
import type { PveWorkerMessage } from '../pve.worker'
import { SuitIcon } from './GameIcon'

type Calculation = {
  dataset: RelicDataset
  heroes: HeroStaticPayload
  run: number
  metrics: Map<string, PveMetric | undefined>
  done: boolean
  error?: string
}

export function PveDamageTable({ dataset, heroPayload, suitNames, selected }: { dataset: RelicDataset; heroPayload?: HeroStaticPayload; suitNames: string[]; selected: string[] }) {
  const suitIds = useMemo(() => new Map(Object.values(dataset.relicsByPosition).flat().map(relic => [relic.suit?.name, relic.suit?.id])), [dataset])
  const suitLabel = (name: string) => <span className="inline-flex items-center gap-2 whitespace-nowrap"><SuitIcon id={suitIds.get(name)} size={28} />{name}</span>
  const workerRef = useRef<Worker | null>(null)
  const priorityRef = useRef(selected)
  const [run, setRun] = useState(0)
  const [calculation, setCalculation] = useState<Calculation | null>(null)
  const baseStats = useMemo(() => Object.values(heroPayload?.heroesById || {}).find((hero) => hero.name === '须佐之男')?.baseStats, [heroPayload])
  const current = calculation?.dataset === dataset && calculation.heroes === heroPayload && calculation.run === run ? calculation : null
  const isCalculating = Boolean(baseStats && !current?.done)
  const rows = selected.map((name) => {
    const metrics = fixedOmaSuitNames.map((oma) => current?.metrics.get(`${name}:${oma}`))
    const available = metrics.filter((metric): metric is PveMetric => Boolean(metric))
    const average = available.length ? Math.round(available.reduce((total, metric) => total + metric.damage, 0) / available.length) : undefined
    return { name, metrics, average }
  })
  const allMetrics = rows.flatMap(({ metrics }) => metrics).filter((metric): metric is PveMetric => Boolean(metric))
  const overallAverage = allMetrics.length ? Math.round(allMetrics.reduce((total, metric) => total + metric.damage, 0) / allMetrics.length) : undefined

  useEffect(() => {
    priorityRef.current = selected
    workerRef.current?.postMessage({ type: 'prioritize', suitNames: selected })
  }, [selected])

  useEffect(() => {
    if (!baseStats || !heroPayload) return
    let worker: Worker | null = null
    const update = (message: PveWorkerMessage) => {
      setCalculation((previous) => {
        const state = previous?.dataset === dataset && previous.heroes === heroPayload && previous.run === run
          ? previous : { dataset, heroes: heroPayload, run, metrics: new Map<string, PveMetric | undefined>(), done: false }
        if (message.type === 'result') return { ...state, metrics: new Map(state.metrics).set(message.id, message.metric) }
        return { ...state, done: true, error: message.type === 'error' ? message.message : undefined }
      })
    }
    try {
      worker = new Worker(new URL('../pve.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = ({ data }: MessageEvent<PveWorkerMessage>) => update(data)
      worker.onerror = () => update({ type: 'error', message: '伤害计算未完成，请重新计算。' })
      worker.postMessage({ type: 'calculate', dataset, baseStats, suitNames, priority: priorityRef.current })
    } catch {
      queueMicrotask(() => update({ type: 'error', message: '计算未能启动，请重试。' }))
    }
    return () => {
      worker?.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [dataset, heroPayload, baseStats, suitNames, run])

  const placeholder = (id: string) => current?.metrics.has(id) || !isCalculating ? '暂无组合' : '计算中'
  const renderMetric = (metric: PveMetric | undefined, id: string) => metric ? <><strong className="block text-primary">{metric.damage.toLocaleString('zh-CN')}</strong><small className="whitespace-nowrap text-muted-foreground">攻 {Math.round(metric.panel.attack).toLocaleString('zh-CN')} · 爆 {metric.panel.critDamage.toFixed(1)}%</small></> : <span className="text-muted-foreground">{placeholder(id)}</span>
  return <section className="analysis-section min-w-0 space-y-4" aria-labelledby="pve-damage-heading">
    <header className="space-y-3">
      <h2 id="pve-damage-heading" className="text-lg font-semibold">伤害对比</h2>
      <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <dt className="text-sm font-medium text-muted-foreground">总平均</dt>
        <dd className="text-4xl leading-none font-semibold tracking-tight tabular-nums text-primary sm:text-5xl">{overallAverage?.toLocaleString('zh-CN') ?? '—'}</dd>
      </dl>
    </header>
    {(!baseStats || isCalculating || current?.error) && (
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        {baseStats ? <span role="status">{isCalculating ? `正在计算 · 已完成 ${current?.metrics.size ?? 0}/${suitNames.length * fixedOmaSuitNames.length} 组` : current?.error}</span> : <span>缺少须佐之男基础面板，暂无法计算伤害预览。</span>}
        {baseStats && (isCalculating ? <Button size="sm" variant="outline" onClick={() => { workerRef.current?.terminate(); workerRef.current = null; setCalculation((previous) => ({ dataset, heroes: heroPayload!, run, metrics: current?.metrics ?? previous?.metrics ?? new Map(), done: true, error: '计算已取消，可重新计算。' })) }}>取消计算</Button> : <Button size="sm" variant="outline" onClick={() => setRun((value) => value + 1)}>重新计算</Button>)}
      </div>
    )}
    {selected.length ? <>
      <div className="divide-y divide-border md:hidden" aria-label="PVE 套件伤害对比">
        {rows.map(({ name, metrics, average }) => <section key={name} className="py-4 first:pt-0">
          <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm"><h3 className="font-semibold">{suitLabel(name)}</h3><p className="text-xs text-muted-foreground">平均 <strong className="tabular-nums text-primary">{average?.toLocaleString('zh-CN') ?? (isCalculating ? '计算中' : '暂无组合')}</strong></p></header>
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">{name}搭配三种逢魔御魂的伤害、攻击与暴击伤害</caption>
            <thead className="border-y border-border text-muted-foreground"><tr><th scope="col" className="py-2 font-normal">逢魔御魂</th><th scope="col" className="py-2 text-right font-normal">伤害 / 攻击 / 暴伤</th></tr></thead>
            <tbody>{metrics.map((metric, index) => <tr key={fixedOmaSuitNames[index]}><th scope="row" className="py-3 font-medium">{fixedOmaSuitNames[index]}</th><td className="py-3 text-right">{renderMetric(metric, `${name}:${fixedOmaSuitNames[index]}`)}</td></tr>)}</tbody>
          </table>
        </section>)}
      </div>
      <div className="hidden overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring md:block" tabIndex={0} role="region" aria-label="PVE 套件伤害表">
        <table className="w-full min-w-150 border-collapse text-left text-[13px] tabular-nums [&_th]:px-3 [&_th]:py-3 [&_td]:px-3 [&_td]:py-3">
          <caption className="sr-only">各四件套搭配三种逢魔御魂的伤害、攻击与暴击伤害及平均指标</caption>
          <thead className="border-y border-border text-xs text-muted-foreground"><tr><th scope="col">四件套</th>{fixedOmaSuitNames.map((name) => <th scope="col" key={name}>{name}</th>)}<th scope="col">平均值</th></tr></thead>
          <tbody className="divide-y divide-border">{rows.map(({ name, metrics, average }) => <tr key={name} className="hover:bg-muted/40"><th scope="row" className="font-medium">{suitLabel(name)}</th>{metrics.map((metric, index) => <td key={fixedOmaSuitNames[index]}>{renderMetric(metric, `${name}:${fixedOmaSuitNames[index]}`)}</td>)}<td className="font-semibold text-primary">{average?.toLocaleString('zh-CN') ?? (isCalculating ? '计算中' : '暂无组合')}</td></tr>)}</tbody>
        </table>
      </div>
    </> : <p className="py-3 text-sm text-muted-foreground">请选择四件套以查看伤害预览。</p>}
    <details className="text-xs leading-relaxed text-muted-foreground">
      <summary className="min-h-8 cursor-pointer py-1 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">伤害口径与计算范围</summary>
      <p className="max-w-3xl py-2">满级须佐之男面板，六星 +15、满暴，分别搭配土蜘蛛、荒骷髅、鬼灵歌伎。普通两件套、逢魔一件套属性计入面板；伤害指标 = 最终攻击 × 最终暴击伤害，不计式神技能、四件套伤害效果或副本增益。</p>
    </details>
  </section>
}
