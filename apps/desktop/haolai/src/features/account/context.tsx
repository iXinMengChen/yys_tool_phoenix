import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CbgChannel, CbgProductData, CbgSessionStatus, CbgStaticData, RelicDataset, RelicSuitConfig } from '@phoenix/types'
import { createRelicSuitConfig, parseProductUrl } from '@phoenix/utils'
import { readLocalStatic } from './localStatic'
import { localProduct } from './localProduct'
import type { AccountWorkerResponse } from './account.worker'
import { clearAccountHistory, collectionParserVersion, legacyHistoryKey, listAccountHistory, loadAccountHistory, readLegacyHistory, saveAccountHistory, type AccountHistoryItem } from './history'

type AccountState = {
  dataset: RelicDataset | null
  history: AccountHistoryItem[]
  staticData: CbgStaticData | null
  staticAssetVersion: number
  session: CbgSessionStatus | null
  isLoading: boolean
  error: string
  historyWarning: string
  loadProduct: (url: string) => Promise<void>
  restoreHistory: (item: AccountHistoryItem) => Promise<void>
  refreshStatic: () => Promise<void>
  clearHistory: () => Promise<void>
  loginChannel: CbgChannel
  setLoginChannel: (channel: CbgChannel) => void
  loginStatus: boolean | null
  refreshSession: (channel?: CbgChannel) => Promise<void>
  openCbgWindow: (channel?: CbgChannel) => Promise<void>
  cbgSyncEnabled: boolean
  setCbgSyncEnabled: (enabled: boolean) => void
}
const AccountContext = createContext<AccountState | null>(null)
const syncStorageKey = 'yys-cbg-sync-enabled'

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '读取失败，请稍后重试。'
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<RelicDataset | null>(null)
  const [history, setHistory] = useState<AccountHistoryItem[]>([])
  const [staticData, setStaticData] = useState<CbgStaticData | null>(null)
  const [staticAssetVersion, setStaticAssetVersion] = useState(0)
  const [session, setSession] = useState<CbgSessionStatus | null>(null)
  const [loginChannel, setLoginChannel] = useState<CbgChannel>('official')
  const [loginStatus, setLoginStatus] = useState<boolean | null>(null)
  const [cbgSyncEnabled, setCbgSyncEnabled] = useState(() => {
    try { return localStorage.getItem(syncStorageKey) !== 'false' } catch { return true }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')
  const requestPending = useRef(false)
  const historyReady = useRef<Promise<void>>(Promise.resolve())
  const parserWorker = useRef<{ worker: Worker; cancel: () => void } | null>(null)
  const staticRequest = useRef(0)
  const sessionRequest = useRef(0)
  const pendingCapture = useRef<{ pageUrl: string; payload: unknown } | null>(null)
  const mounted = useRef(true)

  const refreshSession = useCallback(async (channel: CbgChannel = loginChannel) => {
    const version = ++sessionRequest.current
    const status = await window.desktop?.getCbgLoginStatus(channel) ?? null
    if (!mounted.current || version !== sessionRequest.current) return
    setLoginStatus(status)
    setSession(status === null ? null : { configured: status, refreshedAt: null })
  }, [loginChannel])

  const openCbgWindow = useCallback(async (channel: CbgChannel = loginChannel) => {
    if (!window.desktop) throw new Error('当前环境暂不支持此操作')
    setLoginChannel(channel)
    await window.desktop.toggleCbgWindow(channel)
    await refreshSession(channel)
  }, [loginChannel, refreshSession])

  useEffect(() => {
    let isActive = true
    mounted.current = true
    historyReady.current = (async () => {
      let legacy: AccountHistoryItem[] = []
      try { legacy = readLegacyHistory(localStorage.getItem(legacyHistoryKey)) } catch { /* IndexedDB 仍可能可用。 */ }
      try {
        const entries = await listAccountHistory(legacy)
        if (isActive) setHistory(entries)
        try { localStorage.removeItem(legacyHistoryKey) } catch { /* 已迁入 IndexedDB。 */ }
      } catch {
        if (isActive) { setHistory(legacy); setHistoryWarning('本地存储不可用，历史数据无法保存；请检查存储权限。') }
      }
    })()
    return () => { isActive = false; mounted.current = false; parserWorker.current?.cancel() }
  }, [])

  useEffect(() => {
    void refreshSession().catch(() => {})
    const timer = window.setInterval(() => void refreshSession().catch(() => {}), 5000)
    return () => window.clearInterval(timer)
  }, [refreshSession])

  useEffect(() => {
    try { localStorage.setItem(syncStorageKey, String(cbgSyncEnabled)) } catch { /* 当前会话仍使用开关值。 */ }
  }, [cbgSyncEnabled])

  const refreshStatic = useCallback(async () => {
    const version = ++staticRequest.current
    const data = await readLocalStatic(true)
    if (mounted.current && version === staticRequest.current) {
      setStaticData(data)
      setStaticAssetVersion(current => current + 1)
    }
  }, [])

  const parseAccount = useCallback((product: CbgProductData, suitConfig: RelicSuitConfig) => {
    return new Promise<RelicDataset>((resolve, reject) => {
      parserWorker.current?.cancel()
      const worker = new Worker(new URL('./account.worker.ts', import.meta.url), { type: 'module' })
      const finish = () => { worker.terminate(); if (parserWorker.current?.worker === worker) parserWorker.current = null }
      parserWorker.current = { worker, cancel: () => { finish(); reject(new Error('账号解析已取消')) } }
      worker.onmessage = ({ data }: MessageEvent<AccountWorkerResponse>) => {
        finish()
        if ('error' in data) reject(new Error(data.error))
        else resolve(data.dataset)
      }
      worker.onerror = event => { event.preventDefault(); finish(); reject(new Error('账号资料解析失败，请重新读取。')) }
      worker.onmessageerror = () => { finish(); reject(new Error('账号解析结果读取失败。')) }
      try { worker.postMessage({ product, suitConfig }) } catch (cause) { finish(); reject(cause) }
    })
  }, [])

  const acceptProduct = useCallback(async (payload: unknown, url: string) => {
    const product = localProduct(payload, url)
    const version = staticRequest.current
    const catalog = staticData ?? await readLocalStatic()
    if (!mounted.current) return
    if (version === staticRequest.current) setStaticData(current => current ?? catalog)
    const suitConfig = createRelicSuitConfig(catalog.relicSuits)
    const decoded = await parseAccount(product, suitConfig)
    if (!mounted.current) return
    setDataset(decoded)
    await historyReady.current
    try {
      const entries = await saveAccountHistory({
        url: product.sourceUrl, title: (decoded.account?.name || decoded.account?.title || parseProductUrl(url).ordersn).slice(0, 200),
        at: Date.now(), hasData: true, product, suitConfig, collectionParserVersion,
      })
      if (mounted.current) { setHistory(entries); setHistoryWarning('') }
    } catch { if (mounted.current) setHistoryWarning('账号已读取，但本地保存失败；请检查存储权限和剩余空间。') }
  }, [parseAccount, staticData])

  async function loadProduct(url: string) {
    if (requestPending.current) return
    requestPending.current = true
    setError('')
    setIsLoading(true)
    try {
      const parsed = parseProductUrl(url)
      if (!window.desktop) throw new Error('当前环境暂不支持此操作')
      setLoginChannel(parsed.channel)
      const payload = await window.desktop.loadProduct(parsed)
      if (mounted.current) await acceptProduct(payload, parsed.sourceUrl)
      void refreshSession(parsed.channel).catch(() => {})
    } catch (cause) { if (mounted.current) setError(messageFromError(cause)) }
    finally { requestPending.current = false; if (mounted.current) setIsLoading(false) }
  }

  // 与旧桌面端共用本地捕获槽位；主动读取和历史恢复期间不消费捕获。
  useEffect(() => {
    if (!cbgSyncEnabled || !('__TAURI_INTERNALS__' in window)) return
    let stopped = false
    let checking = false
    const poll = async () => {
      if (stopped || checking || requestPending.current) return
      checking = true
      let captured = false
      try {
        const capture = pendingCapture.current ?? await window.desktop?.takeCbgPageCapture()
        if (!capture) return
        pendingCapture.current = capture
        if (stopped || requestPending.current) return
        pendingCapture.current = null
        requestPending.current = true
        captured = true
        setIsLoading(true)
        setError('')
        setLoginChannel(parseProductUrl(capture.pageUrl).channel)
        await acceptProduct(capture.payload, capture.pageUrl)
      } catch (cause) { if (!stopped) setError(messageFromError(cause)) }
      finally {
        checking = false
        if (captured) {
          requestPending.current = false
          if (mounted.current) setIsLoading(false)
        }
      }
    }
    const timer = window.setInterval(() => void poll(), 800)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [acceptProduct, cbgSyncEnabled])

  async function restoreHistory(item: AccountHistoryItem) {
    if (!item.hasData) return loadProduct(item.url)
    if (requestPending.current) return
    requestPending.current = true
    setError('')
    setIsLoading(true)
    try {
      const snapshot = await loadAccountHistory(item.url)
      if (snapshot.collectionParserVersion !== collectionParserVersion) {
        // 旧快照缺少完整皮肤或逐枚徽章叠图 ID，必须重新读取上游数据。
        if (!window.desktop) throw new Error('收藏数据需要重新读取，请在桌面端打开此账号。')
        await acceptProduct(await window.desktop.loadProduct(parseProductUrl(item.url)), item.url)
        return
      }
      const { product, suitConfig } = snapshot
      // 历史自带解析配置；目录离线不可用时仍允许恢复账号。
      const catalog = staticData ?? await readLocalStatic().catch(() => null)
      if (mounted.current && catalog) setStaticData(current => current ?? catalog)
      const decoded = await parseAccount(product, suitConfig)
      if (mounted.current) setDataset(decoded)
    } catch (cause) { if (mounted.current) setError(messageFromError(cause)) }
    finally { requestPending.current = false; if (mounted.current) setIsLoading(false) }
  }

  async function clearHistory() {
    if (requestPending.current) return
    requestPending.current = true
    try {
      await historyReady.current
      await clearAccountHistory()
      try { localStorage.removeItem(legacyHistoryKey) } catch { /* IndexedDB 记录已清除。 */ }
      setHistory([])
      setHistoryWarning('')
    } catch { setHistoryWarning('本地历史记录清除失败，请检查存储权限后重试。') }
    finally { requestPending.current = false }
  }

  const displayDataset = useMemo(() => dataset && staticData?.heroCatalog ? { ...dataset, heroes: dataset.heroes?.map(hero => ({ ...hero, name: staticData.heroCatalog?.[String(hero.heroId)]?.name ?? hero.name })) } : dataset, [dataset, staticData])
  return <AccountContext value={{ dataset: displayDataset, history, staticData, staticAssetVersion, session, isLoading, error, historyWarning, loadProduct, restoreHistory, refreshStatic, clearHistory, loginChannel, setLoginChannel, loginStatus, refreshSession, openCbgWindow, cbgSyncEnabled, setCbgSyncEnabled }}>{children}</AccountContext>
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('账号页面需要 AccountProvider')
  return context
}
