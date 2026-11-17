'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { PickerDialog } from '../components/PickerDialog'

export function CalculatorMethodInfo() {
  const [open, setOpen] = useState(false)
  return <>
    <div className="flex justify-center"><button type="button" className="quiet-button text-muted-foreground" onClick={() => setOpen(true)}><Info size={15} />计算器是怎么计算的？</button></div>
    <PickerDialog open={open} onOpenChange={setOpen} title="计算说明" className="max-w-2xl!">
      <div className="space-y-6 text-sm leading-7 text-muted-foreground">
        <section className="space-y-2"><h3 className="font-semibold text-foreground">筛选条件</h3>
          <p>计算会按所选号位、主属性、指定御魂和套装条件组合御魂，并检查速度、暴击、攻击、爆伤、效果命中等面板范围。所有条件都满足的组合才会进入结果。</p>
          <p>没有结果时，可尝试放宽面板范围、主属性或套装条件。</p>
        </section>
        <section className="space-y-2"><h3 className="font-semibold text-foreground">面板与套装</h3>
          <p>面板由式神基础属性、六件御魂的主副属性和你填写的额外属性组成。满足条件的两件套、四件套及逢魔套属性也会计入。</p>
        </section>
        <section className="space-y-2"><h3 className="font-semibold text-foreground">结果与耗时</h3>
          <p>符合全部条件的组合按所选指标排序，并显示设定数量的靠前结果。修改结果数量后，下次计算时生效。</p>
          <p>御魂数量越多、套装和面板条件越细，待比较的组合通常越多，计算可能需要更长时间。</p>
        </section>
      </div>
      <div className="mt-5 flex justify-end"><button type="button" className="primary-button" onClick={() => setOpen(false)}>知道了</button></div>
    </PickerDialog>
  </>
}
