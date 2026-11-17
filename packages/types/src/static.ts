import type { HeroRecord } from './hero.ts'
import type { CbgYuhunConfig } from './calculatorOptions.ts'

/** 静态式神资料；baseStats 使用游戏显示单位（百分比为 0–100）。 */
export type HeroPanel = HeroRecord & {
  slug?: string
  level?: string
}

/** 可独立更新、由静态资料服务保存在进程内存中的御魂套装定义。 */
export type RelicSuit = {
  id: number
  name: string
  slug: string
  twoPieceAttribute: string
  twoPieceEffect: string
  isOma: boolean
}

export type RelicSuitsPayload = CbgYuhunConfig

export type CbgSessionStatus = {
  configured: boolean
  refreshedAt: string | null
}

export type CbgServerGroup = {
  id: string
  name: string
  servers: { id: string; name: string }[]
}

/** 官方收藏与式神身份资料可独立更新；基础面板仅使用数据库或可信内置值。 */
export type CbgStaticData = {
  heroes: { schemaVersion: number; heroCount: number; heroesById: Record<string, HeroPanel> }
  relicSuits: CbgYuhunConfig
  serverList: CbgServerGroup[]
  source: 'bundled' | 'remote' | 'database'
  refreshedAt: string | null
  heroBaseStatsSource: 'bundled' | 'database' | 'mixed'
  heroCatalog?: Record<string, import('./collections.ts').CbgHeroIdentity>
  collections?: import('./collections.ts').CbgCollectionCatalog
  /** 官方 hero_list 中没有可信面板的条目，也可能包含达摩等非战斗条目。 */
  missingHeroIds: number[]
}

/** 经边界校验的商品定位；ordersn 已解码，仅含 1–128 位字母、数字、_、-。 */
export type ParsedProductUrl = {
  serverid: string
  ordersn: string
  channel: import('./account.ts').CbgChannel
  viewLoc?: string
  tfid?: string
  tcid?: string
  /** 重新构造的 HTTPS 标准商品 URL；无凭据/片段，仅含校验过的 view_loc、tfid、tcid。 */
  sourceUrl: string
}
