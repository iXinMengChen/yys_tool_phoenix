import { z } from 'zod'
import type { CbgProductData, CbgProductDescription } from '@phoenix/types'
import { parseProductUrl } from '@phoenix/utils'

// 本地商品边界校验、剪枝，不上传商品或摘要。
const numeric = z.union([z.number().finite(), z.string().refine((value) => Number.isFinite(Number(value)))])
const identifier = z.union([z.string(), z.number().finite()])
const attribute = z.preprocess(
  (value) => Array.isArray(value) ? value.slice(0, 2) : value,
  z.tuple([z.string(), identifier]),
)
const numericPair = z.preprocess(
  (value) => Array.isArray(value) ? value.slice(0, 2) : value,
  z.tuple([numeric, numeric]),
)
const growth = z.preprocess(
  (value) => Array.isArray(value) ? value.slice(0, 2) : value,
  z.tuple([z.string(), numeric]),
)
const ownership = z.preprocess(
  (value) => Array.isArray(value) ? ['', value[1]] : value,
  z.union([numeric, z.tuple([z.literal(''), numeric])]),
)
const heroHistory = z.preprocess(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => /^(?:all|got|\d+)$/.test(key)))
    : value,
  z.object({ all: numeric.optional(), got: numeric.optional() }).catchall(ownership),
)
const heroSchema = z.object({
  heroId: numeric, heroUid: identifier.nullish(), uid: identifier.nullish(),
  name: z.string().nullish(), rarity: numeric.nullish(),
  level: numeric.nullish(), lv: numeric.nullish(), heroLevel: numeric.nullish(), hero_level: numeric.nullish(),
  skinfo: z.array(numericPair).nullish(),
  selectSkills: z.array(numeric).nullish(),
})
const relicSchema = z.object({
  uuid: identifier.nullish(), name: z.string().nullish(),
  level: numeric.nullish(), qua: numeric.nullish(), pos: numeric, suitid: numeric,
  rattr: z.array(growth).nullish(),
  attrs: z.array(attribute).nullish(), single_attr: z.union([attribute, z.tuple([])]).nullish(),
})
// 只保留收藏 ID，丢弃元组中的名字、到期时间和其它上游字段。
const collectionId = numeric.transform(Number).pipe(z.number().int().positive().safe())
const optionalCollectionId = z.preprocess(value => value === '' ? undefined : value, collectionId.optional()).catch(undefined)
const skinIds = (index: number) => z.preprocess(
  (value) => Array.isArray(value) ? value.map(item => Array.isArray(item) ? item[index] : undefined) : value,
  z.array(collectionId),
).nullish()
const skinSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const skin = value as Record<string, unknown>
  const pairs = ['ss', 'yys', 'guard'].flatMap((key) => {
    const list = skin[key]
    return Array.isArray(list) ? list.flatMap((entry) => Array.isArray(entry) ? [[entry[2], entry[0]]] : []) : []
  })
  return { ...skin, heroSkinPairs: pairs }
}, z.object({
  // ss 第四项区分 SP 皮肤；整个列表均为持有皮肤，不能将它作为持有标记。
  ss: skinIds(2), yys: skinIds(2), guard: skinIds(2), yard: skinIds(0), gamble: skinIds(0),
  shishenlu: skinIds(0), battle: skinIds(0), yinyangshu: skinIds(0), heroSkinPairs: z.array(z.tuple([collectionId, collectionId])),
}))
const frameIds = z.preprocess(
  value => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : value,
  z.array(collectionId),
)
const detailSchema = z.object({
  skin: skinSchema.nullish(), head_skin: frameIds.nullish(), honors: z.array(collectionId).nullish(),
  honors_detail: z.record(z.string().regex(/^\d+$/), z.record(z.string(), optionalCollectionId)).nullish(),
  inventory: z.record(z.string(), relicSchema).nullish(),
  heroes: z.record(z.string(), heroSchema).nullish(),
  hero_history: z.object({ ssr: heroHistory.optional(), sp: heroHistory.optional(), ur: heroHistory.optional() }).nullish(),
  damo_count_dict: z.record(z.string(), z.object({ '411': numeric.optional() })).nullish(),
  name: z.string().nullish(), origin_server_name: z.string().nullish(),
  lv: numeric.nullish(), fengzidu: numeric.nullish(), pvp_score: numeric.nullish(), pvp_stage: identifier.nullish(),
  equips_summary: numeric.nullish(), hero_summary: numeric.nullish(), money: numeric.nullish(), strength: numeric.nullish(),
  level_15: numeric.nullish(), goyu: numeric.nullish(), soul_jade: numeric.nullish(), gameble_card: numeric.nullish(), ar_gamble_card: numeric.nullish(),
  ssr_coin: numeric.nullish(), sp_coin: numeric.nullish(), currency_900273: numeric.nullish(), currency_490017: numeric.nullish(),
})
// This intermediate envelope is never returned; both inline and downloaded descriptions
// pass through detailSchema before CbgProductData leaves the service.
const descriptionSchema = z.union([z.string(), z.record(z.string(), z.unknown())])
const equipSchema = z.object({
  equip_desc: descriptionSchema.nullish(),
  price: numeric.nullish(),
  equip_name: z.string().nullish(), format_equip_name: z.string().nullish(),
  server_name: z.string().nullish(), status_desc: z.string().nullish(),
  highlights: z.union([z.string(), z.array(z.string())]).nullish(),
})
const payloadSchema = z.object({
  equip: equipSchema.optional(),
  equip_data: equipSchema.optional(),
}).refine((payload) => Boolean(payload.equip ?? payload.equip_data))


