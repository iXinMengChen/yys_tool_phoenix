'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { RelicCalculationRequest } from '@phoenix/types'
import { allMainAttributes, mainAttributeOptions, panelFields } from '@phoenix/utils'
import { PickerDialog } from '../components/PickerDialog'
import { FilterOption } from '../components/FilterOption'
import { createId, type MainAttributes } from './calculatorState'

type PanelRanges = NonNullable<RelicCalculationRequest['filters']['panelConstraints']>
type MainShortcut = { id: string; label: string; mainAttributes: MainAttributes }
type PanelShortcut = { id: string; label: string; values: PanelRanges }
const mainStorageKey = 'yys-cbg-inspector.calculator.main-attribute-shortcuts'
const panelStorageKey = 'yys-cbg-inspector.calculator.shortcuts'
const positions = [2, 4, 6] as const
const mainPresets: MainShortcut[] = [
  { id: 'attack', label: '攻攻爆', mainAttributes: { 2: ['攻击加成'], 4: ['攻击加成'], 6: ['暴击', '暴击伤害'] } },
  { id: 'health', label: '生生爆', mainAttributes: { 2: ['生命加成'], 4: ['生命加成'], 6: ['暴击', '暴击伤害'] } },
  { id: 'speed', label: '纯速度', mainAttributes: { ...allMainAttributes(), 2: ['速度'] } },
]
const panelPresets: PanelShortcut[] = [
  { id: 'crit', label: '满暴', values: { critRate: { min: 100 } } },
  { id: 'speed', label: '超星', values: { speed: { min: 128 } } },
]
const labelSchema = z.object({ label: z.string().trim().min(1, '请填写名称').max(200) })
const rangeNumber = z.union([z.literal(''), z.coerce.number().finite().min(0).max(10000000)])
const panelSchema = labelSchema.extend({ values: z.record(z.string(), z.object({ min: rangeNumber, max: rangeNumber })) })
type PanelInput = z.input<typeof panelSchema>
type PanelOutput = z.output<typeof panelSchema>
function emptyRanges(): PanelOutput['values'] { return Object.fromEntries(panelFields.map(({ key }) => [key, { min: '', max: '' }])) }
function sameMain(left: MainAttributes, right: MainAttributes) { return positions.every(position => (left[position]?.length || 0) === (right[position]?.length || 0) && (right[position] || []).every(value => left[position]?.includes(value))) }
function samePanel(current: PanelRanges, expected: PanelRanges) { return panelFields.every(({ key }) => { const range = expected[key]; return !range || ((range.min === undefined || current[key]?.min === range.min) && (range.max === undefined || current[key]?.max === range.max)) }) }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function validNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000 }

/** 本地存储可能来自旧版本或被手工修改，只接收已知主属性和非负范围。 */
function loadShortcuts(key: string, kind: 'main' | 'panel') {
  const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]')
  const main: MainShortcut[] = [], panel: PanelShortcut[] = []
  if (!Array.isArray(raw)) return { main, panel }
  for (const item of raw.slice(-50)) {
    if (!record(item) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 200) continue
    const id = typeof item.id === 'string' ? item.id : `${kind}-${main.length + panel.length}`
    const label = item.label.trim()
    if (kind === 'main' && record(item.mainAttributes)) {
      const attributes = item.mainAttributes
      const mainAttributes: MainAttributes = {}
      for (const position of positions) {
        const values = attributes[position]
        if (Array.isArray(values)) mainAttributes[position] = [...new Set(values.filter((value): value is string => typeof value === 'string' && mainAttributeOptions[position].includes(value)))]
      }
      if (positions.every(position => mainAttributes[position]?.length) && !main.some(shortcut => shortcut.id === id)) main.push({ id, label, mainAttributes })
    } else if (kind === 'panel' && record(item.values)) {
      const values: PanelRanges = {}
      for (const { key: field } of panelFields) {
        const rawRange = item.values[field]
        const range = validNumber(rawRange) ? { min: rawRange } : rawRange
        if (!record(range)) continue
        const min = validNumber(range.min) ? range.min : undefined, max = validNumber(range.max) ? range.max : undefined
        if ((min !== undefined || max !== undefined) && !(min !== undefined && max !== undefined && min > max)) values[field] = { min, max }
      }
      if (Object.keys(values).length && !panel.some(shortcut => shortcut.id === id)) panel.push({ id, label, values })
    }
  }
  return { main, panel }
}

