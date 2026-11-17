'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function PickerDialog({ open, onOpenChange, onOpenChangeComplete, title, description, children, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
    <Dialog.Portal>
      <Dialog.Backdrop className="picker-backdrop fixed inset-0 z-50 bg-black/50 opacity-100 transition-opacity duration-180 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-130 data-ending-style:ease-in" />
      <Dialog.Popup className={`picker-popup opacity-100 scale-100 transition-[opacity,scale] duration-180 ease-out data-starting-style:opacity-0 data-starting-style:scale-98 data-ending-style:opacity-0 data-ending-style:scale-[.985] data-ending-style:duration-130 data-ending-style:ease-in motion-reduce:scale-100! fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl ${className ?? ''}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div><Dialog.Title className="text-base font-semibold leading-6">{title}</Dialog.Title>{description && <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>}</div>
          <Dialog.Close className="quiet-button size-11 min-w-11 justify-center p-0 sm:size-8 sm:min-h-8 sm:min-w-8" aria-label="关闭"><X size={18} aria-hidden="true" /></Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
