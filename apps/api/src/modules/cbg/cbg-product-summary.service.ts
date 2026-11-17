import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { CbgProductSummaryReceipt } from '@phoenix/types'
import { PrismaService } from '../../database/prisma.service'
import type { ProductSummaryDto } from './product-summary.dto'

@Injectable()
export class CbgProductSummaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CbgProductSummaryService.name)
  private cleanupTimer?: ReturnType<typeof setInterval>

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanupExpired()
    this.cleanupTimer = setInterval(() => { void this.cleanupExpired() }, 60 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  onModuleDestroy() { clearInterval(this.cleanupTimer) }

  async upload(input: ProductSummaryDto): Promise<CbgProductSummaryReceipt> {
    const identity = { channel: input.channel, serverId: input.serverid, orderSn: input.ordersn }
    const uploadedAt = new Date()
    const expiresAt = new Date(uploadedAt)
    // Three UTC calendar months, clamped to the destination month's last day.
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 4, 0)
    expiresAt.setUTCDate(Math.min(uploadedAt.getUTCDate(), expiresAt.getUTCDate()))
    const data = { summary: input.summary, source: 'client_upload', uploadedAt, expiresAt }
    // Persist failures propagate: never acknowledge an upload that was not saved.
    const row = await this.prisma.productSummary.upsert({
      where: { channel_serverId_orderSn: identity },
      create: { ...identity, ...data }, update: data,
      select: { id: true, uploadedAt: true, expiresAt: true },
    })
    return { id: row.id, source: 'client_upload', uploadedAt: row.uploadedAt.toISOString(), expiresAt: row.expiresAt.toISOString() }
  }

  private async cleanupExpired() {
    try {
      await this.prisma.productSummary.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    } catch {
      this.logger.warn('过期商品摘要清理失败，请核对数据库连接与迁移；下个小时重试')
    }
  }
}
