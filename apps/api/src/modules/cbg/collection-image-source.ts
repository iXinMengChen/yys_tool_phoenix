import type { CbgGameConfig } from './cbg-static-payload'

// Confirmed against the public CBG role bundle and game_auto_config.js.
export const collectionSections = [
  ['skins', 'skin_list'], ['premiumSkins', 'collection_skin_data'],
  ['specialSkins', 'cbg_special_skin_list'], ['specialSkins2', 'cbg_special_skin_list_2'],
  ['yards', 'yard_skin'], ['summonRooms', 'gamble_skin'], ['heroRooms', 'shishenlu_skin'],
  ['battleThemes', 'battle_skin'], ['onmyojiRooms', 'yinyangshu_skin'], ['frames', 'head_skin_list'],
  ['honors', 'honor_list'], ['achievements', 'achieve_list'], ['qiling', 'qiling_list'],
] as const

// Confirmed against official PNGs for each onmyoji skin group; these heroes are absent from hero_list.
const onmyojiBySkinGroup: Record<string, string> = { '4101': '10', '4102': '11', '4103': '12', '4104': '13', '4105': '15', '4106': '16' }
const origin = 'https://cbg-yys.res.netease.com'
const cbgFileOrigins = ['https://cbg.fp.ps.netease.com', 'https://cbg2.fp.ps.netease.com']
const imagePath = /^\/game_res\/(?:(?:currency|sceneskin|decocardhouse|headskin|badge|suit|yingyuan)\/\d{1,12}|hero\/\d{1,12}\/\d{1,12}|hero\/\d{1,12}\/skin\/\d{1,12}|hunling_pic\/[a-zA-Z0-9_-]+)\.png$/
const cbgFilePath = /^\/file\/[a-zA-Z0-9]+$/

export function collectionImagePath(input: string): string | undefined {
  try {
    const url = new URL(input)
    if (!isAllowedCollectionImageUrl(input)) return undefined
    if (url.origin !== origin) return `files/${url.hostname}/${url.pathname.slice('/file/'.length)}.png`
    const match = /^\/game_res\/(currency|sceneskin|decocardhouse|headskin|badge|suit|yingyuan)\/(\d+)\.png$/.exec(url.pathname)
    if (match) return `${match[1] === 'suit' ? 'suits' : match[1]}/${match[2]}.png`
    const hero = /^\/game_res\/hero\/(\d+)\/(\d+)\.png$/.exec(url.pathname)
    if (hero && hero[1] === hero[2]) return `heroes/${hero[1]}.png`
    const skin = /^\/game_res\/hero\/(\d+)\/skin\/(\d+)\.png$/.exec(url.pathname)
    if (skin) return `skins/${skin[1]}/${skin[2]}.png`
    const spirit = /^\/game_res\/(hunling_pic\/[a-zA-Z0-9_-]+)\.png$/.exec(url.pathname)
    if (spirit) return `${spirit[1]}.png`
  } catch {}
  return undefined
}

export function isAllowedCollectionImageUrl(input: string): boolean {
  try {
    const url = new URL(input)
    const approvedPath = (url.origin === origin && imagePath.test(url.pathname))
      || (cbgFileOrigins.includes(url.origin) && cbgFilePath.test(url.pathname))
    return approvedPath && !url.username && !url.password && !url.search && !url.hash
      && input === `${url.origin}${url.pathname}`
  } catch { return false }
}

export function collectionImageSourcePath(path: string, config: CbgGameConfig): string | undefined {
  const hero = /^heroes\/(\d+)\.png$/.exec(path)
  if (hero) return collectionImageSource('heroes', hero[1], config)
  const suit = /^suits\/(\d+)\.png$/.exec(path)
  if (suit) return collectionImageSource('suits', suit[1], config)
  const skin = /^skins\/(\d+)\/(\d+)\.png$/.exec(path)
  if (skin) {
    for (const kind of ['skins', 'premiumSkins', 'onmyojiSkins']) {
      const source = collectionImageSource(kind, skin[2], config, skin[1])
      if (source) return source
    }
    return undefined
  }
  const direct = /^(currency|sceneskin|decocardhouse|headskin|badge|yingyuan)\/(\d+)\.png$/.exec(path)
  if (direct) {
    const kinds: Record<string, string[]> = {
      currency: ['specialSkins', 'specialSkins2', 'heroRooms', 'battleThemes', 'onmyojiRooms'],
      sceneskin: ['yards'], decocardhouse: ['summonRooms'], headskin: ['frames'], badge: ['honors'], yingyuan: ['yingyuan'],
    }
    for (const kind of kinds[direct[1]] ?? []) {
      const source = collectionImageSource(kind, direct[2], config)
      if (source) return source
    }
    return undefined
  }
  const hunling = /^hunling_pic\/([a-zA-Z0-9_-]+)\.png$/.exec(path)
  if (hunling) {
    const entry = Object.entries(config.qiling_list ?? {}).find(([, item]) => typeof item !== 'string' && item.pic === `hunling_pic/${hunling[1]}.png`)
    return entry ? collectionImageSource('qiling', entry[0], config) : undefined
  }
  return undefined
}

export function collectionImageSource(kind: string, id: string, config: CbgGameConfig, heroId?: string): string | undefined {
  if (!/^\d{1,12}$/.test(id)) return undefined
  if (kind === 'heroes') return config.hero_list.some(([hero]) => String(hero) === id) ? `${origin}/game_res/hero/${id}/${id}.png` : undefined
  if (kind === 'suits') return config.yuhun_list.some(([suit]) => String(suit) === id) ? `${origin}/game_res/suit/${id}.png` : undefined
  if (kind === 'yingyuan') return Object.values(config.honor_list ?? {}).some(({ name }) => name.includes('应援'))
    ? `${origin}/game_res/yingyuan/${id}.png` : undefined
  const section = kind === 'onmyojiSkins' ? 'skin_list' : collectionSections.find(([key]) => key === kind)?.[1]
  const entries = section ? config[section] : undefined
  const item = entries?.[id]
  if (!item) return undefined
  if (kind === 'skins' || kind === 'onmyojiSkins' || kind === 'premiumSkins') {
    const onmyojiId = /^410[1-6]\d{2}$/.test(id) ? onmyojiBySkinGroup[id.slice(0, 4)] : undefined
    const imageHeroId = heroId ?? onmyojiId
    if (!imageHeroId || !/^\d{1,12}$/.test(imageHeroId)
      || !(imageHeroId === onmyojiId || config.hero_list.some(([hero]) => String(hero) === imageHeroId))) return undefined
    return `${origin}/game_res/hero/${imageHeroId}/skin/${id}.png`
  }
  let path: string | undefined
  switch (kind) {
    case 'specialSkins': case 'specialSkins2': case 'heroRooms': case 'battleThemes': case 'onmyojiRooms':
      path = `currency/${id}.png`; break
    case 'yards': path = `sceneskin/${id}.png`; break
    case 'summonRooms': path = `decocardhouse/${id}.png`; break
    case 'frames': path = `headskin/${id}.png`; break
    case 'honors': path = `badge/${id}.png`; break
    case 'qiling':
      if (typeof item !== 'string' && typeof item.pic === 'string' && /^hunling_pic\/[a-zA-Z0-9_-]+\.png$/.test(item.pic)) path = item.pic
      break
  }
  const url = path ? `${origin}/game_res/${path}` : undefined
  return url && isAllowedCollectionImageUrl(url) ? url : undefined
}
