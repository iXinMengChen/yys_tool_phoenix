'use client'

import { useRef, useState } from 'react'
import type { AttributeView, RelicView } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import { buildEnhancementStages, formatAttribute, formatDetailedNumber, getAttributeHitCount, getDetailedSubAttributes, getStageAttributeHitCount, sortAttributes } from '@phoenix/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { RelicIcon } from './GameIcon'
import { PickerDialog } from './PickerDialog'

function emphasis(relic: RelicView, attribute: Pick<AttributeView, 'label' | 'value'>, highlights: string[]) {
  if (highlights.includes(attribute.label)) return 'bg-primary/10 font-semibold text-primary'
  if (attribute.label === '速度' && attribute.value > 17 && (relic.position !== 2 || relic.mainAttribute?.label === '速度')) return 'bg-amber-500/12 font-semibold text-amber-800 dark:text-amber-300'
  return ''
}

function AttributeRow({ label, value, count = 0, className = '', isNew = false }: { label: string; value: string; count?: number; className?: string; isNew?: boolean }) {
  return <div className={`flex items-center justify-between gap-1 rounded px-1 py-px ${className}`}>
    <dt className="flex min-w-0 items-center gap-x-1">
      <span className="inline-grid w-4 shrink-0 place-items-center">{count > 0 && <span className="inline-grid min-w-4 place-items-center rounded-full border border-current px-0.5 text-[10px] leading-3.5" aria-label={`强化 ${count} 次`} title={`强化 ${count} 次`}>{count}</span>}</span>
      <span>{label}{isNew && <span className="text-[10px] font-semibold text-primary">新增</span>}</span>
    </dt>
    <dd className="shrink-0 font-medium tabular-nums">+{value}</dd>
  </div>
}

function EnhancementHistory({ relic, highlightedAttributes }: { relic: RelicView; highlightedAttributes: string[] }) {
  const stages = relic.detail?.enhancementStages ?? (relic.detail?.growthRolls?.length
    ? buildEnhancementStages(relic.detail.growthRolls, relic.level, relic.mainAttribute, relic.quality).enhancementStages
    : [])
  const attributes = getDetailedSubAttributes(relic)
  const totals = attributes.length ? attributes : (relic.enhancement?.totals ?? [])
  const [activeIndex, setActiveIndex] = useState(0)
  const track = useRef<HTMLOListElement>(null)
  const selectStage = (index: number) => {
    const list = track.current
    if (list) list.scrollTo({ left: index * list.clientWidth })
  }

  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{relic.position ?? '未知'} 号位 · {relic.quality ?? '未知'} 星 · +{relic.level ?? 0}{relic.id ? <span className="ml-3 break-all">编号 {relic.id}</span> : null}</p>
    {stages.length > 0 && <section aria-label="强化阶段">
      <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
        <Button type="button" size="icon" className="size-11" variant="outline" aria-label="上一强化阶段" disabled={activeIndex === 0} onClick={() => selectStage(activeIndex - 1)}><ChevronLeft aria-hidden="true" /></Button>
        <span className="text-sm font-semibold tabular-nums" aria-live="polite">+{stages[activeIndex]?.level ?? 0}</span>
        <Button type="button" size="icon" className="size-11" variant="outline" aria-label="下一强化阶段" disabled={activeIndex >= stages.length - 1} onClick={() => selectStage(activeIndex + 1)}><ChevronRight aria-hidden="true" /></Button>
      </div>
      <ol ref={track} aria-label="强化阶段对照" tabIndex={0} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded focus-visible:outline-2 focus-visible:outline-ring sm:snap-none sm:gap-2 sm:pb-2" onScroll={(event) => {
        const list = event.currentTarget
        if (list.clientWidth) setActiveIndex(Math.min(stages.length - 1, Math.max(0, Math.round(list.scrollLeft / list.clientWidth))))
      }}>
        {stages.map((stage) => <li key={stage.level} className="min-w-full flex-none snap-center rounded-lg border border-border bg-muted/45 p-2 text-xs sm:w-[calc((100%-2.5rem)/6)] sm:min-w-36">
          <div className="mx-auto mb-2 flex w-fit flex-col items-center gap-1 text-center">
            <strong className="tabular-nums">+{stage.level}</strong><RelicIcon item={relic} />
          </div>
          {stage.available ? <>
            <p className="mb-1 min-h-4 text-center font-medium text-primary">{stage.upgrade ? `${stage.upgrade.isNew ? '新增' : '强化'}${stage.upgrade.label}` : '初始属性'}</p>
            <dl>
              {stage.mainAttribute && <AttributeRow label={stage.mainAttribute.label} value={formatAttribute(stage.mainAttribute)} className="mb-1 border-b border-border text-primary" />}
              {sortAttributes(stage.attributes).map((attribute) => {
                const isPercent = relic.subAttributes?.find(({ label }) => label === attribute.label)?.isPercent ?? false
                const isNew = stage.upgrade?.key === attribute.key && stage.upgrade.isNew
                return <AttributeRow key={attribute.key} label={attribute.label} value={formatAttribute({ ...attribute, isPercent })} isNew={isNew} count={getStageAttributeHitCount(relic, attribute)} className={emphasis(relic, attribute, highlightedAttributes) || (stage.upgrade?.key === attribute.key ? 'font-semibold text-primary' : '')} />
              })}
            </dl>
          </> : <p className="text-center text-muted-foreground">未强化</p>}
        </li>)}
      </ol>
    </section>}
    <section aria-label="精确副属性">
      <h3 className="mb-2 text-sm font-semibold">精确副属性</h3>
      {totals.length ? <dl className="divide-y divide-border">
        {totals.map((attribute) => <div key={attribute.key} className={`grid gap-1 rounded px-2 py-1.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] ${emphasis(relic, { label: attribute.label, value: attribute.total }, highlightedAttributes)}`}>
          <dt className="flex flex-wrap items-baseline gap-x-2">{attribute.label}<span className="text-xs text-muted-foreground">{getAttributeHitCount(relic, attribute.label)} 次强化</span></dt>
          <dd className="break-all tabular-nums"><strong>+{formatDetailedNumber(attribute.total)}</strong>{attribute.values?.length ? <code className="block text-xs leading-relaxed text-muted-foreground">{attribute.values.map(formatDetailedNumber).join(' + ')}</code> : null}</dd>
        </div>)}
      </dl> : <p className="text-sm text-muted-foreground">当前数据未包含逐次强化记录。</p>}
    </section>
  </div>
}

