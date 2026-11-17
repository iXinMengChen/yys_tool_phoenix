'use client'


import { Link, useLocation, useNavigate } from 'react-router-dom'

import { History, RefreshCw } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useAccount } from '@/features/account/context'
import brandIcon from '../../src-tauri/icons/128x128.png'
import { navigationGroups, pageTitleByPath } from './navigation'

export default function AppSidebar({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigationRef = useRef<HTMLElement>(null)
  const { history, restoreHistory, isLoading, refreshStatic, staticData, historyWarning } = useAccount()
  const [updateStatus, setUpdateStatus] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  useLayoutEffect(() => {
    const navigation = navigationRef.current
    if (!navigation) return
    const updateIndicator = () => {
      const active = navigation.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) {
        delete navigation.dataset.active
        return
      }
      navigation.style.setProperty('--nav-x', `${active.offsetLeft}px`)
      navigation.style.setProperty('--nav-y', `${active.offsetTop}px`)
      navigation.style.setProperty('--nav-width', `${active.offsetWidth}px`)
      navigation.style.setProperty('--nav-height', `${active.offsetHeight}px`)
      navigation.dataset.active = 'true'
    }
    updateIndicator()
    const observer = new ResizeObserver(updateIndicator)
    observer.observe(navigation)
    navigation.querySelectorAll('a').forEach(link => observer.observe(link))
    return () => observer.disconnect()
  }, [pathname])

  async function updateData() {
    setIsUpdating(true)
    setUpdateStatus('')
    try { await refreshStatic(); setUpdateStatus('游戏资料和图标已更新。') }
    catch { setUpdateStatus('更新失败，请稍后重试') }
    finally { setIsUpdating(false) }
  }

  return (
    <aside className={`tool-sidebar ${className}`}>
      <nav ref={navigationRef} aria-label="主导航" className="tool-navigation">
        <span className="tool-nav-indicator" aria-hidden="true" />
        {navigationGroups.map((group, index) => (
          <div key={group.label} role="group" aria-label={group.label} className="tool-nav-group">
            {index === 0 && <div className="tool-brand">
              <img src={brandIcon} alt="" width={36} height={36} className="rounded-lg" />
              <div><p className="font-semibold">号来</p><p className="text-xs text-muted-foreground">Phoenix</p></div>
            </div>}
            {group.items.map(({ href, icon: Icon }) => (
              <Link key={href} to={href} onClick={onNavigate} aria-current={pathname === href ? 'page' : undefined} className="tool-nav-link">
                <Icon size={18} aria-hidden="true" /><span>{pageTitleByPath[href]}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-secondary">
        <details className="text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-3"><History size={16} aria-hidden="true" /> 最近查询 <span className="ml-auto text-xs text-muted-foreground">{history.length}</span></summary>
          {history.length ? <ul className="max-h-52 space-y-1 overflow-y-auto">{history.map(item => <li key={item.url}><button className="w-full rounded-md p-2 text-left text-xs hover:bg-primary/10 disabled:opacity-50" disabled={isLoading} onClick={() => { if (pathname === '/settings') navigate('/'); void restoreHistory(item); onNavigate?.() }} title={`${item.title} · ${new Date(item.at).toLocaleString('zh-CN')} · ${item.hasData ? '从本地恢复' : '旧记录，需重新读取一次'}`}><span className="block truncate">{item.title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{new Date(item.at).toLocaleDateString('zh-CN')} · {item.hasData ? '本地数据' : '旧记录 · 需读取一次'}</span></button></li>)}</ul> : <p className="py-2 text-xs text-muted-foreground">读取后保存本地数据，点击即可恢复。</p>}
        </details>
        {historyWarning && <p role="status" className="my-2 text-xs leading-5 text-amber-800 dark:text-amber-300">{historyWarning}</p>}
        <button className="flex min-h-10 w-full items-center gap-2 text-left text-sm disabled:opacity-50" disabled={isUpdating} onClick={() => void updateData()}><RefreshCw size={16} className={isUpdating ? 'animate-spin' : ''} aria-hidden="true" />{isUpdating ? '更新中…' : '更新资料'}</button>
        <p role="status" className="mt-1 text-xs text-muted-foreground">{updateStatus}</p>
        {staticData?.missingHeroIds?.length ? <p className="mt-3 text-xs leading-5 text-muted-foreground">有 {staticData.missingHeroIds.length} 个式神暂无基础面板，可在计算器中手动填写。</p> : null}
      </div>
    </aside>
  )
}
