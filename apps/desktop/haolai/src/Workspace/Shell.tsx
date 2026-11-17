import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Download, Menu, Moon, Sun, SunMoon, X } from 'lucide-react'
import type { DesktopReleaseInfo } from '@phoenix/types'
import { compareVersions, parseDesktopReleaseResponse } from '@/lib/desktopRelease'
import { Button } from '@phoenix/ui/components/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@phoenix/ui/components/sheet'
import { useIsMobile } from '@phoenix/ui/hooks/use-mobile'
import Sidebar from './Sidebar'
import PageTransition from './PageTransition'
import CachedOutlet from './CachedOutlet'
import { pageTitleByPath } from './pageTitleByPath'
import { useAccount } from '@/features/account/context'
import { applyTheme, getStoredTheme, persistTheme } from '@/lib/theme'

const releaseEndpoint = import.meta.env.VITE_DESKTOP_VERSION_URL?.trim()
const updateReminderKey = 'phoenix-desktop-update-reminders'
function updateRemindersEnabled() {
  try { return localStorage.getItem(updateReminderKey) !== 'false' } catch { return true }
}
type AvailableUpdate = Extract<DesktopReleaseInfo, { configured: true }>

function MobileNavigation({ toggleTheme }: { toggleTheme: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  return <Sheet open={isOpen} onOpenChange={setIsOpen}>
    <SheetTrigger render={<Button variant="ghost" size="icon" className="size-11 shrink-0 md:hidden" aria-label="打开导航菜单" />}><Menu aria-hidden="true" /></SheetTrigger>
    <SheetContent side="right" className="mobile-navigation w-[min(20rem,calc(100%-2.5rem))]! gap-0 bg-surface text-foreground">
      <SheetHeader className="shrink-0 border-b border-border pr-16">
        <SheetTitle>导航菜单</SheetTitle>
        <SheetDescription className="sr-only">切换页面、恢复最近查询或更新资料</SheetDescription>
      </SheetHeader>
      <Sidebar onNavigate={() => setIsOpen(false)} />
      <div className="shrink-0 border-t border-border p-3">
        <Button variant="ghost" className="min-h-11 w-full justify-start" onClick={toggleTheme}><SunMoon aria-hidden="true" />切换深色 / 浅色主题</Button>
      </div>
    </SheetContent>
  </Sheet>
}

export default function Shell() {
  const { pathname } = useLocation()
  const { dataset, openCbgWindow, isLoading, error: accountError } = useAccount()
  const isMobile = useIsMobile()
  const mainRef = useRef<HTMLElement>(null)
  const scrollPositions = useRef(new Map<string, { main: number; window: number }>())
  const [theme, setTheme] = useState(getStoredTheme)
  const [error, setError] = useState('')
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [openingUpdate, setOpeningUpdate] = useState(false)
  const [updateDownloadError, setUpdateDownloadError] = useState('')
  const openingUpdateRef = useRef(false)
  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')
  useEffect(() => {
    if (!releaseEndpoint || !window.desktop || !('__TAURI_INTERNALS__' in window)) return
    let active = true
    const check = async () => {
      try {
        if (!updateRemindersEnabled()) return
        const [current, response] = await Promise.all([
          window.desktop!.getAppVersion(),
          window.desktop!.getDesktopRelease(releaseEndpoint),
        ])
        const release = parseDesktopReleaseResponse(response)
        if (active && updateRemindersEnabled() && release.configured && compareVersions(release.version, current) > 0) {
          setAvailableUpdate(release)
        }
      } catch {
        // 启动提醒失败不打断账号查询，设置页仍可手动检查。
      }
    }
    void check()
    const onSettingChanged = () => {
      if (!updateRemindersEnabled()) setAvailableUpdate(null)
    }
    window.addEventListener('phoenix-update-reminders-changed', onSettingChanged)
    return () => {
      active = false
      window.removeEventListener('phoenix-update-reminders-changed', onSettingChanged)
    }
  }, [])
  const openUpdate = async () => {
    if (!availableUpdate || !window.desktop || openingUpdateRef.current) return
    openingUpdateRef.current = true
    setOpeningUpdate(true)
    setUpdateDownloadError('')
    try {
      await window.desktop.openDesktopDownload(availableUpdate.downloadUrl)
    } catch (reason) {
      setUpdateDownloadError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      openingUpdateRef.current = false
      setOpeningUpdate(false)
    }
  }
  useEffect(() => {
    applyTheme(theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    persistTheme(theme)
  }, [theme])
  useLayoutEffect(() => {
    const main = mainRef.current
    const position = scrollPositions.current.get(pathname)
    main?.scrollTo(0, position?.main ?? 0)
    window.scrollTo(0, position?.window ?? 0)
    const rememberScroll = () => {
      scrollPositions.current.set(pathname, { main: main?.scrollTop ?? 0, window: window.scrollY })
    }
    main?.addEventListener('scroll', rememberScroll)
    window.addEventListener('scroll', rememberScroll)
    return () => {
      main?.removeEventListener('scroll', rememberScroll)
      window.removeEventListener('scroll', rememberScroll)
    }
  }, [pathname])
  return <div className="tool-shell relative flex min-h-svh w-full flex-col bg-background md:h-dvh">
    <div className={pathname === '/' && !dataset ? 'tool-workspace grid-cols-1' : 'tool-workspace'}>
      {(pathname !== '/' || dataset) && <div className="hidden border-r border-border bg-sidebar md:block">
        <Sidebar className="sticky top-0 max-h-dvh overflow-y-auto border-r-0" />
      </div>}
      <main ref={mainRef} className="tool-main" id="workspace-content">
        {error && <p role="alert" className="px-6 py-3 text-sm text-destructive">{error}</p>}
        {availableUpdate && !updateDismissed && <div className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm" role="status">
          <Download size={17} className="shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1">发现新版本 <strong>v{availableUpdate.version}</strong>{availableUpdate.notes ? `：${availableUpdate.notes}` : ''}</p>
          <button className="quiet-button" disabled={openingUpdate} onClick={() => void openUpdate()}>{openingUpdate ? '正在打开…' : '前往下载'}</button>
          <button className="quiet-button" aria-label="关闭更新提醒" onClick={() => setUpdateDismissed(true)}><X size={16} /></button>
          <p className="w-full text-xs text-muted-foreground">在浏览器中手动下载安装包，安装前请退出当前应用。</p>
          {updateDownloadError && <p role="alert" className="w-full text-xs text-destructive">无法打开下载页面：{updateDownloadError}。请重试或前往设置检查更新。</p>}
        </div>}
        <PageTransition>
          {(pathname !== '/' || dataset) && <div className="account-context-strip">
            <Link to="/" className="workspace-home">号来 Phoenix</Link>
            <div className="account-context-identity md:ml-auto">
              {dataset && <>
                <p className="truncate text-sm font-medium">{dataset.account?.name || dataset.account?.title || '当前账号'}</p>
                <p className="truncate text-xs text-muted-foreground">{[dataset.account?.serverName, dataset.account?.level ? `${dataset.account.level} 级` : ''].filter(Boolean).join(' · ')}</p>
              </>}
            </div>
            {dataset && <Link className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-xs text-primary hover:underline" to="/">切换账号</Link>}
            <button className="quiet-button size-11 shrink-0 p-0" aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            {isMobile && <MobileNavigation toggleTheme={toggleTheme} />}
          </div>}
          <div className="tool-content">
            {(pathname === '/settings' || pathname === '/account-matcher') && <header className="analysis-header mb-8"><h1>{pageTitleByPath[pathname]}</h1></header>}
            {pathname !== '/' && <>
              {isLoading && <p role="status" className="mb-5 text-sm text-primary">正在读取账号和御魂资料…</p>}
              {accountError && <p role="alert" className="mb-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{accountError}<Link to="/" className="ml-2 underline underline-offset-4">返回账号查询</Link></p>}
            </>}
            <CachedOutlet />
          </div>
        </PageTransition>
      </main>
    </div>
  </div>
}
