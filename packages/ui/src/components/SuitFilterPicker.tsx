'use client'

import { useState } from 'react'
import type { RelicView } from '@phoenix/types'
import { Button } from '@phoenix/ui/components/button'
import { twoPieceAttributeOrderMap } from '@phoenix/utils'
import { Check, ListFilter } from 'lucide-react'
import { SuitIcon } from './GameIcon'
import { PickerDialog } from './PickerDialog'

const omaGroup = '逢魔御魂'
const otherGroup = '其他套装'
type SuitOption = { id: number; name: string; group: string }

export function getSuitOptions(relics: RelicView[]) {
  const options = new Map<string, SuitOption>()
  for (const { suit, setBonusAttribute } of relics) {
    if (suit && !options.has(suit.name)) {
      options.set(suit.name, { id: suit.id, name: suit.name, group: suit.isTwoPieceSet || setBonusAttribute ? omaGroup : suit.twoPieceAttribute || otherGroup })
    }
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function groupOrder(name: string) {
  return twoPieceAttributeOrderMap.get(name) ?? (name === omaGroup ? twoPieceAttributeOrderMap.size + 1 : name === otherGroup ? twoPieceAttributeOrderMap.size + 2 : twoPieceAttributeOrderMap.size)
}

export function SuitFilterPicker({ title, options, selected, onChange, defaults = [], all = false, deferred = false, single = false }: {
  title: string
  options: SuitOption[]
  selected: string[]
  onChange: (names: string[]) => void
  defaults?: string[]
  all?: boolean
  deferred?: boolean
  single?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(selected)
  const active = deferred ? draft : selected
  const groups = new Map<string, SuitOption[]>()
  for (const option of options) {
    if (option.name.includes(search.trim())) {
      const group = groups.get(option.group)
      if (group) group.push(option)
      else groups.set(option.group, [option])
    }
  }
  const ordered = [...groups].sort(([a], [b]) => groupOrder(a) - groupOrder(b) || a.localeCompare(b, 'zh-CN'))
  const change = deferred ? setDraft : onChange

  return <>
    <Button variant="outline" type="button" aria-haspopup="dialog" onClick={() => { setSearch(''); setDraft(selected); setOpen(true) }}><ListFilter aria-hidden="true" />{title}</Button>
    <PickerDialog open={open} onOpenChange={setOpen} title={title}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" className="field min-w-0 flex-1" aria-label="搜索御魂名称" placeholder="搜索御魂名称" value={search} onChange={(event) => setSearch(event.target.value)} />
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">已选 {active.filter((name) => options.some((option) => option.name === name)).length} 种</p>
        </div>
        {ordered.length ? ordered.map(([group, suits]) => <section key={group} aria-label={group}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{group}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,5.4rem),1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
            {suits.map(({ id, name }) => {
              const isSelected = active.includes(name)
              return <button type="button" key={name} aria-pressed={isSelected} onClick={() => { change(isSelected ? active.filter((item) => item !== name) : single ? [name] : [...active, name]); if (single) setOpen(false) }} className={`relative flex min-h-12 min-w-0 cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${isSelected ? 'border-primary/60 bg-primary/10 font-semibold text-primary' : 'border-border bg-muted/30 hover:border-primary/50'}`}>
                <SuitIcon id={id} size={28} /><span className="min-w-0 wrap-break-word">{name}</span>{isSelected && <Check className="absolute right-0.5 top-0.5 size-3" aria-hidden="true" />}
              </button>
            })}
          </div>
        </section>) : <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的御魂，请更换关键词。</p>}
      </div>
      <footer className="sticky bottom-0 mt-4 flex flex-wrap justify-between gap-2 border-t border-border bg-background py-2">
        <div className="flex flex-wrap gap-1">
          {all && <Button variant="ghost" type="button" onClick={() => change(options.map(({ name }) => name))}>全选</Button>}
          {all && <Button variant="ghost" type="button" onClick={() => change([])}>清空</Button>}
          <Button variant="ghost" type="button" disabled={single && !active.length} onClick={() => { change(defaults); if (single) setOpen(false) }}>重置</Button>
        </div>
        <Button type="button" onClick={() => { if (deferred) onChange(draft); setOpen(false) }}>完成</Button>
      </footer>
    </PickerDialog>
  </>
}
