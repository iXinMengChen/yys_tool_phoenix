'use client'

import Link from 'next/link'
import { useAccount } from '../context'
import { apiBaseUrl } from '@phoenix/config/public-env'
import { AccountPage as SharedAccountPage } from '@phoenix/ui/pages'

export default function AccountPage() {
  const { dataset, staticData, loadProduct, isLoading, error, session, history, clearHistory, historyWarning } = useAccount()
  const apiRoot = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  return <SharedAccountPage
    dataset={dataset}
    staticData={staticData}
    historyCount={history.length}
    isLoading={isLoading}
    error={error}
    historyWarning={historyWarning}
    sessionMessage={session ? session.configured ? undefined : '' : ''}
    onLoadProduct={loadProduct}
    onClearHistory={clearHistory}
    assets={{ assetUrl: path => /^(heroes|suits)\/\d+\.png$/.test(path) ? `${apiRoot}/cbg/images/${path}` : `/assets/haolai/${path}`, collectionImageUrl: (kind, id) => `${apiRoot}/cbg/images/${kind}/${id}.png` }}
    renderLink={({ href, className, children }) => <Link href={href} className={className}>{children}</Link>}
    hrefs={{ speed: '/yys-cbg-inspector/speed', relics: '/yys-cbg-inspector/relics', pve: '/yys-cbg-inspector/pve', collections: '/yys-cbg-inspector/collections', prefix: '/yys-cbg-inspector/' }}
    clearHistoryLabel="清除此浏览器查询记录"
  />
}
