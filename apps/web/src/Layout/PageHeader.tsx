'use client'

import { BriefcaseBusiness, Menu, SunMoon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@phoenix/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@phoenix/ui/components/sheet'
import { useIsMobile } from '@phoenix/ui/hooks/use-mobile'
import { useAccount } from '@/Haolai/context'
import AppSidebar from './AppSidebar'
import { toggleTheme } from './theme'

export function MobileNavigation() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const { dataset, history } = useAccount()
  const isEmptyEntry = !dataset && history.length === 0 && (pathname === '/' || pathname === '/yys-cbg-inspector/home')
  return isMobile && !isEmptyEntry ? <MobileNavigationSheet /> : null
}

function MobileNavigationSheet() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="size-11 shrink-0 md:hidden" aria-label="打开导航菜单" />}><Menu aria-hidden="true" /></SheetTrigger>
      <SheetContent side="right" className="mobile-navigation w-[min(20rem,calc(100%-2.5rem))]! gap-0 bg-surface text-foreground">
        <SheetHeader className="shrink-0 border-b border-border pr-16">
          <SheetTitle>导航菜单</SheetTitle>
          <SheetDescription className="sr-only">切换页面、恢复最近查询或更新资源</SheetDescription>
        </SheetHeader>
        <AppSidebar onNavigate={() => setIsOpen(false)} />
        <div className="shrink-0 border-t border-border p-3">
          <Button variant="ghost" className="min-h-11 w-full justify-start" onClick={toggleTheme}><SunMoon aria-hidden="true" />切换深色 / 浅色主题</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function PageHeader() {
  const pathname = usePathname()
  const { dataset } = useAccount()
  const isEmptyAccount = pathname === '/yys-cbg-inspector/home' && !dataset
  return (
    <header className={isEmptyAccount ? 'site-header flex' : 'site-header hidden md:flex'}>
      <Link href="/" className="flex items-center gap-2.5 rounded-sm text-sm font-semibold">
        <BriefcaseBusiness size={19} className="text-primary" aria-hidden="true" />
        天真工具箱
      </Link>
      <Button variant="ghost" className="size-10 p-0" aria-label="切换深色或浅色主题" title="切换深色 / 浅色主题" onClick={toggleTheme}>
        <SunMoon aria-hidden="true" className="size-[18px]" />
      </Button>
    </header>
  )
}
