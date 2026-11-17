import type { AccountOverview as SharedAccountOverview, RelicDataset as SharedRelicDataset } from '@phoenix/types'
export type { AttributeView, StageAttribute, EnhancementStage, CbgChannel, HeroView, GrowthRoll, RelicView } from '@phoenix/types'

/** 旧桌面商品摘要中的典藏皮肤总数。 */
export type AccountOverview = SharedAccountOverview & { collectionSkinCount?: number }
export type RelicDataset = Omit<SharedRelicDataset, 'account'> & { account?: AccountOverview }

export type GameConfig = {
  two_suit_yuhun?: Record<string, unknown>
  two_piece_attributes?: Record<string, string>
  /** 典藏皮肤 ID 到名称的静态映射，来自 game_auto_config.js。 */
  collection_skin_data?: Record<string, string>
}

export type CbgPayloadConversionOptions = { accountOnly?: boolean }

export * from './accountMatcher'
export * from './calculator'
export * from './heroSkills'
export * from './home'
export * from './layout'
export * from './pve'
export * from './relics'
export * from './router'
export * from './speed'
export * from './team'
