import { calculateRelicCombinationsForRequest, calculatePveDamageSummary } from '@phoenix/utils'
import type { HeroStaticPayload, RelicDataset, RelicCalculationRequest } from '@phoenix/types'

type WorkerRequest =
  | { type: 'single'; request: RelicCalculationRequest }
  | { type: 'pveSummary'; dataset: RelicDataset; heroes: HeroStaticPayload }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const data = event.data
    if (data.type === 'single') {
      const results = calculateRelicCombinationsForRequest(data.request, progress => self.postMessage({ type: 'progress', progress }))
      self.postMessage({ type: 'results', results })
    } else {
      self.postMessage({ type: 'summary', summary: calculatePveDamageSummary(data.dataset, data.heroes) })
    }
  } catch {
    self.postMessage({ type: 'error', message: '计算失败，请检查配置后重试。' })
  }
}
