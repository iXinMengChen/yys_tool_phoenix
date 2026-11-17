// In-memory transpilation; no service, database, real environment or network.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const modules = new Map()
function load(name) {
  if (modules.has(name)) return modules.get(name)
  const filename = fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText
  const mod = new Module(filename)
  mod.paths = require.resolve.paths('@nestjs/common')
  mod.require = (id) => {
    if (id === './cbg-static.service') return { CbgStaticService: class {} }
    if (id === './cbg.service') return { CbgService: class {} }
    if (id === './cbg-session.service') return { CbgSessionService: class {} }
    if (id.startsWith('./')) return load(`modules/cbg/${id.slice(2)}`)
    return require(id)
  }
  mod._compile(compiled, filename)
  modules.set(name, mod.exports)
  return mod.exports
}
const { CollectionImageCache, maxCollectionImageBytes, readCollectionImage, collectionImageConcurrency } = load('modules/cbg/collection-image-cache')
const { StreamableFile } = require('@nestjs/common')
const { firstValueFrom, of } = require('rxjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GxkAAAAASUVORK5CYII=', 'base64')
const official = 'https://cbg-yys.res.netease.com/game_res/currency/900313.png'

async function withCache(run) {
  const directory = await mkdtemp(join(tmpdir(), 'phoenix-images-'))
  const cache = new CollectionImageCache(directory)
  const originalFetch = globalThis.fetch
  try { await run(cache, directory) }
  finally { cache.close(); globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }) }
}

test('cache reuses disk after restart, sends validators, accepts 304 and retains old bytes on failures', async () => {
  await withCache(async (cache, directory) => {
    let calls = 0
    globalThis.fetch = async (_url, init) => {
      calls++
      assert.equal(init.redirect, 'error')
      assert.equal(init.cache, 'no-store')
      assert.ok(init.signal instanceof AbortSignal)
      return new Response(png, { headers: { etag: '"v1"', 'last-modified': 'Wed, 11 Nov 2026 00:00:00 GMT' } })
    }
    assert.deepEqual((await cache.get(official)).body, png)
    const restarted = new CollectionImageCache(directory)
    assert.deepEqual((await restarted.get(official)).body, png)
    assert.equal(calls, 1)
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers['if-none-match'], '"v1"')
      assert.equal(init.headers['if-modified-since'], 'Wed, 11 Nov 2026 00:00:00 GMT')
      return new Response(null, { status: 304 })
    }
    assert.deepEqual((await restarted.get(official, true)).body, png)
    for (const response of [() => new Response('bad', { status: 503 }), () => new Response('<html>login</html>'), () => { throw new Error('timeout') }, () => new Response(png, { headers: { 'content-length': String(maxCollectionImageBytes + 1) } })]) {
      globalThis.fetch = async () => response()
      assert.deepEqual((await restarted.get(official, true)).body, png)
      assert.deepEqual((await new CollectionImageCache(directory).get(official)).body, png)
    }
    restarted.close()
  })
})

test('parallel requests share a download and all downloads respect global concurrency', async () => {
  await withCache(async (cache) => {
    let active = 0, peak = 0, calls = 0
    globalThis.fetch = async () => {
      calls++; active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return new Response(png)
    }
    await Promise.all(Array.from({ length: 12 }, () => cache.get(official)))
    assert.equal(calls, 1)
    calls = 0
    await Promise.all(Array.from({ length: 12 }, (_, i) => cache.get(official.replace('900313', String(500000 + i)))))
    assert.equal(calls, 12)
    assert.equal(peak, collectionImageConcurrency)
  })
})

test('image boundary rejects declared/decoded oversize, empty and non-raster data', async () => {
  await assert.rejects(readCollectionImage(new Response(png, { headers: { 'content-length': String(maxCollectionImageBytes + 1) } })), /大小限制/)
  await assert.rejects(readCollectionImage(new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(maxCollectionImageBytes)); controller.enqueue(new Uint8Array(1)); controller.close()
  } }))), /大小限制/)
  await assert.rejects(readCollectionImage(new Response('<svg></svg>')), /格式无效/)
  await assert.rejects(readCollectionImage(new Response(null)), /响应为空/)
  assert.equal((await readCollectionImage(new Response(png))).contentType, 'image/png')
})

