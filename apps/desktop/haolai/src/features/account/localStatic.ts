import { z } from 'zod'
import type { CbgCollectionCatalog, CbgCollectionKind, CbgStaticData } from '@phoenix/types'
import { loadHeroPanels, loadRelicSuits } from '../../lib/staticApi'

// 与现有 API cbg-static-payload 的官方字段契约一致；仅解析 JSON，不执行上游脚本。
const catalogKey = z.string().regex(/^\d+$/)
const namedItem = z.object({ name: z.string().min(1), desc: z.string().optional() })
const names = z.record(catalogKey, z.string().min(1)).optional()
const items = z.record(catalogKey, namedItem).optional()
const gameSchema = z.object({
  hero_list: z.array(z.tuple([z.number().int().positive(), z.string().min(1).max(64), z.number().int().min(1).max(6), z.string().min(1).max(128)])).min(1)
    .refine(rows => new Set(rows.map(([id]) => id)).size === rows.length)
    .refine(rows => new Set(rows.map(([, , , slug]) => slug)).size === rows.length),
  yuhun_list: z.array(z.tuple([z.number().int().positive(), z.string().min(1), z.string(), z.string(), z.string()])).min(1),
  two_suit_yuhun: z.record(z.string(), z.string()),
  skin_list: names, collection_skin_data: names, cbg_special_skin_list: names, cbg_special_skin_list_2: names,
  yard_skin: items, gamble_skin: items, shishenlu_skin: items, battle_skin: items, yinyangshu_skin: items,
  head_skin_list: items, honor_list: items, achieve_list: items, qiling_list: items,
  skin_blacklist: z.array(z.number().int().positive()).optional(),
})
const serverSchema = z.array(z.object({
  id: z.string().regex(/^\d+$/), name: z.string().min(1),
  servers: z.array(z.object({ id: z.string().regex(/^\d+$/), name: z.string().min(1) })).min(1),
})).min(1)
const collectionSections = [
  ['skins', 'skin_list'], ['premiumSkins', 'collection_skin_data'],
  ['specialSkins', 'cbg_special_skin_list'], ['specialSkins2', 'cbg_special_skin_list_2'],
  ['yards', 'yard_skin'], ['summonRooms', 'gamble_skin'], ['heroRooms', 'shishenlu_skin'],
  ['battleThemes', 'battle_skin'], ['onmyojiRooms', 'yinyangshu_skin'], ['frames', 'head_skin_list'],
  ['honors', 'honor_list'], ['achievements', 'achieve_list'], ['qiling', 'qiling_list'],
] as const

async function readPublicStatic<T>(endpoint: string, schema: z.ZodType<T>, refresh: boolean): Promise<T> {
  if (!window.desktop) throw new Error('游戏资料暂时无法读取，请重新打开应用后重试。')
  if (!refresh) {
    const cached = schema.safeParse(await window.desktop.readStaticData(endpoint))
    if (cached.success) return cached.data
  }
  return schema.parse(await window.desktop.updateStaticData(endpoint))
}

export async function readLocalStatic(refresh = false): Promise<CbgStaticData> {
  const [heroes, relicSuits, config, serverList] = await Promise.all([
    loadHeroPanels<CbgStaticData['heroes']>(refresh),
    loadRelicSuits<CbgStaticData['relicSuits']>(refresh),
    readPublicStatic('/static/game-config', gameSchema, refresh),
    readPublicStatic('/static/server-groups', serverSchema, refresh),
  ])
  if (!heroes?.heroesById) throw new Error('式神资料暂时无法读取，请更新游戏资料后重试。')
  const heroCatalog: NonNullable<CbgStaticData['heroCatalog']> = Object.fromEntries(Object.entries(heroes.heroesById).map(([id, hero]) => [id, {
    id: hero.id, name: hero.name, rarityCode: hero.rarityCode ?? 0, slug: hero.slug ?? '',
  }]))
  const missingHeroIds: number[] = []
  for (const [id, name, rarityCode, slug] of config.hero_list) {
    heroCatalog[String(id)] = { id, name, rarityCode, slug }
    const panel = heroes.heroesById[String(id)]
    if (panel) Object.assign(panel, { name, rarityCode, slug })
    else missingHeroIds.push(id)
  }
  const collections: CbgCollectionCatalog = {}
  for (const [kind, section] of collectionSections) {
    const entries = config[section]
    // 路径来自既有 collection-image-source；只输出本地协议已支持的图片目录。
    const imageFolders: Partial<Record<CbgCollectionKind, string>> = { specialSkins: 'currency', specialSkins2: 'currency', heroRooms: 'currency', battleThemes: 'currency', onmyojiRooms: 'currency', yards: 'sceneskin', summonRooms: 'decocardhouse', frames: 'headskin', honors: 'badge' }
    const imageFolder = imageFolders[kind]
    if (entries !== undefined) collections[kind] = Object.fromEntries(Object.entries(entries).map(([id, item]) => [id, {
      ...(typeof item === 'string' ? { name: item } : { name: item.name, ...(item.desc !== undefined ? { description: item.desc } : {}) }),
      ...(imageFolder ? { imageUrl: `/cbg/images/${imageFolder}/${id}.png` } : {}),
    }]))
  }
  if (config.skin_blacklist !== undefined) collections.skinBlacklist = config.skin_blacklist
  return {
    heroes, heroCatalog, missingHeroIds, collections, serverList,
    relicSuits,
    source: 'remote', refreshedAt: null, heroBaseStatsSource: 'bundled',
  }
}
