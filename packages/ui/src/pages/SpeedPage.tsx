'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { IndependentSpeedConfig, IndependentSpeedPreset, RelicDataset, RelicView, SpeedCombination } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import {
  calculateIndependentSpeed,
  fourthMainAttributeOptions,
  getBestSpeedCombinationForSuit,
  getFullSpeedRelics,
  independentSpeedPresetStorageKey,
  parseIndependentSpeedPresets,
  sixthMainAttributeOptions,
  speedOf,
} from '@phoenix/utils'
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { RelicDetails } from '../components/RelicCard'
import { Pagination } from '../components/Pagination'
import { RelicList } from './RelicsPage'
import { getSuitOptions, SuitFilterPicker } from '../components/SuitFilterPicker'
import { SuitIcon } from '../components/GameIcon'
import { FilterOption } from '../components/FilterOption'
import { PickerDialog } from '../components/PickerDialog'

const defaultSuitNames = ['招财猫', '火灵', '蚌精', '返魂香', '魅妖', '钟灵', '共潜', '遗念火', '雪幽魂', '油赤子', '木魅']

function MainAttributeFilter({ position, values, onChange }: { position: 4 | 6; values: string[]; onChange: (values: string[]) => void }) {
  const options = position === 4 ? fourthMainAttributeOptions : sixthMainAttributeOptions
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium">{position} 号位主属性 <span className="font-normal text-muted-foreground">（不选则不限）</span></legend>
      <div className="flex flex-wrap gap-1">
        {options.map(({ value }) => <FilterOption key={value} className="min-h-11 gap-1 px-1 py-1 text-[11px] md:min-h-8 md:px-2 md:text-[13px] [&>svg]:size-3" checked={values.includes(value)} onChange={(event) => onChange(event.target.checked ? [...values, value] : values.filter((item) => item !== value))}>{value}</FilterOption>)}
      </div>
    </fieldset>
  )
}

function DetailToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <FilterOption checked={checked} onChange={(event) => onChange(event.target.checked)}>{label}</FilterOption>
}

