import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@phoenix/ui/lib/utils'

/** Native multi-select behavior with a shared, full-target filter treatment. */
export function FilterOption({ children, className, ...props }: Omit<ComponentProps<'input'>, 'type' | 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <label className={cn('relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-2 text-[13px] leading-4 text-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-muted has-checked:border-primary/60 has-checked:bg-primary/10 has-checked:text-primary dark:has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-disabled:opacity-50 md:min-h-8 md:py-1.5 motion-reduce:transition-none', className)}>
      <input {...props} type="checkbox" className="peer absolute inset-0 size-full cursor-inherit opacity-0" />
      <Check aria-hidden="true" className="pointer-events-none size-3.5 shrink-0 rounded-xs border border-muted-foreground/70 p-px text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground" strokeWidth={2.5} />
      <span className="pointer-events-none min-w-0">{children}</span>
    </label>
  )
}
