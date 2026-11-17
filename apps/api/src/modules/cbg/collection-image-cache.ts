import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { collectionImagePath, isAllowedCollectionImageUrl } from './collection-image-source'

export const maxCollectionImageBytes = 4 * 1024 * 1024
export const collectionImageConcurrency = 4
const imageTimeoutMs = 15_000

type CachedImage = { body: Buffer; contentType: string; etag?: string; lastModified?: string }

/** Only raster formats are served; an HTML/login response can never become an image. */
export function collectionImageType(body: Buffer): string | undefined {
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
}

export async function readCollectionImage(response: Response) {
  if (Number(response.headers.get('content-length')) > maxCollectionImageBytes) {
    await response.body?.cancel()
    throw new Error('图片超出大小限制')
  }
  if (!response.body) throw new Error('图片响应为空')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxCollectionImageBytes) {
        await reader.cancel()
        throw new Error('图片超出大小限制')
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks, size)
    const contentType = collectionImageType(body)
    if (!contentType) throw new Error('图片格式无效')
    return { body, contentType }
  } finally { reader.releaseLock() }
}

/** Binary images use semantic paths; small sidecars retain HTTP validators. */
export class CollectionImageCache {
  private readonly inFlight = new Map<string, Promise<CachedImage>>()
  private readonly stop = new AbortController()
  private readonly waiting: (() => void)[] = []
  private active = 0

  constructor(private readonly directory: string) {}

  close() { this.stop.abort() }

  async get(url: string, refresh = false): Promise<CachedImage> {
    if (!isAllowedCollectionImageUrl(url)) throw new Error('unapproved image source')
    const pending = this.inFlight.get(url)
    if (pending) return pending
    const request = (async () => {
      const previous = await this.read(url)
      if (previous && !refresh) return previous
      try { return await this.download(url, previous) }
      catch (error) {
        if (previous) return previous
        throw error
      }
    })().finally(() => { this.inFlight.delete(url) })
    this.inFlight.set(url, request)
    return request
  }

  /** Offline migration: keep invalid or unwritable legacy records untouched. */
  async migrateLegacy() {
    let names: string[]
    try { names = await readdir(this.directory) } catch { return }
    for (const name of names) {
      if (this.stop.signal.aborted) return
      if (!/^[a-f0-9]{64}(?:\.meta)?\.json$/.test(name)) continue
      try {
        const record = await this.readRecord(join(this.directory, name), maxCollectionImageBytes * 1.4 + 4096)
        if (record && typeof record.url === 'string'
          && this.legacyFilename(record.url) === join(this.directory, name)
          && /^https:\/\/cbg-yys\.res\.netease\.com\/game_res\/yaozhige\/[a-zA-Z0-9_-]+\.png$/.test(record.url)
          && typeof record.data === 'string') {
          const body = Buffer.from(record.data, 'base64')
          const contentType = collectionImageType(body)
          if (!contentType || body.length > maxCollectionImageBytes) continue
          // Retired sources are archived offline only; this does not expand the HTTP source whitelist.
          const relative = `legacy/${new URL(record.url).pathname.slice('/game_res/'.length)}`
          await this.save(record.url, { body, contentType }, relative)
          await unlink(join(this.directory, name))
          continue
        }
        if (record && 'url' in record && typeof record.url === 'string' && isAllowedCollectionImageUrl(record.url)
          && [this.legacyFilename(record.url), this.legacyFilename(record.url).replace(/\.json$/, '.meta.json')].includes(join(this.directory, name))) {
          const image = await this.read(record.url)
          if (!image) continue
          await this.save(record.url, image)
          // The old hash path is validated against its official URL above.
          await unlink(join(this.directory, name))
          if (name.endsWith('.meta.json')) await unlink(join(this.directory, name.replace(/\.meta\.json$/, '.png'))).catch(() => undefined)
        }
      } catch { /* Leave unreadable records available for later recovery. */ }
    }
  }

  private filename(url: string) {
    const relative = collectionImagePath(url)
    if (!relative) throw new Error('unapproved image source')
    return join(this.directory, relative)
  }

