'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Clipboard, Link as LinkIcon, LoaderCircle, X } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { CbgStaticData, RelicDataset } from '@phoenix/types'
import { buildAccountSummary, parseProductUrl } from '@phoenix/utils'
import { AccountOverview } from './AccountOverview'
import { CollectionSummary } from './CollectionsPage'
import { GameIconProvider } from '../components/GameIcon'

const schema = z.object({ url: z.string().trim().min(1, '请粘贴藏宝阁商品链接').refine(value => { try { parseProductUrl(value); return true } catch { return false } }, '请使用官方、华为、OPPO、vivo 或小米渠道的藏宝阁商品链接') })

type LinkProps = { href: string; className?: string; children: ReactNode }
type GameIconAssets = { assetUrl: (path: string) => string; collectionImageUrl: (kind: 'suits' | 'heroes', id: number) => string }
type AccountPageProps = {
  dataset: RelicDataset | null
  staticData: CbgStaticData | null
  historyCount: number
  isLoading: boolean
  error: string
  historyWarning: string
  sessionMessage?: string
  onLoadProduct: (url: string) => Promise<void>
  onClearHistory: () => Promise<void>
  assets: GameIconAssets
  renderLink: (props: LinkProps) => ReactNode
  hrefs?: { speed: string; relics: string; pve: string; collections: string; prefix: string }
  loginControls?: ReactNode
  clipboardFailureMessage?: string
  clearHistoryLabel?: string
}

export function AccountPage({
  dataset,
  staticData,
  historyCount,
  isLoading,
  error,
  historyWarning,
  sessionMessage,
  onLoadProduct,
  onClearHistory,
  assets,
  renderLink,
  hrefs = { speed: '/speed', relics: '/relics', pve: '/pve', collections: '/collections', prefix: '' },
  loginControls,
  clipboardFailureMessage = '浏览器未允许读取剪贴板，请手动粘贴链接。',
  clearHistoryLabel = '清除查询记录',
}: AccountPageProps) {
  const [copyStatus, setCopyStatus] = useState('')
  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { url: '' } })
  const urlValue = useWatch({ control, name: 'url' })
  async function paste() {
    try { setValue('url', await navigator.clipboard.readText(), { shouldValidate: true }); setCopyStatus('') }
    catch { setCopyStatus(clipboardFailureMessage) }
  }
  async function copySummary() {
    if (!dataset) return
    try { await navigator.clipboard.writeText(buildAccountSummary(dataset)); setCopyStatus('账号摘要已复制') }
    catch { setCopyStatus('复制失败，请允许剪贴板权限后重试。') }
  }
  const link = (path: string) => `${hrefs.prefix}${path}`
  return <GameIconProvider assets={assets}><div className={`page-stack account-home${dataset ? ' account-home-loaded' : ''}`}>
    <section className={dataset ? 'account-query analysis-toolbar' : 'account-query'} aria-label={dataset ? '读取其他账号' : '账号查询'}>
      <div className="account-query-panel">
        <form
          className="account-query-form"
          onSubmit={handleSubmit(values => {
            const url = parseProductUrl(values.url).sourceUrl
            setValue('url', url)
            return onLoadProduct(url).then(() => setValue('url', ''))
          })}
        >
          <label htmlFor="product-url" className={dataset ? 'account-query-label' : 'sr-only'}>{dataset ? '读取其他账号' : '藏宝阁商品链接'}</label>
          <div className="account-query-input-row">
            <div className="relative min-w-0 flex-1">
              <LinkIcon size={17} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <input
                {...register('url')}
                id="product-url"
                type="url"
                className="field w-full pl-10 pr-10"
                placeholder="粘贴藏宝阁商品链接"
                aria-invalid={Boolean(errors.url)}
                aria-describedby={errors.url ? 'url-error' : undefined}
                autoComplete="off"
              />
              {urlValue && <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => setValue('url', '', { shouldValidate: true })}
                disabled={isLoading}
                aria-label="清空商品链接"
                title="清空商品链接"
              >
                <X size={16} aria-hidden="true" />
              </button>}
            </div>
            <button type="button" className="quiet-button" onClick={() => void paste()} disabled={isLoading}>
              <Clipboard size={16} />粘贴
            </button>
            <button type="submit" className="primary-button" disabled={isLoading}>
              {isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {isLoading ? '正在读取…' : '读取账号'}
            </button>
          </div>
          {errors.url && <p id="url-error" className="mt-2 text-sm text-destructive">{errors.url.message}</p>}
        </form>
        {(loginControls || sessionMessage) && <div className="account-query-connection">
          {loginControls && <div className="account-query-login">{loginControls}</div>}
          {sessionMessage && <p className="account-query-session" role="status">{sessionMessage}</p>}
        </div>}
        {isLoading && <p role="status" className="mt-3 text-sm text-primary">正在读取账号和御魂资料…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        {historyWarning && <p role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-300">{historyWarning}</p>}
        {copyStatus && <p role="status" className="mt-3 text-sm text-muted-foreground">{copyStatus}</p>}
      </div>
    </section>
    {dataset ? <>
      <AccountOverview dataset={dataset} onCopy={() => void copySummary()} renderLink={renderLink} speedHref={hrefs.speed} relicsHref={hrefs.relics} pveHref={hrefs.pve} />
      <CollectionSummary dataset={dataset} staticData={staticData} renderLink={renderLink} collectionsHref={hrefs.collections} />
      {dataset.account?.sourceUrl && <p className="text-xs leading-6 text-muted-foreground">商品链接：<a href={dataset.account.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-4">{dataset.account.sourceUrl}</a></p>}
      <nav className="flex flex-wrap gap-2 md:hidden" aria-label="分析页面快捷入口">
        {[
          ['speed', '速度盘点'],
          ['pve', 'PVE 预览'],
          ['hero-skills', '式神技能'],
          ['collections', '收藏图鉴'],
          ['calculator', '御魂计算器'],
          ['relics', '御魂库存'],
        ].map(([path, label]) => (
          <Fragment key={path}>
            {renderLink({
              href: link(path),
              className: 'quiet-button',
              children: <>{label}<ArrowRight size={14} aria-hidden="true" /></>,
            })}
          </Fragment>
        ))}
      </nav>
    </> : null}
    {historyCount > 0 && <div className="account-history-actions"><button className="rounded px-1 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={isLoading} onClick={() => void onClearHistory()}>{clearHistoryLabel}</button></div>}
  </div></GameIconProvider>
}
