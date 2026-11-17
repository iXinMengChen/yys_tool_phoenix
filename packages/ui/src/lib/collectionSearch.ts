import type { CbgCollectionSection, CbgOwnedCollections, CbgStaticData } from '@phoenix/types'

export function filterCollectionItems(section: CbgCollectionSection, query: string, owned: CbgOwnedCollections | undefined, heroCatalog: CbgStaticData['heroCatalog']) {
  const search = query.trim().toLocaleLowerCase()
  if (!search) return section.items
  const heroNames = new Map(
    (section.kind === 'skins' || section.kind === 'premiumSkins' ? owned?.heroSkinPairs ?? [] : [])
      .map(({ skinId, heroId }) => [skinId, heroCatalog?.[String(heroId)]?.name ?? '']),
  )
  return section.items.filter(item => `${item.name} ${item.description ?? ''} ${heroNames.get(item.id) ?? ''}`.toLocaleLowerCase().includes(search))
}
