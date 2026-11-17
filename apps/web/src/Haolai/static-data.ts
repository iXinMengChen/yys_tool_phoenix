import type { CbgStaticData } from '@phoenix/types'
import { apiClient } from '@/api/client'
import { loadCachedStaticData, reserveStaticRefresh, saveCachedStaticData } from './history'

const maxAgeMs = 24 * 60 * 60 * 1000
let pending: { force: boolean; promise: Promise<CbgStaticData> } | null = null

export async function loadStaticData(force = false): Promise<CbgStaticData> {
  if (pending) {
    if (!force || pending.force) return pending.promise
    // 强制更新排在已有读取之后，避免旧响应覆盖更新后的资料。
    await pending.promise.catch(() => {})
    return loadStaticData(true)
  }

  const promise = (async () => {
    const cached = await loadCachedStaticData().catch(() => null)
    const age = cached ? Date.now() - cached.cachedAt : Infinity
    if (!force && cached && age >= 0 && age < maxAgeMs) return cached.data
    if (force) await reserveStaticRefresh()
    try {
      const response = await apiClient.get<CbgStaticData>('/cbg/static', force ? { refresh: true } : undefined)
      if (!response.data) throw new Error(response.message || '公共资料暂时无法读取，请稍后重试。')
      await saveCachedStaticData(response.data).catch(() => {})
      return response.data
    } catch (error) {
      if (!force && cached) return cached.data
      throw error
    }
  })()
  const request = { force, promise }
  pending = request
  try { return await promise }
  finally { if (pending === request) pending = null }
}
