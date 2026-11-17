import { BadGatewayException } from '@nestjs/common'
import type { CbgCollectionCatalog, CbgServerGroup } from '@phoenix/types'
import { z } from 'zod'
import { collectionImagePath, collectionImageSource, collectionSections } from './collection-image-source'

const catalogKey = z.string().regex(/^\d+$/)
const namedItem = z.object({ name: z.string().min(1), desc: z.string().optional() }).catchall(z.json())
const names = z.record(catalogKey, z.string().min(1)).optional()
const items = z.record(catalogKey, namedItem).optional()
const gameSchema = z.object({
  hero_list: z.array(z.tuple([z.number().int().positive(), z.string().min(1).max(64), z.number().int().min(1).max(6), z.string().min(1).max(128)])).min(1)
    .refine((rows) => new Set(rows.map(([id]) => id)).size === rows.length, 'duplicate hero ID')
    .refine((rows) => new Set(rows.map(([, , , slug]) => slug)).size === rows.length, 'duplicate hero slug'),
  yuhun_list: z.array(z.tuple([z.number().int().positive(), z.string().min(1), z.string(), z.string(), z.string()])).min(1),
  two_suit_yuhun: z.record(z.string(), z.string()),
  skin_list: names, collection_skin_data: names, cbg_special_skin_list: names, cbg_special_skin_list_2: names,
  skin_viedo_conf: z.record(catalogKey, z.object({ image_url: z.string().optional() }).catchall(z.json())).optional(),
  yard_skin: items, gamble_skin: items, shishenlu_skin: items, battle_skin: items, yinyangshu_skin: items,
  head_skin_list: items, honor_list: items, achieve_list: items, yaozhige_list: items, qiling_list: items,
  skin_blacklist: z.array(z.number().int().positive()).optional(),
}).catchall(z.json())
const serverSchema = z.record(z.string().regex(/^\d+$/), z.tuple([
  z.tuple([z.string().min(1)]).rest(z.unknown()),
  z.array(z.tuple([z.number().finite(), z.string().min(1), z.union([z.string().regex(/^\d+$/), z.number().int()])]).rest(z.unknown())).min(1),
])).refine((data) => Object.keys(data).length > 0)

export type CbgGameConfig = z.infer<typeof gameSchema>

export function parseGameConfigPayload(payload: unknown): CbgGameConfig {
  try { return gameSchema.parse(payload) }
  catch { throw new BadGatewayException('官方游戏资料格式异常') }
}

export function parseGameConfigScript(text: string) {
  // JSON only: never evaluate official scripts. Preserve all sections for later features.
  const match = text.match(/^\s*var\s+CBG_GAME_CONFIG\s*=\s*([\s\S]*?)\s*;?\s*$/)
  try {
    if (!match) throw new Error('format')
    return parseGameConfigPayload(JSON.parse(match[1]))
  } catch { throw new BadGatewayException('官方游戏资料格式异常') }
}

export function collectionCatalog(config: CbgGameConfig): CbgCollectionCatalog {
  const result: CbgCollectionCatalog = {}
  for (const [kind, section] of collectionSections) {
    const entries = config[section]
    if (entries !== undefined) result[kind] = Object.fromEntries(Object.entries(entries).map(([id, item]) => {
      const source = collectionImageSource(kind, id, config)
      const path = source ? collectionImagePath(source) : undefined
      return [id, {
        ...(typeof item === 'string' ? { name: item } : { name: item.name, ...(item.desc !== undefined ? { description: item.desc } : {}) }),
        ...(path ? { imageUrl: `/cbg/images/${path}` } : {}),
      }]
    }))
  }
  if (config.skin_blacklist !== undefined) result.skinBlacklist = config.skin_blacklist
  return result
}

export function parseServerListScript(text: string): CbgServerGroup[] {
  const match = text.match(/^\s*var\s+product_name\s*=\s*([^;]+)\s*;\s*var\s+server_data\s*=\s*([\s\S]*?)\s*;?\s*$/)
  try {
    if (!match || JSON.parse(match[1]) !== 'yys') throw new Error('format')
    const servers = serverSchema.parse(JSON.parse(match[2]))
    return Object.entries(servers).map(([id, [header, rows]]) => ({
      id, name: header[0], servers: rows.map((row) => ({ id: String(row[2]), name: row[1] })),
    }))
  } catch { throw new BadGatewayException('官方区服资料格式异常') }
}
