'use client'

import { useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccount } from '@/features/account/context'
import { assetUrl } from '@/lib/assetUrl'
import { AccountPage as SharedAccountPage } from '@phoenix/ui/pages'

export default function AccountPage() {
  const { dataset, staticData, loadProduct, isLoading, error, loginStatus, refreshSession, openCbgWindow, history, clearHistory, historyWarning } = useAccount()
  const [loginMessage, setLoginMessage] = useState('')
  const [isOpeningLogin, setIsOpeningLogin] = useState(false)
  async function openLoginWindow() {
    setIsOpeningLogin(true)
    setLoginMessage('')
    try { await openCbgWindow('official'); await refreshSession('official') }
    catch (cause) { setLoginMessage(cause instanceof Error ? cause.message : '无法打开藏宝阁窗口，请稍后重试。') }
    finally { setIsOpeningLogin(false) }
  }
  return <SharedAccountPage
    dataset={dataset}
    staticData={staticData}
    historyCount={history.length}
    isLoading={isLoading}
    error={error}
    historyWarning={historyWarning}
    sessionMessage="在软件的藏宝阁窗口中打开商品，账号资料会实时同步到这里。"
    onLoadProduct={loadProduct}
    onClearHistory={clearHistory}
    assets={{ assetUrl, collectionImageUrl: (kind, id) => assetUrl(`${kind}/${id}.png`) }}
    renderLink={({ href, className, children }) => <Link to={href} className={className}>{children}</Link>}
    hrefs={{ speed: '/speed', relics: '/relics', pve: '/pve', collections: '/collections', prefix: '/' }}
    clipboardFailureMessage="桌面应用未允许读取剪贴板，请手动粘贴链接。"
    clearHistoryLabel="清除此设备查询记录"
    loginControls={
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="quiet-button" onClick={() => void openLoginWindow()} disabled={isOpeningLogin}>
          {isOpeningLogin ? <LoaderCircle size={16} className="animate-spin" /> : <ExternalLink size={16} />}
          藏宝阁登录
        </button>
        <span className="text-xs text-muted-foreground" role="status">
          {loginStatus === true ? '已登录' : loginStatus === false ? '未登录' : '登录状态未知'}
        </span>
        {loginMessage && <p role="alert" className="w-full text-sm text-destructive">{loginMessage}</p>}
      </div>
    }
  />
}