function SpeedCombinationTable({ rows, label, suitOptions = [] }: { rows: { name: string; suitName?: string; combination: SpeedCombination | null }[]; label: string; suitOptions?: ReturnType<typeof getSuitOptions> }) {
  return (
    <>
      <div className="divide-y divide-border sm:hidden" aria-label={label}>
        {rows.map(({ name, suitName, combination }) => <details key={name} className="group py-3">
          <summary className="cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
            <span className="inline-flex w-[calc(100%-1.5rem)] items-center justify-between gap-2 text-sm"><span className="font-medium">{name}{!suitName && ' · 散件'}</span><strong className="shrink-0 tabular-nums text-primary">{combination ? `+${(combination.value + 57).toFixed(2)}` : '无可用组合'}</strong></span>
            <span className="mt-2 grid grid-cols-6 gap-1 rounded-md bg-muted/50 py-2 text-center text-xs tabular-nums">{[1, 2, 3, 4, 5, 6].map((position) => { const value = combination?.relics.find((relic) => relic.position === position)?.value.toFixed(2) || '—'; return <span key={position} aria-label={`${position}号位速度 ${value}`}>{value}</span> })}</span>
          </summary>
          <dl className="mt-1 divide-y divide-border text-xs">{[1, 2, 3, 4, 5, 6].map((position) => {
            const relic = combination?.relics.find((item) => item.position === position)
            return <div key={position} className="grid grid-cols-[2rem_1fr] gap-1 py-1"><dt className="text-muted-foreground">{position}号</dt><dd className="min-w-0 break-words">{relic ? `${relic.suitName} · ${relic.mainAttribute || '主属性未知'} · 速度 ${relic.value.toFixed(2)}` : '无可用御魂'}</dd></div>
          })}</dl>
        </details>)}
      </div>
    <div className="hidden overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-ring sm:block" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full min-w-180 border-collapse text-left text-[13px] tabular-nums [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3">
        <caption className="sr-only">{label}，总速度包含二号位主速度 57，各号位显示副速度与固有速度。</caption>
        <thead className="border-b border-border bg-muted text-muted-foreground"><tr><th scope="col" className="font-medium">配置 / 套件</th><th scope="col" className="font-medium">总速度</th>{[1, 2, 3, 4, 5, 6].map((position) => <th key={position} scope="col" className="font-medium">{position} 号位</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ name, suitName, combination }) => (
            <tr key={name} className="align-top hover:bg-muted/50">
              <th scope="row" className="whitespace-nowrap font-medium">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center" aria-label={suitName || '散件'} title={suitName || '散件'}>{suitName ? <SuitIcon size={24} id={suitOptions.find((suit) => suit.name === suitName)?.id} /> : '散件'}</span>
                  <span>{name}</span>
                </span>
              </th>
              <td className="whitespace-nowrap font-semibold text-primary">{combination ? `+${(combination.value + 57).toFixed(2)}` : '无可用组合'}</td>
              {[1, 2, 3, 4, 5, 6].map((position) => {
                const relic = combination?.relics.find((item) => item.position === position)
                return <td key={position}>{relic ? <div title={`${relic.suitName} · ${relic.mainAttribute || '主属性未知'} · 速度 ${relic.value}`}>
                  <strong className={`font-medium ${relic.suitName === suitName ? 'text-primary' : ''}`}>{relic.value.toFixed(2)}</strong>
                  {(position === 4 || position === 6) && <span className="block whitespace-nowrap text-xs font-medium text-primary">{relic.mainAttribute || '主属性未知'}</span>}
                  {relic.suitName !== suitName && <span className="block whitespace-nowrap text-xs text-muted-foreground">{relic.suitName}</span>}
                </div> : <span className="text-muted-foreground">—</span>}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function FullSpeedList({ items, highlightedSuitNames }: { items: RelicView[]; highlightedSuitNames: string[] }) {
  const [page, setPage] = useState(1)
  const pageSize = 48
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const activePage = Math.min(page, pageCount)
  return <div className="space-y-2">
    {items.length ? <div className="p-0.5">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-6" aria-label="速度御魂列表">
        {items.slice((activePage - 1) * pageSize, activePage * pageSize).map((relic) => <li key={relic.id} className={`relative flex min-w-0 items-center justify-between gap-3 border-b border-border py-3 text-sm transition-colors hover:bg-primary/5 ${highlightedSuitNames.includes(relic.suit?.name || '') ? 'bg-primary/8' : 'bg-background'}`}>
          <div className="flex min-w-0 items-center gap-1">
            <div className="hidden shrink-0 sm:block"><SuitIcon id={relic.suit?.id} size={24} /></div>
            <div className="min-w-0 break-words">
              <RelicDetails relic={relic} highlightedAttributes={['速度']} card />
              <p className="text-xs text-muted-foreground">{relic.mainAttribute?.label || '主属性未知'}</p>
            </div>
          </div>
          <dl className="shrink-0 text-right">
            <dt className="text-xs text-muted-foreground">副速度</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary" title={String(speedOf(relic))}>{speedOf(relic).toFixed(2)}</dd>
          </dl>
        </li>)}
      </ul>
    </div> : <p className="empty-state">当前号位没有满速御魂。</p>}
    {pageCount > 1 && (
      <Pagination label="速度御魂分页" page={activePage} pageCount={pageCount} onPageChange={setPage} summary={`共 ${items.length} 件`} />
    )}
  </div>
}

function IndependentPlanner({ dataset, suitOptions }: { dataset: RelicDataset; suitOptions: ReturnType<typeof getSuitOptions> }) {
  const [configs, setConfigs] = useState<IndependentSpeedConfig[]>([{ id: 'first', fourthMainAttributes: [], sixthMainAttributes: [] }])
  const [presets, setPresets] = useState<IndependentSpeedPreset[]>([])
  const [presetId, setPresetId] = useState('')
  const [presetName, setPresetName] = useState('')
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const configList = useRef<HTMLDivElement>(null)
  const drag = useRef<{ row: HTMLElement; pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const previousTops = useRef(new Map<HTMLElement, number>())

  function followPointer() {
    const active = drag.current
    const list = configList.current
    if (!active || !list) return
    const bounds = list.getBoundingClientRect()
    active.row.style.transform = `translate(${active.x - active.offsetX - bounds.left - active.row.offsetLeft}px, ${active.y - active.offsetY - bounds.top - active.row.offsetTop}px)`
  }

  function animateRow(row: HTMLElement, from: string) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    row.animate([{ transform: from }, { transform: 'translate(0px, 0px)' }], {
      duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    })
  }

  useLayoutEffect(() => {
    for (const [row, top] of previousTops.current) {
      row.getAnimations().forEach(animation => animation.cancel())
      if (row !== drag.current?.row) {
        const distance = top - row.getBoundingClientRect().top
        if (distance) animateRow(row, `translateY(${distance}px)`)
      }
    }
    previousTops.current.clear()
    followPointer()
  }, [configs])

  useEffect(() => {
    window.addEventListener('scroll', followPointer, true)
    return () => window.removeEventListener('scroll', followPointer, true)
  }, [])

  function finishDrag(event?: { pointerId: number }) {
    const active = drag.current
    if (!active || (event && event.pointerId !== active.pointerId)) return
    const from = active.row.style.transform
    active.row.style.transform = ''
    drag.current = null
    setDraggingId(null)
    animateRow(active.row, from)
    if (configList.current?.hasPointerCapture(active.pointerId)) configList.current.releasePointerCapture(active.pointerId)
  }
  const [newConfig, setNewConfig] = useState<IndependentSpeedConfig>({ id: 'new', fourthMainAttributes: [], sixthMainAttributes: [] })
  const [notice, setNotice] = useState('')
  const results = useMemo(() => calculateIndependentSpeed(dataset, configs), [dataset, configs])
  const editingConfig = configs.find((config) => config.id === editingId)
  const activePreset = presets.find((preset) => preset.id === presetId)

  useEffect(() => {
    let isActive = true
    queueMicrotask(() => {
      if (!isActive) return
      try {
        const savedPresets = parseIndependentSpeedPresets(window.localStorage.getItem(independentSpeedPresetStorageKey))
        setPresets(savedPresets)
        const lastPreset = savedPresets.at(-1)
        if (lastPreset) {
          setPresetId(lastPreset.id)
          setConfigs(lastPreset.configs)
        }
      } catch {
        setNotice('无法读取本地预设；当前配速不受影响。')
      }
    })
    return () => { isActive = false }
  }, [])

  function updateConfig(id: string, update: Partial<IndependentSpeedConfig>) {
    setConfigs((current) => current.map((config) => config.id === id ? { ...config, ...update } : config))
  }

  function reorderConfig(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    for (const child of configList.current?.children ?? []) {
      if (child instanceof HTMLElement && child.dataset.speedConfigId) previousTops.current.set(child, child.getBoundingClientRect().top)
    }
    setConfigs((current) => {
      const sourceIndex = current.findIndex((config) => config.id === sourceId)
      const targetIndex = current.findIndex((config) => config.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved!)
      return next
    })
  }

  function persistPresets(next: IndependentSpeedPreset[], successMessage: string) {
    try {
      window.localStorage.setItem(independentSpeedPresetStorageKey, JSON.stringify(next))
      setPresets(next)
      setNotice(successMessage)
      return true
    } catch {
      setNotice('预设未保存：浏览器本地存储不可用或空间不足。')
      return false
    }
  }

  function savePreset() {
    const name = presetName.trim()
    if (!name || !configs.length) return
    const preset = { id: crypto.randomUUID(), name, configs }
    if (persistPresets([...presets, preset], '预设已保存到此浏览器。')) {
      setPresetId(preset.id)
      setPresetName('')
      setIsPresetDialogOpen(false)
    }
  }

  function addConfig() {
    setConfigs((current) => [...current, { ...newConfig, id: crypto.randomUUID() }])
    setNewConfig({ id: 'new', fourthMainAttributes: [], sixthMainAttributes: [] })
    setIsAddDialogOpen(false)
  }

  return (
    <section className="analysis-section space-y-4" aria-labelledby="independent-speed-heading">
      <header className="space-y-2">
        <h2 id="independent-speed-heading" className="text-base font-semibold">独立套件速度</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">按下方顺序逐套分配，前一套使用的御魂会从后续候选中排除。每套均为六星 +15、二号位主速度；不是多套的全局最优解。</p>
      </header>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border py-3 text-sm" aria-label="独立套件速度总览">
        <span className="font-medium">总览</span>
        {results.map(({ combination }, index) => { const config = configs[index]!; return <span key={config.id} className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"><span className="text-muted-foreground">{config.suitName || '散件'}</span><strong className="tabular-nums text-primary">{combination ? `+${(combination.value + 57).toFixed(2)}` : '无可用组合'}</strong></span>})}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4" aria-label="套件方案">
        <label className="min-w-48 max-w-sm flex-1 text-sm">
          <span className="sr-only">选择已存方案</span>
          <select className="field h-9 w-full py-1" value={presetId} onChange={(event) => {
            const nextId = event.target.value
            setPresetId(nextId)
            const preset = presets.find((item) => item.id === nextId)
            if (preset) {
              setConfigs(preset.configs)
              setNotice(`已应用预设「${preset.name}」。`)
            }
          }}>
            <option value="">选择本地预设</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{preset.id === presetId ? '（正在使用）' : ''}</option>)}
          </select>
        </label>
        {activePreset && <span className="text-xs font-medium text-primary" role="status">正在使用：{activePreset.name}</span>}
        <Button variant="outline" size="sm" disabled={!activePreset} onClick={() => {
          if (activePreset && persistPresets(presets.filter((preset) => preset.id !== presetId), '预设已删除。')) setPresetId('')
        }}><Trash2 aria-hidden="true" />删除</Button>
        <Button variant="outline" size="sm" disabled={!configs.length} onClick={() => { setPresetName(''); setIsPresetDialogOpen(true) }}><Save aria-hidden="true" />保存方案</Button>
      </div>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {!configs.length && <p className="empty-state">尚未配置套件，添加一套即可开始独立配速。</p>}
      <div
        ref={configList}
        className={`relative divide-y divide-border ${draggingId ? 'select-none cursor-grabbing' : ''}`}
        onPointerMove={(event) => {
          const active = drag.current
          if (!active || active.pointerId !== event.pointerId) return
          active.x = event.clientX
          active.y = event.clientY
          followPointer()
          const listTop = event.currentTarget.getBoundingClientRect().top
          // Use layout positions: the floating card and animating siblings must not affect hit testing.
          const targets = Array.from(event.currentTarget.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.speedConfigId)
          const sourceIndex = targets.indexOf(active.row)
          let targetId = active.row.dataset.speedConfigId!
          targets.forEach((row, index) => {
            const midpoint = listTop + row.offsetTop + row.offsetHeight / 2
            if (index < sourceIndex && event.clientY <= midpoint && targetId === active.row.dataset.speedConfigId) targetId = row.dataset.speedConfigId!
            if (index > sourceIndex && event.clientY >= midpoint) targetId = row.dataset.speedConfigId!
          })
          reorderConfig(active.row.dataset.speedConfigId!, targetId)
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
  {configs.map((config, index) => {
    const combination = results[index]?.combination
    return <article key={config.id} data-speed-config-id={config.id} className={`relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none xl:grid-cols-[auto_13rem_minmax(0,1fr)_auto] ${draggingId === config.id ? 'z-10 rounded-lg bg-card shadow-lg ring-1 ring-primary/30 will-change-transform' : ''}`}>
       <button
         type="button"
         className="row-span-2 flex size-11 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing sm:w-8 xl:row-span-1"
         aria-label={`拖动第 ${index + 1} 套调整顺序`}
         title="上下拖动调整顺序，也可使用上下方向键"
         onPointerDown={(event) => {
           if (!event.isPrimary || event.button !== 0 || drag.current) return
           const row = event.currentTarget.closest<HTMLElement>('[data-speed-config-id]')
           if (!row) return
           event.preventDefault()
           event.currentTarget.focus({ preventScroll: true })
           const bounds = row.getBoundingClientRect()
           row.getAnimations().forEach(animation => animation.cancel())
           drag.current = { row, pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top }
           configList.current?.setPointerCapture(event.pointerId)
           setDraggingId(config.id)
           followPointer()
         }}
         onKeyDown={(event) => {
           if (event.key === 'Escape') { finishDrag(); return }
           if (drag.current || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
           event.preventDefault()
           const target = configs[event.key === 'ArrowUp' ? index - 1 : index + 1]
           if (target) reorderConfig(config.id, target.id)
         }}
       ><GripVertical aria-hidden="true" size={18} /></button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <button type="button" aria-label={`编辑第 ${index + 1} 套 · ${config.suitName || '散件'}`} className="min-h-11 min-w-0 cursor-pointer rounded text-left text-sm font-semibold break-words focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0" onClick={() => { setEditingId(config.id); setIsEditDialogOpen(true) }}>
            第 {index + 1} 套 · {config.suitName || '散件'}
          </button>
          <strong className="text-sm tabular-nums text-primary">{combination ? `+${(combination.value + 57).toFixed(2)}` : '无组合'}</strong>
        </div>
        <p className="text-xs leading-5 break-words text-muted-foreground">2：速度 · 4：{config.fourthMainAttributes.join('、') || '不限'} · 6：{config.sixthMainAttributes.join('、') || '不限'}</p>
      </div>
      <div className="order-2 col-span-2 col-start-2 grid min-w-0 grid-cols-3 gap-x-3 gap-y-2 text-xs leading-5 sm:grid-cols-6 xl:order-none xl:col-span-1 xl:col-start-auto" aria-label={`第 ${index + 1} 套各号位御魂`}>
        {[1, 2, 3, 4, 5, 6].map((position) => {
          const relic = combination?.relics.find((item) => item.position === position)
          return <div key={position} className="min-w-0 border-l border-border pl-2">
            <span className="block font-medium tabular-nums"><span className="mr-1 text-muted-foreground">{position}号</span>{relic ? relic.value.toFixed(2) : '—'}</span>
            <span className="block break-words text-muted-foreground">{relic?.mainAttribute || '主属性未知'}</span>
            {relic && relic.suitName !== config.suitName && <span className="block break-words text-muted-foreground">{relic.suitName}</span>}
          </div>
        })}
      </div>
      <div className="grid grid-cols-2 gap-0.5" aria-label={`第 ${index + 1} 套操作`}>
        <Button variant="ghost" size="icon" className="size-11 text-primary sm:size-8" aria-label={`修改第 ${index + 1} 套配置`} title="修改配置" onClick={() => { setEditingId(config.id); setIsEditDialogOpen(true) }}><Pencil aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="size-11 sm:size-8" aria-label={`删除第 ${index + 1} 套`} title="删除套件" onClick={() => setConfigs((current) => current.filter((item) => item.id !== config.id))}><Trash2 aria-hidden="true" /></Button>
        <Button size="icon" variant="ghost" className="size-11 sm:size-8" disabled={index === 0} aria-label={`将第 ${index + 1} 套前移`} title="前移" onClick={() => reorderConfig(config.id, configs[index - 1]!.id)}><ArrowUp aria-hidden="true" /></Button>
        <Button size="icon" variant="ghost" className="size-11 sm:size-8" disabled={index === configs.length - 1} aria-label={`将第 ${index + 1} 套后移`} title="后移" onClick={() => reorderConfig(config.id, configs[index + 1]!.id)}><ArrowDown aria-hidden="true" /></Button>
      </div>
    </article>
  })}
<button type="button" className="flex min-h-12 w-full items-center justify-start gap-2 py-4 text-primary transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring" aria-label="添加独立套件" title="添加独立套件" onClick={() => { setNewConfig({ id: 'new', fourthMainAttributes: [], sixthMainAttributes: [] }); setIsAddDialogOpen(true) }}><Plus aria-hidden="true" size={24} /><span className="text-sm font-medium">添加独立套件</span></button></div><PickerDialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingId(null) }} title="编辑独立套件" description="调整这套速度计算的套件与主属性条件。" className="max-w-xl!">
         {editingConfig && <div className="space-y-4">
           <div className="flex flex-wrap items-center gap-2">
             <SuitFilterPicker title="选择四件套要求" options={suitOptions} selected={editingConfig.suitName ? [editingConfig.suitName] : []} single onChange={(names) => updateConfig(editingConfig.id, { suitName: names[0] })} />
             <span className="text-sm text-muted-foreground">{editingConfig.suitName || '散件 · 不限制套装'}</span>
           </div>
           <div className="grid gap-3 sm:grid-cols-2">
             <MainAttributeFilter position={4} values={editingConfig.fourthMainAttributes} onChange={(values) => updateConfig(editingConfig.id, { fourthMainAttributes: values })} />
             <MainAttributeFilter position={6} values={editingConfig.sixthMainAttributes} onChange={(values) => updateConfig(editingConfig.id, { sixthMainAttributes: values })} />
           </div>
           <div className="flex justify-end"><Button onClick={() => setIsEditDialogOpen(false)}>完成</Button></div>
         </div>}
       </PickerDialog>
       <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">点击标题编辑，拖动左侧手柄调整顺序；手柄也支持上下方向键</span></div>
       <PickerDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} title="添加独立套件" description="设置这套速度计算的套件与主属性条件。" className="max-w-xl!">
         <div className="space-y-4">
           <div className="flex flex-wrap items-center gap-2">
             <SuitFilterPicker title="选择四件套要求" options={suitOptions} selected={newConfig.suitName ? [newConfig.suitName] : []} single onChange={(names) => setNewConfig((current) => ({ ...current, suitName: names[0] }))} />
             <span className="text-sm text-muted-foreground">{newConfig.suitName || '散件 · 不限制套装'}</span>
           </div>
           <div className="grid gap-3 sm:grid-cols-2">
             <MainAttributeFilter position={4} values={newConfig.fourthMainAttributes} onChange={(values) => setNewConfig((current) => ({ ...current, fourthMainAttributes: values }))} />
             <MainAttributeFilter position={6} values={newConfig.sixthMainAttributes} onChange={(values) => setNewConfig((current) => ({ ...current, sixthMainAttributes: values }))} />
           </div>
           <div className="flex justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setIsAddDialogOpen(false)}>取消</button><Button onClick={addConfig}><Plus aria-hidden="true" />添加套件</Button></div>
         </div>
       </PickerDialog>
       <PickerDialog open={isPresetDialogOpen} onOpenChange={setIsPresetDialogOpen} title="保存当前配置" description="为当前独立套件配置保存一个名称，之后可从已存预设中恢复。" className="max-w-md!">
         <label className="grid gap-1 text-sm">预设名称<input autoFocus className="field" maxLength={60} value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="例如：招财一速与火灵二速" /></label>
         <div className="mt-5 flex justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setIsPresetDialogOpen(false)}>取消</button><Button disabled={!presetName.trim()} onClick={savePreset}><Save aria-hidden="true" />保存</Button></div>
       </PickerDialog>
    </section>
  )
}

export default function SpeedPage({ dataset }: { dataset: RelicDataset }) {
  const [fourth, setFourth] = useState<string[]>([])
  const [sixth, setSixth] = useState<string[]>([])
  const [customFourth, setCustomFourth] = useState<string[]>([])
  const [customSixth, setCustomSixth] = useState<string[]>([])
  const [selectedSuits, setSelectedSuits] = useState(defaultSuitNames)
  const [sortDirection, setSortDirection] = useState('desc')
  const [position, setPosition] = useState('1')
  const [showRelicDetails, setShowRelicDetails] = useState(false)
  const speedDataset = useMemo<RelicDataset>(() => ({ ...dataset, relicsByPosition: Object.fromEntries(Object.entries(dataset.relicsByPosition).map(([key, relics]) => [key, relics.map((relic, index) => relic.id ? relic : { ...relic, id: `speed-${key}-${index}` })])) }), [dataset])
  const allRelics = useMemo(() => Object.values(speedDataset.relicsByPosition).flat(), [speedDataset])
  const suitOptions = useMemo(() => getSuitOptions(allRelics.filter((relic) => !relic.setBonusAttribute && !relic.suit?.isTwoPieceSet)), [allRelics])
  const suitNames = useMemo(() => suitOptions.map(({ name }) => name), [suitOptions])
  const pvpSuitOptions = useMemo(() => suitOptions.filter(({ name }) => name !== '招财猫'), [suitOptions])
  const combinations = useMemo(() => {
    const options = { fourthMainAttributes: fourth, sixthMainAttributes: sixth }
    return [
      ...suitNames.filter((name) => selectedSuits.includes(name) || name === '招财猫').map((name) => ({ name, combination: getBestSpeedCombinationForSuit(speedDataset, name, options) })),
    ].sort((a, b) => {
      if (!a.combination) return b.combination ? 1 : 0
      if (!b.combination) return -1
      return (a.combination.value - b.combination.value) * (sortDirection === 'desc' ? -1 : 1)
    })
  }, [speedDataset, fourth, sixth, suitNames, selectedSuits, sortDirection])
  const fastestRanks = useMemo(() => calculateIndependentSpeed(speedDataset, Array.from({ length: 5 }, (_, index) => ({ id: String(index), fourthMainAttributes: customFourth, sixthMainAttributes: customSixth }))), [speedDataset, customFourth, customSixth])
  const fullSpeedIds = useMemo(() => new Set(getFullSpeedRelics(speedDataset).map((relic) => relic.relicId)), [speedDataset])
  const speedRelics = useMemo(() => allRelics.filter((relic) => relic.quality === 6 && relic.level === 15 && speedOf(relic) > 0 && fullSpeedIds.has(relic.id)).sort((a, b) => (speedOf(a) - speedOf(b)) * (sortDirection === 'desc' ? -1 : 1)), [allRelics, fullSpeedIds, sortDirection])
  const visibleRelics = speedRelics.filter((relic) => relic.position === Number(position))

  return (
    <div className="page-stack min-w-0">
      <header className="analysis-header">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">速度分析</h1>
        <p className="text-sm text-muted-foreground">满速御魂 <strong className="font-semibold tabular-nums text-primary">{speedRelics.length}</strong> 件 · 六星 +15</p>
      </header>
      <section className="analysis-section space-y-4" aria-labelledby="speed-combinations-heading">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="speed-combinations-heading" className="text-lg font-semibold">一速组合</h2>
          <span className="text-xs text-muted-foreground">依次分配 · 御魂互不重复</span>
        </header>
        <div className="analysis-toolbar grid gap-4 md:grid-cols-2">
          <MainAttributeFilter position={4} values={customFourth} onChange={setCustomFourth} />
          <MainAttributeFilter position={6} values={customSixth} onChange={setCustomSixth} />
        </div>
        <SpeedCombinationTable rows={fastestRanks.map(({ combination }, index) => ({ name: `第 ${index + 1} 套`, combination }))} label="一速组合" />
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">仅计算六星 +15、二号位主速度。总速度 = 精确副速度与固有速度合计 + 二号位主速度 57，不含式神基础速度；前五套按所选主属性依次分配。</p>
      </section>
      <section className="analysis-section space-y-4" aria-labelledby="pvp-speed-heading">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pvp-speed-heading" className="text-lg font-semibold">PVP 套件速度</h2>
          <label className="flex items-center gap-2 text-sm">速度排序<select className="field" value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label>
        </header>
        <div className="analysis-toolbar space-y-4">
          <div className="grid gap-4 md:grid-cols-2"><MainAttributeFilter position={4} values={fourth} onChange={setFourth} /><MainAttributeFilter position={6} values={sixth} onChange={setSixth} /></div>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-medium">斗技四件套 · 招财猫固定显示</legend>
            <div className="flex flex-wrap items-center gap-3">
              <SuitFilterPicker title="选择四件套" options={pvpSuitOptions} selected={selectedSuits} defaults={defaultSuitNames} onChange={setSelectedSuits} />
              <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">{pvpSuitOptions.filter(({ name }) => selectedSuits.includes(name)).map(({ name }) => name).join('、')}</span>
            </div>
          </fieldset>
        </div>
        <SpeedCombinationTable rows={combinations.map(({ name, combination }) => ({ name: `${name}四件套`, suitName: name, combination }))} label="常用 PVP 套件速度" suitOptions={suitOptions} />
      </section>
      <IndependentPlanner dataset={speedDataset} suitOptions={suitOptions} />
      <section className="analysis-section flex flex-col gap-4" aria-labelledby="full-speed-heading">
        <header className="border-b border-border pb-3"><h2 id="full-speed-heading" className="text-base font-semibold">满速御魂 <span className="ml-1 font-normal tabular-nums text-muted-foreground">{speedRelics.length} 件</span></h2></header>
        <p className="text-sm text-muted-foreground" aria-live="polite">{visibleRelics.length} 件 · 速度{sortDirection === 'desc' ? '降序' : '升序'}</p>
        <DetailToggle checked={showRelicDetails} onChange={setShowRelicDetails} label="显示速度御魂完整属性" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="速度御魂号位">{[1, 2, 3, 4, 5, 6].map((value) => <Button key={value} size="sm" className="h-auto min-h-12 min-w-0 flex-col gap-0.5 rounded-none border-0 border-b-2 px-1 py-2" variant={position === String(value) ? 'default' : 'outline'} aria-pressed={position === String(value)} onClick={() => setPosition(String(value))}><span>{value} 号位</span><span className="text-xs font-normal tabular-nums opacity-75">{speedRelics.filter((relic) => relic.position === value).length} 件</span></Button>)}</div>
        <div className="min-w-0">
          {showRelicDetails ? <RelicList key={`${position}-${sortDirection}`} items={visibleRelics} highlightedAttributes={['速度']} /> : <FullSpeedList key={`${position}-${sortDirection}`} items={visibleRelics} highlightedSuitNames={['招财猫', ...selectedSuits]} />}
        </div>
      </section>
    </div>
  )
}
