import type { HeroBaseStats, PveMetric, RelicDataset, RelicCalculationRequest } from '@phoenix/types'
import { calculateRelicCombinationsForRequest, fixedOmaSuitNames } from '@phoenix/utils'

export type PveWorkerMessage =
  | { type: 'result'; id: string; metric?: PveMetric }
  | { type: 'done' }
  | { type: 'error'; message: string }

type Request =
  | { type: 'calculate'; dataset: RelicDataset; baseStats: HeroBaseStats; suitNames: string[]; priority: string[] }
  | { type: 'prioritize'; suitNames: string[] }

const scope = globalThis as typeof globalThis & {
  onmessage: (event: MessageEvent<Request>) => void
  postMessage: (message: PveWorkerMessage) => void
}
let jobs: { suitName: string; omaName: string }[] = []

function prioritize(names: string[]) {
  jobs = [...jobs.filter(({ suitName }) => names.includes(suitName)), ...jobs.filter(({ suitName }) => !names.includes(suitName))]
}

scope.onmessage = (event: MessageEvent<Request>) => {
  const data = event.data
  if (data.type === 'prioritize') {
    prioritize(data.suitNames)
    return
  }
  const { dataset, baseStats } = data
  const relicsByPosition = Object.fromEntries(Object.entries(dataset.relicsByPosition).map(([position, relics]) => [position, relics.map((relic) => { const copy = { ...relic }; delete copy.detail; return copy })]))
  const suitTwoPieceAttributes = new Map(Object.values(relicsByPosition).flat().flatMap((relic) => relic.suit?.twoPieceAttribute ? [[relic.suit.name, relic.suit.twoPieceAttribute] as const] : []))
  jobs = data.suitNames.flatMap((suitName) => fixedOmaSuitNames.map((omaName) => ({ suitName, omaName })))
  prioritize(data.priority)

  const calculateNext = () => {
    const job = jobs.shift()
    if (!job) {
      scope.postMessage({ type: 'done' })
      return
    }
    try {
      const request: RelicCalculationRequest = {
        relicsByPosition,
        baseStats,
        metric: 'damage',
        filters: {
          quality: 6, level: 15, mainAttributes: {}, suitTwoPieceAttributes,
          requiredFourPiece: job.suitName,
          requiredTwoPieceNames: new Set([job.omaName]),
          panelConstraints: { critRate: { min: 100 } },
          fastMode: true,
        },
        resultLimit: 1,
      }
      const result = calculateRelicCombinationsForRequest(request)[0]
      scope.postMessage({ type: 'result', id: `${job.suitName}:${job.omaName}`, metric: result ? { damage: Math.round(result.score), panel: result.panel } : undefined })
      // 逐套让出事件循环，切换套装时优先计算当前展示的组合。
      setTimeout(calculateNext, 0)
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'PVE 计算失败' })
    }
  }
  calculateNext()
}