test('global envelope preserves raw StreamableFile bytes and wraps ordinary JSON', async () => {
  const { ResponseEnvelopeInterceptor } = load('common/interceptors/response-envelope.interceptor')
  const interceptor = new ResponseEnvelopeInterceptor()
  const file = new StreamableFile(png, { type: 'image/png', length: png.length })
  const raw = await firstValueFrom(interceptor.intercept({}, { handle: () => of(file) }))
  assert.equal(raw, file)
  assert.equal(raw.getHeaders().type, 'image/png')
  const chunks = []
  for await (const chunk of raw.getStream()) chunks.push(chunk)
  assert.deepEqual(Buffer.concat(chunks), png)
  assert.deepEqual(await firstValueFrom(interceptor.intercept({}, { handle: () => of({ ok: true }) })), { code: 200, message: 'success', data: { ok: true } })
})

test('confirmed source mapping uses public IDs and rejects arbitrary URL components', async () => {
  const { collectionImageSource, collectionImageSourcePath, isAllowedCollectionImageUrl } = load('modules/cbg/collection-image-source')
  const { collectionCatalog, parseGameConfigPayload } = load('modules/cbg/cbg-static-payload')
  const config = parseGameConfigPayload({
    hero_list: [[200, '桃花妖', 3, 'taohuayao'], [10, '阴阳师', 3, 'onmyoji']], yuhun_list: [[1, '套装', '', '', '']], two_suit_yuhun: {},
    skin_list: { '410101': '森罗万象', '410102': '暂无预览', '410103': '不可信来源', '410105': '阴阳师皮肤', '412001': '其他皮肤' }, collection_skin_data: { '412195': '响魂醉曲' },
    skin_viedo_conf: {
      '410101': { image_url: 'https://cbg2.fp.ps.netease.com/file/skin410101' },
      '410103': { image_url: 'https://evil.test/file/skin410103' },
      '412195': { image_url: 'https://cbg.fp.ps.netease.com/file/skin412195' },
    },
    cbg_special_skin_list: { '900313': '碎片' }, cbg_special_skin_list_2: { '412197': '特殊' },
    yard_skin: { '900025': { name: '庭院' } }, gamble_skin: { '1101404': { name: '召唤屋' } },
    shishenlu_skin: { '1500000': { name: '式神录' } }, battle_skin: { '1510000': { name: '主题' } },
    yinyangshu_skin: { '1600000': { name: '阴阳术' } }, head_skin_list: { '101': { name: '头像框' } },
    honor_list: { '900401': { name: '徽章' }, '900402': { name: '应援徽章' } }, achieve_list: { '1': { name: '成就' } },
    yaozhige_list: { '419003': { name: '神龙', icon: 'icon_shenlong_01.png' }, '419005': { name: '恶意地址', icon: 'https://evil.test/x.png' } },
    qiling_list: { '1': { name: '术印', desc: '说明', pic: 'hunling_pic/1.png' }, '2': { name: '越界', pic: '../headskin/101.png' } },
  })
  const expected = {
    specialSkins: ['900313', 'currency/900313.png'], specialSkins2: ['412197', 'currency/412197.png'],
    yards: ['900025', 'sceneskin/900025.png'], summonRooms: ['1101404', 'decocardhouse/1101404.png'],
    heroRooms: ['1500000', 'currency/1500000.png'], battleThemes: ['1510000', 'currency/1510000.png'],
    onmyojiRooms: ['1600000', 'currency/1600000.png'], frames: ['101', 'headskin/101.png'],
    honors: ['900401', 'badge/900401.png'], qiling: ['1', 'hunling_pic/1.png'],
  }
  const catalog = collectionCatalog(config)
  const supportBadge = 'https://cbg-yys.res.netease.com/game_res/yingyuan/269.png'
  assert.equal(collectionImageSource('yingyuan', '269', config), supportBadge)
  assert.equal(isAllowedCollectionImageUrl(supportBadge), true)
  assert.equal(collectionImageSource('yingyuan', '269', { ...config, honor_list: { '900401': { name: '徽章' } } }), undefined)
  for (const [kind, [id, path]] of Object.entries(expected)) {
    const url = path.startsWith('https://') ? path : `https://cbg-yys.res.netease.com/game_res/${path}`
    assert.equal(collectionImageSource(kind, id, config), url)
    assert.ok(isAllowedCollectionImageUrl(url))
    assert.equal(catalog[kind][id].imageUrl, `/cbg/images/${path}`)
  }
  // 曜之阁是混合奖励目录，不能用作御灵目录或御灵立绘来源。
  assert.equal(catalog.spiritSkins, undefined)
  assert.equal(collectionImageSource('spiritSkins', '419003', config), undefined)
  assert.equal(collectionImageSource('spiritSkins', '419012', config, '901'), undefined)
  assert.equal(isAllowedCollectionImageUrl('https://cbg-yys.res.netease.com/game_res/yaozhige/icon_shenlong_01.png'), false)
  assert.deepEqual(catalog.qiling['1'], { name: '术印', description: '说明', imageUrl: '/cbg/images/hunling_pic/1.png' })
  assert.deepEqual(catalog.skins['410101'], { name: '森罗万象', imageUrl: '/cbg/images/skins/10/410101.png' })
  assert.deepEqual(catalog.premiumSkins['412195'], { name: '响魂醉曲' })
  assert.equal(collectionImageSource('premiumSkins', '412195', config), undefined)
  const premium = 'https://cbg-yys.res.netease.com/game_res/hero/200/skin/412195.png'
  assert.equal(collectionImageSource('premiumSkins', '412195', config, '200'), premium)
  assert.equal(isAllowedCollectionImageUrl(premium), true)
  assert.equal(collectionImageSourcePath('skins/200/412195.png', config), premium)
  assert.equal(collectionImageSourcePath('currency/900313.png', config), official)
  for (const path of ['currency/999.png', '../currency/900313.png', 'files/cbg.fp.ps.netease.com/skin412195.png']) {
    assert.equal(collectionImageSourcePath(path, config), undefined)
  }
  const onmyojiSkin = 'https://cbg-yys.res.netease.com/game_res/hero/10/skin/410105.png'
  const otherSkin = 'https://cbg-yys.res.netease.com/game_res/hero/200/skin/412001.png'
  assert.equal(collectionImageSource('skins', '410105', config, '10'), onmyojiSkin)
  assert.equal(collectionImageSource('skins', '412001', config, '200'), otherSkin)
  assert.equal(collectionImageSource('skins', '412001', config, '999'), undefined)
  assert.equal(isAllowedCollectionImageUrl(onmyojiSkin), true)
  assert.equal(isAllowedCollectionImageUrl(otherSkin), true)
  assert.equal(collectionImageSource('heroes', '200', config), 'https://cbg-yys.res.netease.com/game_res/hero/200/200.png')
  assert.equal(collectionImageSource('suits', '1', config), 'https://cbg-yys.res.netease.com/game_res/suit/1.png')
  assert.deepEqual(catalog.skins['410102'], { name: '暂无预览', imageUrl: '/cbg/images/skins/10/410102.png' })
  assert.deepEqual(catalog.skins['410103'], { name: '不可信来源', imageUrl: '/cbg/images/skins/10/410103.png' })
  assert.deepEqual(catalog.achievements['1'], { name: '成就' })
  for (const [kind, id] of [['skins', '999'], ['achievements', '1'], ['unknown', '101'], ['frames', '999'], ['frames', '../101'], ['frames', '101?x=1'], ['qiling', '2'], ['spiritSkins', '419005']]) assert.equal(collectionImageSource(kind, id, config), undefined)
  for (const url of [
    official.replace('https:', 'http:'), official.replace('cbg-yys.res.netease.com', 'cbg-yys.res.netease.com.evil.test'),
    official.replace('https://', 'https://user:pass@'), official.replace('.com/', '.com:444/'), `${official}?url=https://evil.test`, `${official}#x`,
    official.replace('/currency/', '/login/'), official.replace('/currency/', '/currency/../currency/'), 'https://127.0.0.1/test.png',
    'http://cbg.fp.ps.netease.com/file/skin410101', 'https://cbg.fp.ps.netease.com.evil.test/file/skin410101',
    'https://cbg.fp.ps.netease.com/file/skin410101?url=https://evil.test', 'https://cbg.fp.ps.netease.com/file/../currency/1.png',
  ]) assert.equal(isAllowedCollectionImageUrl(url), false)
  await withCache(async (cache) => {
    globalThis.fetch = async () => assert.fail('unapproved sources must never fetch')
    await assert.rejects(cache.get('https://127.0.0.1/test.png'), /unapproved/)
  })
})

