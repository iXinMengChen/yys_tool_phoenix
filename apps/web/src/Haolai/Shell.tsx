'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SunMoon } from 'lucide-react'
import { Button } from '@phoenix/ui/components/button'
import { MobileNavigation } from '@/Layout/PageHeader'
import { toggleTheme } from '@/Layout/theme'
import { useAccount } from './context'

export default function HaolaiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { dataset, history, isLoading, error } = useAccount()
  return <>
    {(dataset || history.length > 0 || pathname !== '/yys-cbg-inspector/home') && <div className="account-context-strip">
      <Link href="/" className="workspace-home">天真工具箱</Link>
      <div className="account-context-identity">
        {dataset ? <>
          <span className="font-medium">{dataset.account?.name || dataset.account?.title || '当前账号'}</span>
          <span className="text-xs text-muted-foreground">{[dataset.account?.serverName, dataset.account?.level ? `${dataset.account.level} 级` : ''].filter(Boolean).join(' · ')}</span>
        </> : <span className="text-sm text-muted-foreground">尚未读取账号</span>}
      </div>
      {dataset && <Link href="/yys-cbg-inspector/home" className="context-switch">切换账号</Link>}
      <Button variant="ghost" size="icon" aria-label="切换深色或浅色主题" onClick={toggleTheme}><SunMoon size={18} aria-hidden="true" /></Button>
      <MobileNavigation />
    </div>}
    <div className="tool-content">
      {pathname !== '/yys-cbg-inspector/home' && <>
        {isLoading && <p role="status" className="mb-5 text-sm text-primary">正在读取账号和御魂资料…</p>}
        {error && <p role="alert" className="mb-5 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}<Link href="/yys-cbg-inspector/home" className="ml-2 underline underline-offset-4">返回账号查询</Link></p>}
      </>}
      {children}
    </div>
  </>
}
