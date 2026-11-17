/** 官方公开收藏目录；目录数量不代表账号持有数量。 */
export type CbgCollectionKind = 'skins' | 'onmyojiSkins' | 'premiumSkins' | 'specialSkins' | 'specialSkins2' | 'yards' | 'summonRooms' | 'heroRooms' | 'battleThemes' | 'onmyojiRooms' | 'frames' | 'honors' | 'achievements' | 'spiritSkins' | 'qiling'
export type CbgCollectionItem = {
  name: string
  description?: string
  /** API-relative raster resource path; prepend the browser's public apiBaseUrl. Older catalogs may omit it. */
  imageUrl?: string
}

export type CbgCollectionCatalog = Partial<Record<CbgCollectionKind, Record<string, CbgCollectionItem>>> & { skinBlacklist?: number[] }
/** 字段缺失表示上游或旧历史未提供，不能当作零持有。仅保存公开收藏 ID。 */
export type CbgOwnedCollections = Partial<Record<CbgCollectionKind, number[]>> & {
  otherSkins?: number[]
  heroSkins?: number[]
  heroSkinPairs?: { heroId: number; skinId: number }[]
  honorDojoIds?: Record<string, number>
}
export type CbgCollectionEntry = CbgCollectionItem & { id: number; owned: boolean | null; overlayImageUrl?: string }
export type CbgCollectionSection = { kind: CbgCollectionKind; label: string; available: boolean; catalogAvailable: boolean; ownedCount: number | null; items: CbgCollectionEntry[] }
export type CbgHeroIdentity = { id: number; name: string; rarityCode: number; slug: string }