export function CalculatorShortcuts({ kind, mainAttributes, panelRanges, disabled, onMainChange, onPanelApply, onPanelClear }: {
  kind: 'main' | 'panel'; mainAttributes: MainAttributes; panelRanges: PanelRanges; disabled: boolean
  onMainChange: (value: MainAttributes) => void; onPanelApply: (value: PanelRanges) => void; onPanelClear: () => void
}) {
  const [main, setMain] = useState<MainShortcut[]>([])
  const [panel, setPanel] = useState<PanelShortcut[]>([])
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [draftMain, setDraftMain] = useState<MainAttributes>(allMainAttributes)
  const [error, setError] = useState('')
  const labelForm = useForm({ resolver: zodResolver(labelSchema), defaultValues: { label: '' } })
  const panelForm = useForm<PanelInput, unknown, PanelOutput>({ resolver: zodResolver(panelSchema), defaultValues: { label: '', values: emptyRanges() } })
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try { const loaded = loadShortcuts(kind === 'main' ? mainStorageKey : panelStorageKey, kind); setMain(loaded.main); setPanel(loaded.panel) }
      catch { setError('无法读取本地快捷条件，仍可使用内置条件。') }
      setReady(true)
    })
    return () => { active = false }
  }, [kind])
  function persist(nextMain: MainShortcut[], nextPanel: PanelShortcut[]) {
    try { localStorage.setItem(kind === 'main' ? mainStorageKey : panelStorageKey, JSON.stringify(kind === 'main' ? nextMain : nextPanel)); setMain(nextMain); setPanel(nextPanel); setError(''); return true }
    catch { setError('浏览器未允许保存快捷条件，请检查本地存储空间或权限。'); return false }
  }
  function startEdit(shortcut?: MainShortcut | PanelShortcut) {
    setEditingId(shortcut?.id)
    setError('')
    labelForm.reset({ label: shortcut?.label || '' })
    setDraftMain(shortcut && 'mainAttributes' in shortcut ? structuredClone(shortcut.mainAttributes) : allMainAttributes())
    const values = emptyRanges()
    if (shortcut && 'values' in shortcut) for (const { key } of panelFields) values[key] = { min: shortcut.values[key]?.min ?? '', max: shortcut.values[key]?.max ?? '' }
    panelForm.reset({ label: shortcut?.label || '', values })
    setOpen(true)
  }
  function saveMain({ label }: z.output<typeof labelSchema>) {
    if (!positions.every(position => draftMain[position]?.length)) { setError('2、4、6 号位请各选择至少一项主属性。'); return }
    if (!editingId && main.length >= 50) { setError('最多保存 50 个自定义快捷条件，请先删除不再使用的条件。'); return }
    const next = { id: editingId || createId(), label, mainAttributes: structuredClone(draftMain) }
    if (persist(editingId ? main.map(item => item.id === editingId ? next : item) : [...main, next], panel)) setOpen(false)
  }
  function savePanel({ label, values }: PanelOutput) {
    const ranges: PanelRanges = {}
    for (const { key, label: fieldLabel } of panelFields) {
      const { min, max } = values[key]
      if (min !== '' && max !== '' && min > max) { setError(`${fieldLabel}的下限不能大于上限。`); return }
      if (min !== '' || max !== '') ranges[key] = { min: min === '' ? undefined : min, max: max === '' ? undefined : max }
    }
    if (!Object.keys(ranges).length) { setError('请至少填写一个范围条件。'); return }
    if (!editingId && panel.length >= 50) { setError('最多保存 50 个自定义快捷条件，请先删除不再使用的条件。'); return }
    const next = { id: editingId || createId(), label, values: ranges }
    if (persist(main, editingId ? panel.map(item => item.id === editingId ? next : item) : [...panel, next])) setOpen(false)
  }
  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      {kind === 'main' ? [...mainPresets, ...main].map(shortcut => <button key={shortcut.id} type="button" className={`quiet-button border ${sameMain(mainAttributes, shortcut.mainAttributes) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border'}`} aria-pressed={sameMain(mainAttributes, shortcut.mainAttributes)} disabled={disabled} onClick={() => onMainChange(sameMain(mainAttributes, shortcut.mainAttributes) ? allMainAttributes() : structuredClone(shortcut.mainAttributes))}>{shortcut.label}</button>) : [...panelPresets, ...panel].map(shortcut => <button key={shortcut.id} type="button" className={`quiet-button border ${samePanel(panelRanges, shortcut.values) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border'}`} aria-pressed={samePanel(panelRanges, shortcut.values)} disabled={disabled} onClick={() => onPanelApply(shortcut.values)}>{shortcut.label}</button>)}
      <button type="button" className="quiet-button border border-border" aria-label={kind === 'main' ? '清空主属性' : '清空面板范围'} disabled={disabled} onClick={() => kind === 'main' ? onMainChange({}) : onPanelClear()}>清空</button>
      <button type="button" className="quiet-button text-primary" disabled={disabled || !ready} aria-label={kind === 'main' ? '管理自定义主属性快捷条件' : '管理自定义面板快捷条件'} onClick={() => startEdit()}><Plus size={15} />自定义</button>
    </div>
    {error && !open && <p role="status" className="mb-3 text-xs text-destructive">{error}</p>}
    <PickerDialog open={open} onOpenChange={setOpen} title={`${editingId ? '编辑' : '新增'}${kind === 'main' ? '主属性' : '面板'}快捷条件`} className="max-w-3xl!">
      <div className="space-y-4">
        <label className="grid gap-2 text-sm">快捷条件名称<input className="field" maxLength={200} {...(kind === 'main' ? labelForm.register('label') : panelForm.register('label'))} /></label>
        {kind === 'main' ? <div className="grid gap-4 sm:grid-cols-3">{positions.map(position => <fieldset key={position}><legend className="mb-2 text-sm font-medium">{position} 号位</legend><div className="flex flex-wrap gap-1.5">{mainAttributeOptions[position].map(value => <FilterOption key={value} checked={draftMain[position]?.includes(value) || false} onChange={() => setDraftMain(previous => ({ ...previous, [position]: previous[position]?.includes(value) ? previous[position]?.filter(item => item !== value) : [...(previous[position] || []), value] }))}>{value}</FilterOption>)}</div></fieldset>)}</div> : <div className="grid gap-3 sm:grid-cols-2">{panelFields.map(({ key, label, suffix }) => <fieldset key={key}><legend className="mb-2 text-xs text-muted-foreground">{label}{suffix}</legend><div className="flex items-center gap-2"><input type="number" min="0" step="any" className="field w-full min-w-0" aria-label={`快捷条件${label}下限`} placeholder="下限" {...panelForm.register(`values.${key}.min`)} /><span aria-hidden="true">–</span><input type="number" min="0" step="any" className="field w-full min-w-0" aria-label={`快捷条件${label}上限`} placeholder="上限" {...panelForm.register(`values.${key}.max`)} /></div></fieldset>)}</div>}
        {(error || Object.keys(kind === 'main' ? labelForm.formState.errors : panelForm.formState.errors).length > 0) && <p role="alert" className="text-sm text-destructive">{error || '请填写名称和有效的非负范围。'}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setOpen(false)}>取消</button><button type="button" className="primary-button" onClick={() => { void (kind === 'main' ? labelForm.handleSubmit(saveMain)() : panelForm.handleSubmit(savePanel)()) }}>保存快捷条件</button></div>
        {(kind === 'main' ? main : panel).length > 0 && <section className="border-t border-border pt-4"><h3 className="mb-2 text-sm font-medium">已保存的自定义条件</h3><ul className="divide-y divide-border">{(kind === 'main' ? main : panel).map(shortcut => <li key={shortcut.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-words">{shortcut.label}</span><div className="flex shrink-0 gap-1"><button type="button" className="quiet-button" aria-label={`编辑${shortcut.label}`} onClick={() => startEdit(shortcut)}><Pencil size={15} /></button><button type="button" className="quiet-button" aria-label={`删除${shortcut.label}`} onClick={() => { if (persist(main.filter(item => item.id !== shortcut.id), panel.filter(item => item.id !== shortcut.id)) && editingId === shortcut.id) startEdit() }}><Trash2 size={15} /></button></div></li>)}</ul></section>}
      </div>
    </PickerDialog>
  </>
}
