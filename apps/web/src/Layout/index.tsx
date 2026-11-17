'use client'

import { usePathname } from 'next/navigation'
import { AccountProvider, useAccount } from '@/Haolai/context'
import AppSidebar from './AppSidebar'
import PageHeader from './PageHeader'
import PageTransition from './PageTransition'
import SiteFooter from './SiteFooter'
import { NavigationProvider } from './NavigationProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountProvider><NavigationProvider><Workspace>{children}</Workspace></NavigationProvider></AccountProvider>
}

function Workspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { dataset, history } = useAccount()
  const showNavigation = pathname !== '/' && (pathname !== '/yys-cbg-inspector/home' || Boolean(dataset) || history.length > 0)

  return (
    <div className="tool-shell relative flex min-h-svh w-full flex-col bg-background">
      {!showNavigation && <PageHeader />}
      <div className={showNavigation ? 'tool-workspace' : 'tool-workspace grid-cols-1'}>
        {showNavigation && <div className="hidden border-r border-border bg-sidebar md:block">
          <AppSidebar className="sticky top-0 max-h-dvh overflow-y-auto border-r-0" />
        </div>}
        <main className="tool-main" id="workspace-content"><PageTransition>{children}</PageTransition></main>
      </div>
      <SiteFooter />
    </div>
  )
}