function parseCbgPayload(value: unknown) {
  const result = payloadSchema.safeParse(value)
  if (!result.success) throw new Error('藏宝阁商品数据格式异常')
  return result.data
}

function parseCbgDescription(value: unknown): CbgProductDescription {
  let json: unknown = value
  if (typeof value === 'string') {
    try { json = JSON.parse(value) as unknown } catch { throw new Error('藏宝阁御魂详情格式异常') }
  }
  const result = detailSchema.safeParse(json)
  if (!result.success) throw new Error('藏宝阁御魂详情结构异常')
  const { skin, head_skin, honors, honors_detail, ...detail } = result.data
  const collections: NonNullable<CbgProductDescription['collections']> = {}
  const put = (kind: Exclude<keyof typeof collections, 'heroSkinPairs'>, ids: number[] | null | undefined) => {
    if (ids !== undefined && ids !== null) Object.assign(collections, { [kind]: [...new Set(ids)] })
  }
  put('heroSkins', skin?.ss)
  put('otherSkins', skin?.ss)
  put('onmyojiSkins', skin?.yys)
  if (skin?.heroSkinPairs.length) {
    const pairs = new Map<number, number>()
    for (const [skinId, heroId] of skin.heroSkinPairs) if (!pairs.has(skinId)) pairs.set(skinId, heroId)
    collections.heroSkinPairs = [...pairs].map(([skinId, heroId]) => ({ skinId, heroId }))
  }
  // 全部皮肤目录还包括御灵；三类均提供时才能判断整个目录中的未拥有项。
  if (skin?.ss && skin.yys && skin.guard) put('skins', [...skin.ss, ...skin.yys, ...skin.guard])
  put('spiritSkins', skin?.guard)
  put('yards', skin?.yard)
  put('summonRooms', skin?.gamble)
  put('heroRooms', skin?.shishenlu)
  put('battleThemes', skin?.battle)
  put('onmyojiRooms', skin?.yinyangshu)
  put('frames', head_skin)
  put('honors', honors)
  const honorDojoIds: Record<string, number> = {}
  for (const id of honors ?? []) {
    const entry = honors_detail?.[id]
    const dojoId = entry?.dojo_id ?? entry?.hero_id ?? Object.entries(entry ?? {}).filter(([key]) => key.includes('id')).at(-1)?.[1]
    if (dojoId) honorDojoIds[id] = dojoId
  }
  if (Object.keys(honorDojoIds).length) collections.honorDojoIds = honorDojoIds
  return { ...detail, ...(Object.keys(collections).length ? { collections } : {}) }
}

export function localProduct(payload: unknown, url: string): CbgProductData {
  const parsed = parseProductUrl(url)
  const data = parseCbgPayload(typeof payload === 'string' ? JSON.parse(payload) as unknown : payload)
  const equip = data.equip ?? data.equip_data
  if (!equip) throw new Error('藏宝阁没有返回商品数据')
  return {
    schemaVersion: 1, channel: parsed.channel, sourceUrl: `${new URL(parsed.sourceUrl).origin}${new URL(parsed.sourceUrl).pathname}`,
    equip: { ...equip, equip_desc: parseCbgDescription(equip.equip_desc) },
  }
}