export function RelicDetails({ relic, highlightedAttributes = [], card = false }: { relic: RelicView; highlightedAttributes?: string[]; card?: boolean }) {
  const name = relic.suit?.name || '未知御魂'
  const [open, setOpen] = useState(false)
  return <>
    {card
      ? <h3><button type="button" onClick={() => setOpen(true)} className="min-h-8 cursor-pointer font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring" aria-label={`查看${name}强化详情`} aria-haspopup="dialog">{name}</button></h3>
      : <button type="button" onClick={() => setOpen(true)} className="min-h-11 cursor-pointer rounded text-primary sm:min-h-8 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`查看${name}强化详情`} aria-haspopup="dialog">强化详情</button>}
    <PickerDialog open={open} onOpenChange={setOpen} title={`${name} 强化详情`} className="sm:max-w-6xl">
      <EnhancementHistory relic={relic} highlightedAttributes={highlightedAttributes} />
      <footer className="mt-3 flex justify-end border-t border-border pt-3"><Button type="button" onClick={() => setOpen(false)}>关闭</Button></footer>
    </PickerDialog>
  </>
}

export function RelicCard({ relic, highlightedAttributes = [] }: { relic: RelicView; highlightedAttributes?: string[] }) {
  return <article className="relic-card relative min-h-[11.5rem] min-w-0 rounded-xl border border-border bg-background p-2 text-sm transition-colors hover:border-primary/55">
    <header className="mb-1 flex flex-wrap items-center justify-between gap-x-2">
      <RelicDetails relic={relic} highlightedAttributes={highlightedAttributes} card />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{relic.position ?? '?'}号位 · {relic.quality ?? '?'}星 <strong className="ml-1 text-primary">+{relic.level ?? 0}</strong></span>
    </header>
    <div className="flex items-start gap-1.5">
      <div className="relic-card-icon h-14 w-12 shrink-0 [&>div]:origin-top-left [&>div]:scale-[.857]"><RelicIcon item={relic} /></div>
      <dl className="min-w-0 flex-1 text-xs">
        {relic.mainAttribute ? <AttributeRow label={relic.mainAttribute.label} value={formatAttribute(relic.mainAttribute)} className="mb-1 border-b border-border font-semibold text-primary" /> : <div className="mb-1 text-muted-foreground"><dt className="sr-only">主属性</dt><dd>无主属性数据</dd></div>}
        {sortAttributes(relic.subAttributes ?? []).map((attribute) => <AttributeRow key={attribute.label} label={attribute.label} value={formatAttribute(attribute)} count={getAttributeHitCount(relic, attribute.label)} className={emphasis(relic, attribute, highlightedAttributes)} />)}
      </dl>
    </div>
    {relic.setBonusAttribute && <p className="mt-1.5 border-t border-border pt-1 text-xs text-muted-foreground">逢魔属性：{relic.setBonusAttribute.label} <strong className="font-medium tabular-nums text-foreground">+{formatAttribute(relic.setBonusAttribute)}</strong></p>}
  </article>
}
