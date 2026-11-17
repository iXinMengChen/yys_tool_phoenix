import type { CbgProductData, CbgStaticData, RelicSuitConfig } from '@phoenix/types'
import { parseProductUrl } from '@phoenix/utils'

export type AccountHistoryItem = { url: string; title: string; at: number; hasData: boolean }
export type LocalAccountSnapshot = AccountHistoryItem & { product: CbgProductData; suitConfig: RelicSuitConfig }
export const legacyHistoryKey = 'haolai-product-history-v1'
const historyLimit = 12

export function canonicalProductUrl(url: string) {
  const parsed = new URL(parseProductUrl(url).sourceUrl)
  return `${parsed.origin}${parsed.pathname}`
}

function metadata(value: unknown): AccountHistoryItem | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.url !== 'string' || typeof item.title !== 'string' || typeof item.at !== 'number' || !Number.isFinite(item.at) || item.at < 0 || item.at > Date.now()) return null
  try { return { url: canonicalProductUrl(item.url), title: item.title.slice(0, 200), at: item.at, hasData: item.hasData === true } } catch { return null }
}

export function readLegacyHistory(stored: string | null) {
  try {
    const value: unknown = JSON.parse(stored || '[]')
    return Array.isArray(value) ? value.flatMap(item => {
      const entry = metadata(item)
      return entry ? [{ ...entry, hasData: false }] : []
    }) : []
  } catch { return [] }
}

function sortedHistory(values: unknown[]) {
  return values.flatMap(value => { const entry = metadata(value); return entry ? [entry] : [] })
    .sort((left, right) => right.at - left.at)
    .filter((entry, index, items) => items.findIndex(item => item.url === entry.url) === index)
    .slice(0, historyLimit)
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let isBlocked = false
    const request = indexedDB.open('haolai-local-accounts', 2)
    request.onblocked = () => { isBlocked = true; reject(new Error('请关闭此网站的旧版页面后再重试本地历史记录')) }
    request.onupgradeneeded = () => {
      for (const name of ['entries', 'snapshots']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'url' })
      if (!request.result.objectStoreNames.contains('catalog')) request.result.createObjectStore('catalog')
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      if (isBlocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

async function accessHistory<T>(mode: IDBTransactionMode, run: (entries: IDBObjectStore, snapshots: IDBObjectStore, catalog: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(['entries', 'snapshots', 'catalog'], mode)
      const request = run(transaction.objectStore('entries'), transaction.objectStore('snapshots'), transaction.objectStore('catalog'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error || new Error('本地历史记录读写失败'))
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { database.close() }
}

function pruneHistory(entries: IDBObjectStore, snapshots: IDBObjectStore, values: unknown[]) {
  const history = sortedHistory(values)
  const keep = new Set(history.map(entry => entry.url))
  for (const value of values) {
    const entry = metadata(value)
    if (entry && !keep.has(entry.url)) { entries.delete(entry.url); snapshots.delete(entry.url) }
  }
  return history
}

export async function listAccountHistory(legacy: AccountHistoryItem[] = []) {
  let history: AccountHistoryItem[] = []
  await accessHistory('readwrite', (entries, snapshots) => {
    const request = entries.getAll()
    request.onsuccess = () => {
      const existing = sortedHistory(request.result)
      const incoming = legacy.filter(entry => !existing.some(item => item.url === entry.url))
      for (const entry of incoming) entries.put(entry)
      history = pruneHistory(entries, snapshots, [...request.result, ...incoming])
    }
    return request
  })
  return history
}

export async function saveAccountHistory(snapshot: LocalAccountSnapshot) {
  const values = await accessHistory<unknown[]>('readwrite', (entries, snapshots) => {
    snapshots.put(snapshot)
    entries.put({ url: snapshot.url, title: snapshot.title, at: snapshot.at, hasData: true })
    const request = entries.getAll()
    request.onsuccess = () => { pruneHistory(entries, snapshots, request.result) }
    return request
  })
  return sortedHistory(values)
}

export async function loadAccountHistory(url: string): Promise<LocalAccountSnapshot> {
  const value: unknown = await accessHistory('readonly', (_, snapshots) => snapshots.get(canonicalProductUrl(url)))
  if (!value || typeof value !== 'object') throw new Error('本地账号数据不存在，请重新读取商品。')
  const snapshot = value as LocalAccountSnapshot
  const entry = metadata(value)
  if (!entry || !entry.hasData || snapshot.product?.schemaVersion !== 1 || !snapshot.product.equip?.equip_desc || !snapshot.suitConfig || typeof snapshot.suitConfig !== 'object' || canonicalProductUrl(snapshot.product.sourceUrl) !== entry.url) throw new Error('这条账号记录暂时无法恢复，请重新粘贴商品链接读取。')
  return snapshot
}

export async function loadCachedStaticData(): Promise<{ data: CbgStaticData; cachedAt: number } | null> {
  const value = await accessHistory('readonly', (_, __, catalog) => catalog.get('current'))
  // 旧版直接存资料，没有本地获取时间；仍可离线使用，但下次联网需更新。
  const data = value?.data ?? value
  if (!data?.heroes?.heroesById || !Array.isArray(data?.relicSuits?.yuhun_list)) return null
  return { data: data as CbgStaticData, cachedAt: typeof value?.cachedAt === 'number' && Number.isFinite(value.cachedAt) ? value.cachedAt : 0 }
}

export async function getStaticRefreshAvailableAt(): Promise<number> {
  const value = await accessHistory('readonly', (_, __, catalog) => catalog.get('refreshAvailableAt'))
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export async function reserveStaticRefresh() {
  let reserved = false
  let availableAt = 0
  await accessHistory('readwrite', (_, __, catalog) => {
    const request = catalog.get('refreshAvailableAt')
    request.onsuccess = () => {
      const now = Date.now()
      availableAt = typeof request.result === 'number' && Number.isFinite(request.result) ? request.result : 0
      if (availableAt > now) return
      availableAt = now + 30 * 60 * 1000
      catalog.put(availableAt, 'refreshAvailableAt')
      reserved = true
    }
    return request
  })
  if (!reserved) throw new Error(`更新资源每 30 分钟只能触发一次，请在 ${Math.ceil((availableAt - Date.now()) / 60_000)} 分钟后重试。`)
}

export async function saveCachedStaticData(data: CbgStaticData) {
  await accessHistory('readwrite', (_, __, catalog) => catalog.put({ data, cachedAt: Date.now() }, 'current'))
}

export async function clearAccountHistory() {
  await accessHistory('readwrite', (entries, snapshots) => { snapshots.clear(); return entries.clear() })
}
