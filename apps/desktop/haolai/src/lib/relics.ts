import { convertCbgPayloadToDataset as convertSharedDataset } from '@phoenix/utils'
import type { GameConfig, RelicDataset, RelicView, StageAttribute } from '../types'

export {
  CBG_CHANNEL_LABELS,
  variableMainPositions,
  fixedMainAttributesByPosition,
  subAttributeSortOptions,
  compareAttributeLabels,
  sortAttributes,
  buildEnhancementStages,
  parseProductUrl,
  getCbgChannelFromUrl,
  extractCbgSpeedHighlights,
  formatAttribute,
  formatDetailedNumber,
  getDetailedSubAttributes,
  getAttributeHitCount,
} from '@phoenix/utils'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readDescription(payload: unknown) {
  if (!isRecord(payload)) throw new Error('商品资料无法识别，请重新读取商品。')
  const equip = payload.equip ?? payload.equip_data
  if (!isRecord(equip) || !equip.equip_desc) throw new Error('商品缺少御魂资料，请重新读取商品。')
  const detail: unknown = typeof equip.equip_desc === 'string'
    ? JSON.parse(equip.equip_desc)
    : equip.equip_desc
  if (!isRecord(detail)) throw new Error('御魂资料无法识别，请重新读取商品。')
  return { equip, detail }
}

function countCollectionSkins(detail: Record<string, unknown>, config: GameConfig) {
  const ids = new Set(Object.keys(config.collection_skin_data ?? {}))
  const skins = isRecord(detail.skin) ? detail.skin.ss : undefined
  return Array.isArray(skins)
    ? skins.filter((skin: unknown) => Array.isArray(skin) && ids.has(String(skin[2]))).length
    : 0
}

export function extractCbgCollectionSkinCount(payload: unknown, config: GameConfig) {
  return countCollectionSkins(readDescription(payload).detail, config)
}

/** 仅适配旧桌面的列表轻量模式与典藏计数；账号/式神/御魂规则由共享包维护。 */
export function convertCbgPayloadToDataset(
  payload: unknown,
  gameConfig: GameConfig,
  options?: { accountOnly?: boolean },
): RelicDataset {
  const { equip, detail } = readDescription(payload)
  const dataset = convertSharedDataset({
    equip: {
      ...equip,
      equip_desc: options?.accountOnly ? { ...detail, inventory: {} } : detail,
    },
  }, gameConfig, { includeEnhancementStages: true })
  const inventoryCount = isRecord(detail.inventory) ? Object.keys(detail.inventory).length : 0
  return {
    ...dataset,
    account: {
      ...dataset.account,
      collectionSkinCount: countCollectionSkins(detail, gameConfig),
      relicSummary: dataset.account?.relicSummary ?? (options?.accountOnly ? inventoryCount : undefined),
    },
    relicsByPosition: options?.accountOnly ? {} : dataset.relicsByPosition,
  }
}

/** 旧桌面强化阶段卡片按当前阶段截断；共享命中计数只针对完整御魂。 */
export function getStageAttributeHitCount(item: RelicView, attribute: StageAttribute, stageIndex = Infinity) {
  const stages = item.detail?.enhancementStages
  if (stages?.length) {
    return stages.slice(1, stageIndex + 1).filter((stage) =>
      stage.available && stage.upgrade?.key === attribute.key && !stage.upgrade.isNew,
    ).length
  }
  const rolls = item.detail?.growthRolls ?? []
  const initialCount = item.detail?.initialRollCount ?? Math.max(0, rolls.length - Math.floor((item.level ?? 0) / 3))
  const startsWithAttribute = rolls.slice(0, initialCount).some((roll) => roll.key === attribute.key)
  return Math.max(0, attribute.values.length - Number(startsWithAttribute))
}
