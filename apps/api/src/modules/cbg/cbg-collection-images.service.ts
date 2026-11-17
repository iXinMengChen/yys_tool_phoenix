import { join } from 'node:path'
import { Injectable, Logger, NotFoundException, StreamableFile } from '@nestjs/common'
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { CollectionImageCache, collectionImageConcurrency } from './collection-image-cache'
import { CbgStaticService } from './cbg-static.service'

const refreshIntervalMs = 24 * 60 * 60 * 1000

@Injectable()
export class CbgCollectionImagesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CbgCollectionImagesService.name)
  private readonly cache = new CollectionImageCache(join(process.cwd(), 'data', 'collection-images'))
  private timer?: ReturnType<typeof setInterval>
  private startup?: ReturnType<typeof setTimeout>
  private syncing?: Promise<void>
  private destroyed = false

  constructor(private readonly staticData: CbgStaticService) {}

  onApplicationBootstrap() {
    // Returning immediately keeps official network access off the server's startup path.
    this.startup = setTimeout(() => { void this.synchronize() }, 0)
    this.startup.unref()
    this.timer = setInterval(() => { void this.synchronize() }, refreshIntervalMs)
    this.timer.unref()
  }

  onModuleDestroy() {
    this.destroyed = true
    clearTimeout(this.startup)
    clearInterval(this.timer)
    this.cache.close()
  }

  async image(kind: string, id: string, heroId?: string) {
    await this.staticData.get()
    // Only IDs in the published config can resolve an official source.
    const source = this.staticData.imageSource(kind, id, heroId)
    if (!source) throw new NotFoundException('收藏图片不存在')
    try {
      const image = await this.cache.get(source)
      return new StreamableFile(image.body, { type: image.contentType, length: image.body.length })
    } catch { throw new NotFoundException('收藏图片暂不可用') }
  }

  async imagePath(path: string) {
    await this.staticData.get()
    const source = this.staticData.imageSourcePath(path)
    if (!source) throw new NotFoundException('收藏图片不存在')
    try {
      const image = await this.cache.get(source)
      return new StreamableFile(image.body, { type: image.contentType, length: image.body.length })
    } catch { throw new NotFoundException('收藏图片暂不可用') }
  }

  private synchronize(): Promise<void> {
    if (this.destroyed) return Promise.resolve()
    this.syncing ??= this.refreshImages().catch(() => {
      if (!this.destroyed) this.logger.warn('收藏图片同步失败，保留已有图片缓存')
    }).finally(() => { this.syncing = undefined })
    return this.syncing
  }

  private async refreshImages() {
    await this.cache.migrateLegacy()
    if (this.destroyed) return
    let data = await this.staticData.get()
    try { data = await this.staticData.get(true) }
    catch { this.logger.warn('收藏目录自动更新失败，沿用已有目录同步图片') }
    const sources = new Set<string>()
    for (const [kind, entries] of Object.entries(data.collections ?? {})) {
      if (Array.isArray(entries)) continue
      for (const id of Object.keys(entries)) {
        const source = this.staticData.imageSource(kind, id)
        if (source) sources.add(source)
      }
    }
    for (const id of Object.keys(data.heroCatalog ?? {})) {
      const source = this.staticData.imageSource('heroes', id)
      if (source) sources.add(source)
    }
    for (const [id] of data.relicSuits?.yuhun_list ?? []) {
      const source = this.staticData.imageSource('suits', String(id))
      if (source) sources.add(source)
    }
    const pending = sources.values()
    let failed = 0
    await Promise.all(Array.from({ length: collectionImageConcurrency }, async () => {
      for (const source of pending) {
        if (this.destroyed) return
        try { await this.cache.get(source) }
        catch { failed++ }
      }
    }))
    if (!this.destroyed) this.logger.log(`收藏图片同步完成：${sources.size} 个官方资源，${failed} 个暂不可用`)
  }
}
