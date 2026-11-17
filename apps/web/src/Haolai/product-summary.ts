import type { CbgProductData, CbgProductSummaryReceipt, CbgProductSummaryUpload, RelicDataset } from '@phoenix/types'
import { buildAccountSummary, parseProductUrl } from '@phoenix/utils'
import { apiClient } from '@/api/client'

const pending = new Set<string>()
const uploaded = new Map<string, number>()

export async function uploadProductSummary(product: CbgProductData, dataset: RelicDataset) {
  const { serverid, ordersn } = parseProductUrl(product.sourceUrl)
  const key = `phoenix:product-summary:${product.channel}:${serverid}:${ordersn}`
  if (pending.has(key)) return
  let expiresAt = uploaded.get(key) ?? 0
  try { expiresAt = Math.max(expiresAt, Number(localStorage.getItem(key)) || 0) } catch { /* 存储不可用时仍在当前页面内去重。 */ }
  if (expiresAt > Date.now()) return
  pending.add(key)
  try {
    const payload = { channel: product.channel, serverid, ordersn, summary: buildAccountSummary(dataset) } satisfies CbgProductSummaryUpload
    const response = await apiClient.post<CbgProductSummaryReceipt>('/cbg/product-summary', payload)
    const expiry = Date.parse(response.data?.expiresAt ?? '')
    if (!response.data?.id || !Number.isFinite(expiry) || expiry <= Date.now()) return
    uploaded.set(key, expiry)
    try { localStorage.setItem(key, String(expiry)) } catch { /* 内存记录仍可避免重复上传。 */ }
  } finally { pending.delete(key) }
}