test('startup runs without blocking, refreshes all newly published IDs and destroys daily timer', async () => {
  const { CbgCollectionImagesService } = load('modules/cbg/cbg-collection-images.service')
  const ids = Array.from({ length: 19 }, (_, i) => String(900000 + i))
  const calls = [], downloads = []
  const data = { collections: { frames: Object.fromEntries(ids.map((id) => [id, { name: id }])) } }
  const service = new CbgCollectionImagesService({
    get: async (refresh) => { calls.push(refresh); return refresh ? data : { collections: { frames: {} } } },
    imageSource: (_kind, id) => official.replace('900313', id),
  })
  let active = 0, peak = 0, closed = false
  service.cache = {
    get: async (url, refresh) => {
      assert.equal(refresh, undefined); downloads.push(url); peak = Math.max(peak, ++active)
      await new Promise((resolve) => setTimeout(resolve, 3)); active--
      return { body: png, contentType: 'image/png' }
    },
    close: () => { closed = true }, migrateLegacy: async () => {},
  }
  try {
    assert.equal(service.onApplicationBootstrap(), undefined)
    assert.equal(service.timer.hasRef(), false)
    assert.equal(service.timer._idleTimeout, 24 * 60 * 60 * 1000)
    assert.equal(downloads.length, 0)
    await service.synchronize()
    assert.deepEqual(calls, [undefined, true])
    assert.equal(downloads.length, ids.length)
    assert.equal(new Set(downloads).size, ids.length)
    assert.equal(peak, collectionImageConcurrency)
  } finally { service.onModuleDestroy() }
  assert.ok(closed && service.timer._destroyed && service.startup._destroyed)
  await service.synchronize()
  assert.equal(downloads.length, ids.length)
})

