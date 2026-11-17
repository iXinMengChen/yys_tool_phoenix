import type { CbgProductData, RelicDataset, RelicSuitConfig } from '@phoenix/types'
import { convertCbgPayloadToDataset, parseProductUrl } from '@phoenix/utils'

export type AccountWorkerRequest = { product: CbgProductData; suitConfig: RelicSuitConfig }
export type AccountWorkerResponse = { dataset: RelicDataset } | { error: string }

const scope = globalThis as typeof globalThis & {
  onmessage: (event: MessageEvent<AccountWorkerRequest>) => void
  postMessage: (message: AccountWorkerResponse) => void
}

scope.onmessage = ({ data }: MessageEvent<AccountWorkerRequest>) => {
  try {
    const { product, suitConfig } = data
    if (product.schemaVersion !== 1 || parseProductUrl(product.sourceUrl).channel !== product.channel) throw new Error('账号数据版本或来源无效，请重新读取商品。')
    const dataset = convertCbgPayloadToDataset(product, suitConfig, { includeEnhancementStages: false })
    dataset.account = { ...dataset.account, channel: product.channel, sourceUrl: product.sourceUrl }
    scope.postMessage({ dataset })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : '账号资料解析失败，请重新读取商品。' })
  }
}
