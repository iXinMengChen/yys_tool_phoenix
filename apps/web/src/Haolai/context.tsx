'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from '@phoenix/api-client'
import type { CbgProductData, CbgSessionStatus, CbgStaticData, RelicDataset, RelicSuitConfig } from '@phoenix/types'
import { createRelicSuitConfig, parseProductUrl } from '@phoenix/utils'
import { apiClient } from '@/api/client'
import type { AccountWorkerResponse } from './account.worker'
import { canonicalProductUrl, clearAccountHistory, getStaticRefreshAvailableAt, legacyHistoryKey, listAccountHistory, loadAccountHistory, loadCachedStaticData, readLegacyHistory, saveAccountHistory, type AccountHistoryItem } from './history'
import { loadStaticData } from './static-data'
import { uploadProductSummary } from './product-summary'

type AccountState = {
  dataset: RelicDataset | null
  history: AccountHistoryItem[]
  staticData: CbgStaticData | null
  session: CbgSessionStatus | null
  isLoading: boolean
  error: string
  historyWarning: string
  loadProduct: (url: string) => Promise<void>
  restoreHistory: (item: AccountHistoryItem) => Promise<void>
  staticRefreshAvailableAt: number
  refreshStatic: () => Promise<void>
  clearHistory: () => Promise<void>
}
const AccountContext = createContext<AccountState | null>(null)