test('image controller returns binary, validates published IDs and does not cache errors', async () => {
  const { CbgCollectionImagesService } = load('modules/cbg/cbg-collection-images.service')
  const { CbgController } = load('modules/cbg/cbg.controller')
  const { ResponseEnvelopeInterceptor } = load('common/interceptors/response-envelope.interceptor')
  await withCache(async (cache) => {
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response(png) }
    const service = new CbgCollectionImagesService({
      get: async () => ({}),
      imageSource: (kind, id) => kind === 'specialSkins' && id === '900313' ? official : undefined,
      imageSourcePath: (path) => path === 'currency/900313.png' ? official : undefined,
    })
    service.cache.close(); service.cache = cache
    const controller = new CbgController({}, {}, service)
    const headers = new Map()
    const response = { setHeader: (name, value) => headers.set(name, value) }
    const file = await controller.collectionImage('specialSkins', '900313', response)
    assert.ok(file instanceof StreamableFile)
    assert.equal(headers.get('Cache-Control'), 'public, max-age=3600')
    assert.equal(file.getHeaders().type, 'image/png')
    assert.equal(file.getHeaders().length, png.length)
    const raw = await firstValueFrom(new ResponseEnvelopeInterceptor().intercept({}, { handle: () => of(file) }))
    const chunks = []
    for await (const chunk of raw.getStream()) chunks.push(chunk)
    assert.deepEqual(Buffer.concat(chunks), png)
    for (const [kind, id] of [['frames', 'unknown'], ['specialSkins', '../900313'], ['https://evil.test', '900313']]) {
      await assert.rejects(controller.collectionImage(kind, id, response), (error) => error.getStatus() === 404)
      assert.equal(headers.get('Cache-Control'), 'no-store')
    }
    const semantic = await controller.imagePath(['currency', '900313.png'], response)
    assert.ok(semantic instanceof StreamableFile)
    assert.equal(headers.get('Cache-Control'), 'public, max-age=3600')
    await assert.rejects(controller.imagePath('../currency/900313.png', response), error => error.getStatus() === 404)
    assert.equal(headers.get('Cache-Control'), 'no-store')
    assert.equal(calls, 1)
    service.onModuleDestroy()
  })
})

test('shutdown aborts in-flight downloads and settles queued work', async () => {
  await withCache(async (cache) => {
    let started = 0
    globalThis.fetch = async (_url, init) => {
      started++
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    }
    const requests = Array.from({ length: 8 }, (_, i) => cache.get(official.replace('900313', String(600000 + i))))
    await new Promise((resolve) => setTimeout(resolve, 10))
    cache.close()
    const settled = await Promise.allSettled(requests)
    assert.equal(started, collectionImageConcurrency)
    assert.ok(settled.every((entry) => entry.status === 'rejected'))
  })
})
