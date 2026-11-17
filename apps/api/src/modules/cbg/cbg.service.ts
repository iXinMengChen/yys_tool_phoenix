import { BadGatewayException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { CbgProductData, CbgStaticData } from '@phoenix/types'
import { PrismaService } from '../../database/prisma.service'
import { CbgStaticService } from './cbg-static.service'
import { databaseError } from './cbg-database-error'
import { CbgSessionService } from './cbg-session.service'
import { CbgUpstream } from './cbg-upstream'
import { parseCbgDescription, parseCbgDescriptionFile, parseCbgPayload } from './cbg-payload'
import type { CbgChannel, ProductQueryDto } from './product-query.dto'

const hosts: Record<CbgChannel, string> = {
  official: 'yys.cbg.163.com', huawei: 'yys-huawei.cbg.163.com',
  oppo: 'yys-oppo.cbg.163.com', vivo: 'yys-vivo.cbg.163.com', xiaomi: 'yys-xiaomi.cbg.163.com',
}

const productCacheVersion = 'cbg-product-v1'
const productCacheTtlMs = 3 * 24 * 60 * 60 * 1000

@Injectable()
export class CbgService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: ReturnType<typeof setInterval>
  private readonly logger = new Logger(CbgService.name)
  private readonly pendingProducts = new Map<string, Promise<CbgProductData>>()
  private productQueue = Promise.resolve()

  constructor(
    private readonly upstream: CbgUpstream,
    private readonly session: CbgSessionService,
    private readonly staticService: CbgStaticService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    void this.cleanupExpired()
    this.cleanupTimer = setInterval(() => { void this.cleanupExpired() }, 60 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  onModuleDestroy() { clearInterval(this.cleanupTimer) }

  private async cleanupExpired() {
    try {
      await this.prisma.accountSnapshot.deleteMany({
        where: { relicVersion: productCacheVersion, expiresAt: { lte: new Date() } },
      })
    } catch (error) {
      this.logger.warn(`过期商品缓存清理失败，下个小时重试 [${databaseError(error)}]`)
    }
  }

  staticData(refresh = false): Promise<CbgStaticData> { return this.staticService.get(refresh) }

  async product(query: ProductQueryDto): Promise<CbgProductData> {
    const key = `${query.channel}:${query.serverid}:${query.ordersn}`
    const pending = this.pendingProducts.get(key)
    if (pending) return pending
    const request = this.cachedProduct(query)
    this.pendingProducts.set(key, request)
    try { return await request } finally { this.pendingProducts.delete(key) }
  }

  private async cachedProduct(query: ProductQueryDto): Promise<CbgProductData> {
    const identity = { channel: query.channel, serverId: query.serverid, orderSn: query.ordersn }
    const where = { channel_serverId_orderSn: identity }
    try {
      const cached = await this.prisma.accountSnapshot.findUnique({ where })
      if (cached?.relicVersion === productCacheVersion && cached.expiresAt.getTime() > Date.now()) {
        // Only this version stores the already validated, pruned CbgProductData contract.
        return cached.accountPayload as CbgProductData
      }
    } catch (error) { this.logger.warn(`商品缓存读取失败，将重新查询上游 [${databaseError(error)}]`) }

    const product = await this.throttledProduct(query)
    const cachedAt = new Date()
    const data = {
      accountPayload: product, relicPayload: {}, relicVersion: productCacheVersion,
      cachedAt, expiresAt: new Date(cachedAt.getTime() + productCacheTtlMs),
    }
    try {
      await this.prisma.accountSnapshot.upsert({ where, create: { ...identity, ...data }, update: data })
    } catch (error) { this.logger.warn(`商品缓存保存失败，本次仍返回已获取的商品数据 [${databaseError(error)}]`) }
    return product
  }

  private async throttledProduct(query: ProductQueryDto): Promise<CbgProductData> {
    // ponytail: FIFO queue per process; use a shared queue when deploying multiple API replicas.
    const request = this.productQueue.then(async () => {
      await delay(2000)
      return this.fetchProduct(query)
    })
    this.productQueue = request.then(() => undefined, () => undefined)
    return request
  }

  private async fetchProduct(query: ProductQueryDto): Promise<CbgProductData> {
    this.upstream.assertAvailable()
    const host = hosts[query.channel]
    const cookie = query.channel === 'official' ? await this.session.cookieForProduct(query) : undefined
    const url = new URL(`https://${host}/cgi/api/get_equip_detail`)
    url.searchParams.set('client_type', 'h5')
    const body = new URLSearchParams({
      serverid: query.serverid, ordersn: query.ordersn,
      h5_device: 'other', app_client: 'other', exclude_equip_desc: '1',
      view_loc: query.view_loc ?? '', exter: 'direct',
      page_session_id: randomUUID().toUpperCase(),
      traffic_trace: JSON.stringify(query.tfid || query.tcid
        ? { field_id: query.tfid ?? '', content_id: query.tcid ?? '' } : {}),
    })
    const { json } = await this.upstream.request(url, {
      method: 'POST', body,
      headers: { accept: 'application/json', referer: `https://${host}/`, ...(cookie ? { cookie } : {}) },
    })
    const payload = parseCbgPayload(json)
    const equip = payload.equip ?? payload.equip_data
    if (!equip) throw new BadGatewayException('藏宝阁没有返回商品数据')
    let description = equip.equip_desc
    if (!description) {
      // Construct from validated request ID, never follow arbitrary upstream URLs.
      const descriptionUrl = new URL(`https://cbg-other-desc.res.netease.com/yys/static/equipdesc/${query.ordersn}.json`)
      const response = await this.upstream.request(descriptionUrl, {
        headers: { accept: 'application/json', referer: 'https://yys.cbg.163.com/' },
      })
      description = parseCbgDescriptionFile(response.json)
    }
    const equipDescription = parseCbgDescription(description)
    return {
      schemaVersion: 1,
      channel: query.channel,
      sourceUrl: `https://${host}/cgi/mweb/equip/${query.serverid}/${query.ordersn}`,
      equip: { ...equip, equip_desc: equipDescription },
    }
  }
}
