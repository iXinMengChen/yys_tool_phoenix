import { accountScoringRules as sharedScoringRules, analyzeAccountValue as analyzeSharedAccountValue } from '@phoenix/utils'
import type { AccountValueAnalysis, SellingPoint } from '@phoenix/types'
import type { RelicDataset } from '../types'

export type {
  RelicStatKey,
  RelicEvidence,
  SellingPoint,
  SpeedCombination,
  SuitSpeedCombinationOptions,
  RelicInventoryAnalysis,
  AccountValueAnalysis,
} from '@phoenix/types'

export {
  getBestSpeedCombinationForSuit,
  getBestScatteredSpeedCombination,
  getRelicSubAttributeTotals,
  getRelicEffectiveRollCount,
  getFullSpeedRelics,
  analyzeRelicInventory,
} from '@phoenix/utils'

// 仅旧桌面保留典藏皮肤评分；不向共享规则或共享契约写入此维度。
export const accountScoringRules = {
  ...sharedScoringRules,
  collectionSkin: [
    { min: 100, score: 10 },
    { min: 60, score: 8 },
    { min: 30, score: 6 },
    { min: 10, score: 3 },
  ],
} as const

export function analyzeAccountValue(dataset: RelicDataset): AccountValueAnalysis {
  const analysis = analyzeSharedAccountValue(dataset)
  const value = dataset.account?.collectionSkinCount || 0
  const collectionSkin: SellingPoint = {
    id: 'collectionSkin',
    title: '典藏皮肤',
    value,
    unit: '个',
    score: accountScoringRules.collectionSkin.find((rule) => value >= rule.min)?.score || 0,
    maxScore: Math.max(...accountScoringRules.collectionSkin.map((rule) => rule.score)),
    description: '按典藏皮肤数量进行分段评分。',
    evidence: [],
  }
  const sellingPoints = [...analysis.sellingPoints, collectionSkin]
  return {
    ...analysis,
    totalScore: sellingPoints.reduce((total, item) => total + item.score, 0),
    maxScore: sellingPoints.reduce((total, item) => total + item.maxScore, 0),
    sellingPoints,
  }
}
