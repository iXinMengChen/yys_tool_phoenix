'use client'

import { useLayoutEffect, useRef } from 'react'

export function PageTransition({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animation = content.animate([
      { opacity: 0.55, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })

    return () => animation.cancel()
  }, [pathname])

  return <div aria-busy={false}><div ref={contentRef} className="page-transition">{children}</div></div>
}
