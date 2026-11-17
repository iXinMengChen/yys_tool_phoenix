import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../apps/api/src/generated/prisma/client.ts'
import { parseGameConfigScript } from '../apps/api/src/modules/cbg/cbg-static-payload.ts'
import { syncOfficialHeroes } from '../apps/api/src/modules/cbg/cbg-catalog-sync.ts'
import { readCatalogSqlFiles } from '../apps/api/scripts/catalog-sql.mjs'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const { PrismaPg } = require('@prisma/adapter-pg')
const { loadApiEnv } = require('@phoenix/config/env')

const sourceUrl = 'https://cbg-yys.res.netease.com/js/game_auto_config.js'
const maxBytes = 32 * 1024 * 1024

async function fetchConfig() {
  const response = await fetch(sourceUrl, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new Error('官方配置响应失败或超过大小限制')
  }
  const chunks = []
  let size = 0
  // Bound the decompressed stream, not just Content-Length.
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maxBytes) throw new Error('官方配置超过大小限制')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return {
    gameId: 'yys', sourceUrl,
    sourceHash: createHash('sha256').update(text).digest('hex'),
    payload: parseGameConfigScript(text), syncedAt: new Date(),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const officialOnly = args.length === 1 && args[0] === '--official-only'
  const [heroesPath, relicSuitsPath] = args
  if (!officialOnly && (args.length !== 2 || args.some((arg) => arg.startsWith('--')))) {
    throw new Error('用法：pnpm db:import-catalog <heroes.sql路径> <relic_suits.sql路径>，或 pnpm db:import-catalog --official-only')
  }
  // Validate every selected source before any database writes.
  const { heroes, relicSuits } = officialOnly
    ? { heroes: [], relicSuits: [] }
    : await readCatalogSqlFiles({ heroesPath, relicSuitsPath })
  const config = await fetchConfig()
  const bundled = JSON.parse(await readFile(new URL('../apps/api/src/modules/cbg/data/heroes.json', import.meta.url), 'utf8'))
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: loadApiEnv().databaseUrl, connectionTimeoutMillis:5_000 }) })
  try {
    const syncReport = await prisma.$transaction(async (tx) => {
      for (const row of heroes) await tx.heroCatalog.upsert({ where: { id: row.id }, create: row, update: row })
      for (const row of relicSuits) await tx.relicSuitCatalog.upsert({ where: { id: row.id }, create: row, update: row })
      const report = await syncOfficialHeroes(tx, config.payload, bundled.heroesById)
      await tx.cbgGameAutoConfig.upsert({ where: { gameId: 'yys' }, create: config, update: config })
      return report
    }, { timeout: 30_000 })
    console.log(JSON.stringify({
      importedHeroes: heroes.length, importedRelicSuits: relicSuits.length, ...syncReport,
      officialSections: Object.keys(config.payload).length,
      sourceHash: config.sourceHash, syncedAt: config.syncedAt.toISOString(),
    }, null, 2))
  } catch {
    // Never print Prisma errors, which may contain local connection details or SQL values.
    throw new Error('资料导入事务失败，未提交任何更改；请检查数据库连接及迁移状态')
  } finally { await prisma.$disconnect() }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