  private legacyFilename(url: string) {
    return join(this.directory, `${createHash('sha256').update(url).digest('hex')}.json`)
  }

  private async readRecord(filename: string, limit: number): Promise<Record<string, unknown> | undefined> {
    if ((await stat(filename)).size > limit) return
    const value: unknown = JSON.parse(await readFile(filename, 'utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }

  private async read(url: string): Promise<CachedImage | undefined> {
    try {
      const filename = this.filename(url)
      if ((await stat(filename)).size <= maxCollectionImageBytes) {
        const body = await readFile(filename)
        const contentType = collectionImageType(body)
        if (contentType && body.length <= maxCollectionImageBytes) {
          let metadata: Record<string, unknown> | undefined
          try { metadata = await this.readRecord(`${filename}.meta.json`, 4096) } catch { /* Bytes remain usable without validators. */ }
          if (metadata?.url !== url || metadata.digest !== createHash('sha256').update(body).digest('hex')) metadata = undefined
          return {
            body, contentType,
            ...(typeof metadata?.etag === 'string' ? { etag: metadata.etag } : {}),
            ...(typeof metadata?.lastModified === 'string' ? { lastModified: metadata.lastModified } : {}),
          }
        }
      }
    } catch { /* Missing/corrupt images can recover from the legacy record or official source. */ }
    try {
      const legacy = this.legacyFilename(url)
      const metadata = legacy.replace(/\.json$/, '.meta.json')
      const record = await this.readRecord(legacy, maxCollectionImageBytes * 1.4 + 4096).catch(() => this.readRecord(metadata, 4096))
      if (!record || record.url !== url) return
      let body: Buffer
      if (typeof record.data === 'string') body = Buffer.from(record.data, 'base64')
      else {
        const binary = legacy.replace(/\.json$/, '.png')
        if ((await stat(binary)).size > maxCollectionImageBytes) return
        body = await readFile(binary)
      }
      const contentType = collectionImageType(body)
      if (!contentType || body.length > maxCollectionImageBytes) return
      const image = {
        body, contentType,
        ...(typeof record.etag === 'string' ? { etag: record.etag } : {}),
        ...(typeof record.lastModified === 'string' ? { lastModified: record.lastModified } : {}),
      }
      try {
        await this.save(url, image)
        // This exact hash record was validated above; remove only after the replacement is saved.
        await unlink(this.legacyFilename(url))
      } catch { /* A failed migration must not discard usable legacy bytes. */ }
      return image
    } catch { return undefined }
  }

  private async save(url: string, image: CachedImage, archivePath?: string) {
    const filename = archivePath ? join(this.directory, archivePath) : this.filename(url)
    const temporary = `${filename}.${randomUUID()}.tmp`
    const metadataTemporary = `${temporary}.meta.json`
    await mkdir(dirname(filename), { recursive: true })
    try {
      await writeFile(temporary, image.body)
      await writeFile(metadataTemporary, JSON.stringify({
        url, etag: image.etag, lastModified: image.lastModified,
        digest: createHash('sha256').update(image.body).digest('hex'),
      }))
      await rename(temporary, filename)
      await rename(metadataTemporary, `${filename}.meta.json`)
    } finally {
      await unlink(temporary).catch(() => undefined)
      await unlink(metadataTemporary).catch(() => undefined)
    }
  }

  private async download(url: string, previous?: CachedImage): Promise<CachedImage> {
    while (this.active >= collectionImageConcurrency) await new Promise<void>((resolve) => { this.waiting.push(resolve) })
    this.active++
    try {
      this.stop.signal.throwIfAborted()
      const headers: Record<string, string> = {}
      if (previous?.etag) headers['if-none-match'] = previous.etag
      if (previous?.lastModified) headers['if-modified-since'] = previous.lastModified
      const response = await fetch(url, {
        headers, redirect: 'error', cache: 'no-store',
        signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(imageTimeoutMs)]),
      })
      if (response.status === 304 && previous) { await response.body?.cancel(); return previous }
      if (!response.ok) { await response.body?.cancel(); throw new Error('官方图片暂时不可用') }
      const image = {
        ...await readCollectionImage(response),
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
      }
      await this.save(url, image)
      return image
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}
