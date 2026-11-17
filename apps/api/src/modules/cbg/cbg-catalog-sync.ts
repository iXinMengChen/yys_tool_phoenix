import type { HeroPanel } from '@phoenix/types'
import type { HeroCatalog, Prisma } from '../../generated/prisma/client'
import type { CbgGameConfig } from './cbg-static-payload'

const rarityLevels = ['N', 'R', 'SR', 'SSR', 'SP', 'UR'] as const

export function databaseHeroPanel(row: HeroCatalog): HeroPanel {
  return {
    id: row.id, name: row.name, slug: row.slug, level: row.level,
    rarityCode: rarityLevels.findIndex((level) => level === row.level) + 1,
    ...(/^\d+$/.test(row.lowestRank) ? { lowestRank: Number(row.lowestRank) } : {}),
    isCollaboration: row.isCollaboration,
    // SQL and bundled panels both use display percentages: 5 crit, 150 crit damage.
    baseStats: {
      attack: Number(row.attack), health: Number(row.health), defense: Number(row.defense), speed: Number(row.speed),
      critRate: Number(row.critRate), critDamage: Number(row.critDamage),
      effectHit: Number(row.effectHit), effectResistance: Number(row.effectResistance),
    },
  }
}

/** Call inside the same transaction that saves the complete official JSON. */
export async function syncOfficialHeroes(
  tx: Prisma.TransactionClient,
  config: CbgGameConfig,
  bundled: Record<string, HeroPanel>,
) {
  const existing = new Map((await tx.heroCatalog.findMany()).map((hero) => [hero.id, hero]))
  const report = { insertedHeroes: 0, updatedHeroes: 0, missingPanelHeroes: 0 }
  for (const [id, name, rarityCode, slug] of config.hero_list) {
    const metadata = { name, slug, level: rarityLevels[rarityCode - 1] }
    const row = existing.get(id)
    if (row) {
      if (row.name !== name || row.slug !== slug || row.level !== metadata.level) {
        await tx.heroCatalog.update({ where: { id }, data: metadata })
        report.updatedHeroes++
      }
      continue
    }
    const panel = bundled[String(id)]
    if (!panel || panel.lowestRank === undefined) { report.missingPanelHeroes++; continue }
    await tx.heroCatalog.create({ data: {
      id, ...metadata, ...panel.baseStats, lowestRank: String(panel.lowestRank),
      isCollaboration: panel.isCollaboration ?? false,
      additionalAttributes: null, additionalAttributesValue: 0,
    } })
    report.insertedHeroes++
  }
  return report
}
