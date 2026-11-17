import type { CbgChannel } from './account.ts'

/** 上游数值可能以字符串返回，转换工作由客户端完成。 */
export type CbgNumeric = number | string

type SkillTuple = [skillId: CbgNumeric, level: CbgNumeric]
type GrowthTuple = [attribute: string, coefficient: CbgNumeric]
type AttributeTuple = [label: string, value: string | number]
/** 图鉴只需要拥有标记；上游名称和元组尾部均不保留。 */
type OwnershipTuple = [name: '', owned: CbgNumeric]
type HeroHistory = {
  all?: CbgNumeric
  got?: CbgNumeric
  [heroId: `${number}`]: CbgNumeric | OwnershipTuple
}

export type CbgProductHero = {
  heroId: CbgNumeric
  heroUid?: string | number | null
  uid?: string | number | null
  name?: string | null
  rarity?: CbgNumeric | null
  level?: CbgNumeric | null
  lv?: CbgNumeric | null
  heroLevel?: CbgNumeric | null
  hero_level?: CbgNumeric | null
  skinfo?: SkillTuple[] | null
  selectSkills?: CbgNumeric[] | null
}

export type CbgProductRelic = {
  uuid?: string | number | null
  name?: string | null
  level?: CbgNumeric | null
  qua?: CbgNumeric | null
  pos: CbgNumeric
  suitid: CbgNumeric
  rattr?: GrowthTuple[] | null
  attrs?: AttributeTuple[] | null
  single_attr?: AttributeTuple | [] | null
}

/** 仅保留客户端转换器需要的精选原始字段，不包含上游账号私密资料。 */
export type CbgProductDescription = {
  /** 从官方 skin 等公开字段剪枝后的收藏持有 ID；旧历史可能没有。 */
  collections?: import('./collections.ts').CbgOwnedCollections
  inventory?: Record<string, CbgProductRelic> | null
  heroes?: Record<string, CbgProductHero> | null
  hero_history?: { ssr?: HeroHistory; sp?: HeroHistory; ur?: HeroHistory } | null
  damo_count_dict?: Record<string, { '411'?: CbgNumeric }> | null
  name?: string | null
  origin_server_name?: string | null
  lv?: CbgNumeric | null
  fengzidu?: CbgNumeric | null
  pvp_score?: CbgNumeric | null
  pvp_stage?: string | number | null
  equips_summary?: CbgNumeric | null
  hero_summary?: CbgNumeric | null
  money?: CbgNumeric | null
  strength?: CbgNumeric | null
  level_15?: CbgNumeric | null
  goyu?: CbgNumeric | null
  soul_jade?: CbgNumeric | null
  gameble_card?: CbgNumeric | null
  ar_gamble_card?: CbgNumeric | null
  ssr_coin?: CbgNumeric | null
  sp_coin?: CbgNumeric | null
  currency_900273?: CbgNumeric | null
  currency_490017?: CbgNumeric | null
}

export type CbgProductEquip = {
  equip_desc: CbgProductDescription
  /** 上游原始售价，单位为分。 */
  price?: CbgNumeric | null
  equip_name?: string | null
  format_equip_name?: string | null
  server_name?: string | null
  status_desc?: string | null
  highlights?: string | string[] | null
}

/** API 与本地历史共用的精简商品；账号与御魂视图在客户端派生。 */
export type CbgProductData = {
  schemaVersion: 1
  channel: CbgChannel
  /** 固定 HTTPS 商品地址，不包含查询串、凭据或片段。 */
  sourceUrl: string
  equip: CbgProductEquip
}
