import { createHash } from 'node:crypto'
import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import type { CbgServerGroup, CbgStaticData, HeroPanel } from '@phoenix/types'
import { PrismaService } from '../../database/prisma.service'
import type { HeroCatalog } from '../../generated/prisma/client'
import { databaseHeroPanel } from './cbg-catalog-sync'
import { databaseError } from './cbg-database-error'
import { collectionCatalog, parseGameConfigPayload, parseGameConfigScript, parseServerListScript } from './cbg-static-payload'
import type { CbgGameConfig } from './cbg-static-payload'
import { isAllowedCbgUrl, readCbgBody } from './cbg-upstream'
import { collectionImageSource, collectionImageSourcePath } from './collection-image-source'
import bundledHeroes from './data/heroes.json'
import bundledRelicSuits from './data/relic-suits.json'
import bundledServers from './data/server-list.json'

export { parseGameConfigScript, parseServerListScript } from './cbg-static-payload'

const gameConfigUrl = 'https://cbg-yys.res.netease.com/js/game_auto_config.js'
const staticRefreshIntervalMs = 30 * 24 * 60 * 60 * 1_000

@Injectable()
export class CbgStaticService implements OnModuleInit {
  private readonly logger = new Logger(CbgStaticService.name)
  private current: CbgStaticData = this.snapshot([])
  private loaded?: Promise<void>
  private inFlight?: Promise<CbgStaticData>
  private nextRefreshAt = 0
  private gameConfig?: CbgGameConfig

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.initializeCatalog()
    this.loaded = this.loadDatabase()
    await this.loaded
    const refreshedAt = this.current.refreshedAt ? Date.parse(this.current.refreshedAt) : 0
    if (!refreshedAt || Date.now() - refreshedAt >= staticRefreshIntervalMs) {
      void this.get(true).catch(() => this.logger.warn('月度静态资料刷新失败，将在下次检查时重试'))
    }
    const timer = setInterval(() => {
      const lastRefresh = this.current.refreshedAt ? Date.parse(this.current.refreshedAt) : 0
      if (!lastRefresh || Date.now() - lastRefresh >= staticRefreshIntervalMs) {
        void this.get(true).catch(() => this.logger.warn('月度静态资料刷新失败，将在下次检查时重试'))
      }
    }, 24 * 60 * 60 * 1_000)
    timer.unref()
  }

  async get(refresh = false): Promise<CbgStaticData> {
    this.loaded ??= this.loadDatabase()
    await this.loaded
    if (!refresh) return this.current
    if (this.inFlight) return this.inFlight
    if (Date.now() < this.nextRefreshAt) throw new HttpException('静态资料刷新过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    this.nextRefreshAt = Date.now() + 30_000
    this.inFlight = this.refresh().finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  imageSource(kind: string, id: string, heroId?: string) {
    return collectionImageSource(kind, id, this.imageConfig(), heroId)
  }

  imageSourcePath(path: string) {
    return collectionImageSourcePath(path, this.imageConfig())
  }

  private imageConfig(): CbgGameConfig {
    return this.gameConfig ?? {
      hero_list: Object.values(this.current.heroCatalog ?? {}).map<CbgGameConfig['hero_list'][number]>(({ id, name, rarityCode, slug }) => [id, name, rarityCode, slug]),
      yuhun_list: (this.current.relicSuits.yuhun_list ?? []).map<CbgGameConfig['yuhun_list'][number]>(([id, name, slug, attribute, effect]) => [id, name, slug, attribute ?? '', effect ?? '']),
      two_suit_yuhun: this.current.relicSuits.two_suit_yuhun ?? {},
    }
  }

  private snapshot(
    rows: HeroCatalog[], config?: CbgGameConfig, source: CbgStaticData['source'] = 'bundled',
    refreshedAt: string | null = null, serverList: CbgServerGroup[] = bundledServers,
  ): CbgStaticData {
    const heroesById: Record<string, HeroPanel> = structuredClone(bundledHeroes.heroesById)
    for (const row of rows) heroesById[String(row.id)] = databaseHeroPanel(row)
    const heroCatalog = Object.fromEntries(Object.values(heroesById).map((hero) => [String(hero.id), {
      id: hero.id, name: hero.name, rarityCode: hero.rarityCode ?? 0, slug: hero.slug ?? '',
    }]))
    const missingHeroIds: number[] = []
    // heroCatalog/base panels are maintained from the database or bundled snapshot.
    // The monthly CBG JSON refresh must not overwrite the manually maintained hero list.
    for (const [id] of config?.hero_list ?? []) {
      if (!heroesById[String(id)]) missingHeroIds.push(id)
    }
    return {
      heroes: { schemaVersion: bundledHeroes.schemaVersion, heroCount: Object.keys(heroesById).length, heroesById }, heroCatalog,
      relicSuits: config ? { yuhun_list: config.yuhun_list, two_suit_yuhun: config.two_suit_yuhun } : {
        ...bundledRelicSuits,
        yuhun_list: bundledRelicSuits.yuhun_list.map<[number, string, string, string, string]>(
          ([id, name, slug, attribute, effect]) => [Number(id), String(name), String(slug), String(attribute), String(effect)],
        ),
      },
      ...(config ? { collections: collectionCatalog(config) } : {}),
      serverList, source, refreshedAt, missingHeroIds,
      heroBaseStatsSource: rows.length === 0 ? 'bundled' : rows.length === Object.keys(heroesById).length ? 'database' : 'mixed',
    }
  }

  private async initializeCatalog() {
    try {
      const imported = await this.prisma.$transaction(async (tx) => {
        let heroes = 0
        let relicSuits = 0
        if (await tx.heroCatalog.count() === 0) {
          const result = await tx.heroCatalog.createMany({
            data: Object.values(bundledHeroes.heroesById).map((hero) => ({
              id: hero.id, name: hero.name, slug: hero.slug, level: hero.level,
              ...hero.baseStats, lowestRank: String(hero.lowestRank),
              isCollaboration: 'isCollaboration' in hero ? hero.isCollaboration : false,
              additionalAttributes: null, additionalAttributesValue: 0,
            })),
            skipDuplicates: true,
          })
          heroes = result.count
        }
        if (await tx.relicSuitCatalog.count() === 0) {
          const result = await tx.relicSuitCatalog.createMany({
            data: bundledRelicSuits.yuhun_list.map(([id, name, slug, attribute, effect]) => ({
              id: Number(id), name: String(name), slug: String(slug),
              twoPieceAttribute: String(attribute), twoPieceEffect: String(effect),
              isOma: Object.prototype.hasOwnProperty.call(bundledRelicSuits.two_suit_yuhun, String(id)),
            })),
            skipDuplicates: true,
          })
          relicSuits = result.count
        }
        return { heroes, relicSuits }
      }, { timeout: 30_000 })
      if (imported.heroes || imported.relicSuits) {
        this.logger.log(`已初始化内置静态资料：式神 ${imported.heroes} 条，御魂套装 ${imported.relicSuits} 条`)
      }
    } catch (error) {
      this.logger.warn(`内置静态资料初始化失败，未提交更改；下次启动重试 [${databaseError(error)}]`)
    }
  }

  private async loadDatabase() {
    try {
      const [stored, rows] = await Promise.all([
        this.prisma.cbgGameAutoConfig.findUnique({ where: { gameId: 'yys' } }),
        this.prisma.heroCatalog.findMany(),
      ])
      let config: CbgGameConfig | undefined
      if (stored) {
        try { config = parseGameConfigPayload(stored.payload) }
        catch { this.logger.warn('数据库官方静态资料校验失败，使用内置目录回退') }
      }
      this.current = this.snapshot(rows, config, config || rows.length ? 'database' : 'bundled', config && stored ? stored.syncedAt.toISOString() : null)
      this.gameConfig = config
    } catch (error) {
      this.logger.warn(`数据库静态资料暂时不可用，使用内置资料回退 [${databaseError(error)}]`)
    }
  }

  private async refresh(): Promise<CbgStaticData> {
    const [game, servers] = await Promise.all([
      this.fetchText(gameConfigUrl),
      this.fetchText('https://cbg-yys.res.netease.com/js/server_list_data.js'),
    ])
    const config = parseGameConfigScript(game)
    const serverList = parseServerListScript(servers)
    const syncedAt = new Date()
    const record = {
      gameId: 'yys', sourceUrl: gameConfigUrl,
      sourceHash: createHash('sha256').update(game).digest('hex'), payload: config, syncedAt,
    }
    let next: CbgStaticData
    let stage = '开始事务'
    try {
      next = await this.prisma.$transaction(async (tx) => {
        stage = '保存官方配置'
        await tx.cbgGameAutoConfig.upsert({ where: { gameId: 'yys' }, create: record, update: record })
        stage = '读取式神面板'
        const rows = await tx.heroCatalog.findMany()
        stage = '生成资料快照'
        const snapshot = this.snapshot(rows, config, 'remote', syncedAt.toISOString(), serverList)
        stage = '提交事务'
        return snapshot
      }, { timeout: 30_000 })
    } catch (error) {
      this.logger.warn(`静态资料事务失败，未更新缓存 [阶段=${stage}；${databaseError(error)}]`)
      throw new BadGatewayException('静态资料持久化失败')
    }
    // Publish only after both upstreams validate AND the database transaction commits.
    this.current = next
    this.gameConfig = config
    return this.current
  }

  private async fetchText(input: string) {
    const url = new URL(input)
    if (!isAllowedCbgUrl(url)) throw new BadGatewayException('静态资料地址不在白名单中')
    try {
      const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (!response.ok) { await response.body?.cancel(); throw new BadGatewayException('远程静态资料暂时不可用') }
      return await readCbgBody(response)
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new BadGatewayException('远程静态资料暂时不可用')
    }
  }
}
