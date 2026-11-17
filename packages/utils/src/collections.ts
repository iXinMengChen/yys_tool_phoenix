import type { CbgCollectionCatalog, CbgCollectionKind, CbgCollectionSection, CbgOwnedCollections } from '@phoenix/types'

export const collectionLabels: Record<CbgCollectionKind, string> = {
  premiumSkins: '典藏 / 臻藏', onmyojiSkins: '阴阳师皮肤', skins: '其他皮肤', yards: '庭院', summonRooms: '召唤屋', heroRooms: '幕间', battleThemes: '战斗主题', onmyojiRooms: '阴阳术', spiritSkins: '御灵皮肤', frames: '头像框', honors: '高级徽章', specialSkins: '特殊皮肤 / 碎片', specialSkins2: '特殊皮肤Ⅱ', achievements: '成就', qiling: '术印',
}
const visibleKinds = (Object.keys(collectionLabels) as CbgCollectionKind[]).filter(kind => !['specialSkins', 'specialSkins2', 'achievements', 'spiritSkins', 'qiling'].includes(kind))
const skinKinds: CbgCollectionKind[] = ['skins', 'onmyojiSkins', 'premiumSkins']

/** 只返回已拥有且可确认分类的条目；重叠目录不能相加。 */
export function getCollectionSections(owned: CbgOwnedCollections | undefined, catalog: CbgCollectionCatalog | undefined): CbgCollectionSection[] {
  const otherSkins = owned?.otherSkins ?? owned?.heroSkins
  // 旧版 skins 仅在 ss/yys/guard 均提供时保存其并集；完整分组可准确还原 yys。
  const excludedSkins = new Set([...(otherSkins ?? []), ...(owned?.spiritSkins ?? [])])
  const onmyojiSkins = owned?.onmyojiSkins ?? (owned?.skins && otherSkins && owned.spiritSkins
    ? owned.skins.filter(id => !excludedSkins.has(id)) : undefined)
  return visibleKinds.map(kind => {
    const ids = kind === 'skins' ? otherSkins : kind === 'onmyojiSkins' ? onmyojiSkins : owned?.[kind] ?? (kind === 'premiumSkins' ? owned?.heroSkins : undefined)
    const available = ids !== undefined
    const ownedIds = new Set(ids)
    const entries = catalog?.[kind === 'onmyojiSkins' ? 'skins' : kind]
    const heroBySkinId = new Map(owned?.heroSkinPairs?.map(pair => [pair.skinId, pair.heroId]))
    const items = Object.entries(entries ?? {}).filter(([id]) => ownedIds.has(Number(id)) && !(kind === 'skins' && catalog?.premiumSkins?.[id])).map(([id, item]) => ({
      ...item, id: Number(id), owned: true,
      ...(skinKinds.includes(kind) && heroBySkinId.has(Number(id)) ? { imageUrl: `/cbg/images/skins/${heroBySkinId.get(Number(id))}/${id}.png` } : {}),
      ...(kind === 'honors' && owned?.honorDojoIds?.[id] ? { overlayImageUrl: `/cbg/images/yingyuan/${owned.honorDojoIds[id]}.png` } : {}),
    }))
    const catalogRequired = skinKinds.includes(kind)
    const ownedCount = available && (entries !== undefined || !catalogRequired) ? (catalogRequired ? items.length : ownedIds.size) : null
    return { kind, label: collectionLabels[kind], available, catalogAvailable: entries !== undefined, ownedCount, items: items.sort((a, b) => a.id - b.id) }
  })
}
