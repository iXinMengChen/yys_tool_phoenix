'use client'

import { createContext, useContext, useOptimistic, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'

const NavigationContext = createContext<{
  activePath: string
  isPending: boolean
  navigate: (href: string) => void
} | null>(null)

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [activePath, setActivePath] = useOptimistic(pathname)
  const [isPending, startTransition] = useTransition()

  function navigate(href: string) {
    startTransition(() => {
      setActivePath(href)
      router.push(href)
    })
  }

  return (
    <NavigationContext value={{ activePath, isPending, navigate }}>
      {children}
      {isPending && (
        <div key={activePath} role="status" aria-live="polite" className="navigation-loading pointer-events-none fixed inset-0 z-50 grid place-items-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4 text-sm text-foreground shadow-lg">
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary motion-reduce:animate-none" />
            正在切换页面…
          </div>
        </div>
      )}
    </NavigationContext>
  )
}

export function useNavigation() {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('NavigationProvider is required')
  return navigation
}