function messageFromError(error: unknown) {
  if (isAxiosError(error)) {
    if (error.response?.status === 429) return '查询次数较多，请稍后再试。'
    if (error.response?.status === 503) return '藏宝阁暂时无法读取，请稍后重试。'
    if (error.response?.status === 400) return '链接无法识别，请复制完整的藏宝阁商品链接后重试。'
    return '读取失败，请检查网络和商品链接后重试。'
  }
  return error instanceof Error ? error.message : '读取失败，请稍后重试。'
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<RelicDataset | null>(null)
  const [history, setHistory] = useState<AccountHistoryItem[]>([])
  const [staticData, setStaticData] = useState<CbgStaticData | null>(null)
  const [staticRefreshAvailableAt, setStaticRefreshAvailableAt] = useState(0)
  const [session, setSession] = useState<CbgSessionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')
  const requestPending = useRef(false)
  const historyReady = useRef<Promise<void>>(Promise.resolve())
  const parserWorker = useRef<{ worker: Worker; cancel: () => void } | null>(null)
  const staticRequest = useRef(0)

  useEffect(() => {
    let isActive = true
    historyReady.current = (async () => {
      let legacy: AccountHistoryItem[] = []
      try { legacy = readLegacyHistory(localStorage.getItem(legacyHistoryKey)) } catch { /* IndexedDB 仍可能可用。 */ }
      try {
        const entries = await listAccountHistory(legacy)
        if (isActive) setHistory(entries)
        try { localStorage.removeItem(legacyHistoryKey) } catch { /* 已迁入 IndexedDB，不影响恢复。 */ }
      } catch {
        if (isActive) { setHistory(legacy); setHistoryWarning('无法保存最近查询，请允许浏览器保存网站数据后重试。') }
      }
    })()
    void apiClient.get<CbgSessionStatus>('/cbg/session').then(response => { if (isActive) setSession(response.data) }).catch(() => {})
    void getStaticRefreshAvailableAt().then(value => { if (isActive) setStaticRefreshAvailableAt(value) }).catch(() => {})
    const version = ++staticRequest.current
    void loadCachedStaticData().then(cached => {
      if (isActive && version === staticRequest.current && cached) setStaticData(current => current ?? cached.data)
    }).catch(() => {})
    void loadStaticData().then(data => {
      if (isActive && version === staticRequest.current) setStaticData(data)
    }).catch(() => {})
    return () => { isActive = false; parserWorker.current?.cancel() }
  }, [])

  const refreshStatic = useCallback(async () => {
    const version = ++staticRequest.current
    try {
      const data = await loadStaticData(true)
      if (version === staticRequest.current) setStaticData(data)
    } finally {
      await getStaticRefreshAvailableAt().then(setStaticRefreshAvailableAt).catch(() => {})
    }
  }, [])

  async function readAccount(product: CbgProductData, suitConfig: RelicSuitConfig) {
    const decoded = await new Promise<RelicDataset>((resolve, reject) => {
      parserWorker.current?.cancel()
      const worker = new Worker(new URL('./account.worker.ts', import.meta.url))
      const finish = () => { worker.terminate(); if (parserWorker.current?.worker === worker) parserWorker.current = null }
      parserWorker.current = { worker, cancel: () => { finish(); reject(new Error('账号解析已取消')) } }
      worker.onmessage = ({ data }: MessageEvent<AccountWorkerResponse>) => {
        finish()
        if ('error' in data) reject(new Error(data.error))
        else resolve(data.dataset)
      }
      worker.onerror = event => { event.preventDefault(); finish(); reject(new Error('浏览器无法解析账号资料，请重新读取。')) }
      try { worker.postMessage({ product, suitConfig }) } catch (cause) { finish(); reject(cause) }
    })
    setDataset(decoded)
    void uploadProductSummary(product, decoded).catch(() => { /* 后台尽力上传，不影响账号查看；下次读取时重试。 */ })
    return decoded
  }

  async function loadProduct(url: string) {
    if (requestPending.current) return
    requestPending.current = true
    setError('')
    setIsLoading(true)
    try {
      const parsed = parseProductUrl(url)
      const version = staticRequest.current
      const catalog = staticData ?? await loadStaticData()
      if (version === staticRequest.current) setStaticData(current => current ?? catalog)
      const response = await apiClient.request<CbgProductData>({
        url: '/cbg/product', method: 'GET',
        // 商品可能在 API 排队，超时预算需包含前方查询的等待时间。
        timeout: 300_000,
        params: {
          serverid: parsed.serverid, ordersn: parsed.ordersn, channel: parsed.channel,
          view_loc: parsed.viewLoc, tfid: parsed.tfid, tcid: parsed.tcid,
        },
      })
      if (!response.data) throw new Error(response.message)
      const product = response.data
      const suitConfig = createRelicSuitConfig(catalog.relicSuits)
      const decoded = await readAccount(product, suitConfig)
      await historyReady.current
      try {
        const entries = await saveAccountHistory({
          url: canonicalProductUrl(product.sourceUrl), title: (decoded.account?.name || decoded.account?.title || parsed.ordersn).slice(0, 200),
          at: Date.now(), hasData: true, product, suitConfig,
        })
        setHistory(entries)
        setHistoryWarning('')
      } catch { setHistoryWarning('账号已读取，但本地保存失败；请检查浏览器存储权限和剩余空间。') }
      void apiClient.get<CbgSessionStatus>('/cbg/session').then(result => setSession(result.data)).catch(() => {})
    } catch (cause) { setError(messageFromError(cause)) }
    finally { requestPending.current = false; setIsLoading(false) }
  }

  async function restoreHistory(item: AccountHistoryItem) {
    if (!item.hasData) return loadProduct(item.url)
    if (requestPending.current) return
    requestPending.current = true
    setError('')
    setIsLoading(true)
    try {
      const { product, suitConfig } = await loadAccountHistory(item.url)
      await readAccount(product, suitConfig)
    } catch (cause) { setError(messageFromError(cause)) }
    finally { requestPending.current = false; setIsLoading(false) }
  }

  async function clearHistory() {
    if (requestPending.current) return
    requestPending.current = true
    try {
      await historyReady.current
      await clearAccountHistory()
      try { localStorage.removeItem(legacyHistoryKey) } catch { /* IndexedDB 中的账号记录已清除。 */ }
      setHistory([])
      setHistoryWarning('')
    } catch { setHistoryWarning('本地历史记录清除失败，请检查浏览器存储权限后重试。') }
    finally { requestPending.current = false }
  }

  const displayDataset = useMemo(() => dataset && staticData?.heroCatalog ? { ...dataset, heroes: dataset.heroes?.map(hero => ({ ...hero, name: staticData.heroCatalog?.[String(hero.heroId)]?.name ?? hero.name })) } : dataset, [dataset, staticData])

  return <AccountContext value={{ dataset: displayDataset, history, staticData, session, isLoading, error, historyWarning, loadProduct, restoreHistory, staticRefreshAvailableAt, refreshStatic, clearHistory }}>{children}</AccountContext>
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('账号页面需要 AccountProvider')
  return context
}
