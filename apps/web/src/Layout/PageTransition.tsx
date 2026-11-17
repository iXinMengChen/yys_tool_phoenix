'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { PageTransition as SharedPageTransition } from '@phoenix/ui/components/page-transition'
import { useNavigation } from './NavigationProvider'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activePath, isPending } = useNavigation()
  const departureRef = useRef<HTMLDivElement>(null)
  const isDeparting = isPending && activePath !== pathname

  useLayoutEffect(() => {
    const content = departureRef.current
    if (!content || !isDeparting) return
    const animation = content.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-4px)' },
    ], {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120,
      easing: 'ease-out',
      fill: 'forwards',
    })
    return () => animation.cancel()
  }, [isDeparting, activePath, pathname])

  return <div ref={departureRef} className="page-departure" inert={isDeparting}>
    <SharedPageTransition pathname={pathname}>{children}</SharedPageTransition>
  </div>
}
