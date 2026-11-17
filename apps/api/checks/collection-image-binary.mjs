import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(name) {
  const filename = fileURLToPath(new URL(`../src/modules/cbg/${name}.ts`, import.meta.url))
  const mod = new Module(filename)
  mod.require = id => id.startsWith('./') ? load(id.slice(2)) : require(id)
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return mod.exports
}
const { CollectionImageCache } = load('collection-image-cache')
const { collectionImagePath } = load('collection-image-source')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GxkAAAAASUVORK5CYII=', 'base64')
const official = 'https://cbg-yys.res.netease.com/game_res/currency/900313.png'

test('semantic binary cache migrates offline, retains validators and isolates invalid legacy files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phoenix-binary-'))
  const originalFetch = globalThis.fetch
  const cache = new CollectionImageCache(directory)
  try {
    const legacyName = `${createHash('sha256').update(official).digest('hex')}.json`
    await writeFile(join(directory, legacyName), JSON.stringify({ url: official, data: png.toString('base64'), etag: 'v1' }))
    const invalid = `${'0'.repeat(64)}.json`
    await writeFile(join(directory, invalid), '{broken')
    globalThis.fetch = async () => { throw new Error('Migration must be offline') }
    await cache.migrateLegacy()
    assert.deepEqual(await readFile(join(directory, 'currency/900313.png')), png)
    assert.equal((await readdir(directory)).includes(legacyName), false)
    assert.equal((await readdir(directory)).includes(invalid), true)
    const metadata = JSON.parse(await readFile(join(directory, 'currency/900313.png.meta.json'), 'utf8'))
    assert.equal(metadata.etag, 'v1')
    assert.equal('data' in metadata, false)
    assert.deepEqual((await cache.get(official)).body, png)
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers['if-none-match'], 'v1')
      return new Response(null, { status: 304 })
    }
    assert.deepEqual((await cache.get(official, true)).body, png)
    // Corrupt/missing validators never prevent serving an intact local image.
    await writeFile(join(directory, 'currency/900313.png.meta.json'), '{broken')
    assert.deepEqual((await cache.get(official)).body, png)
    assert.equal(collectionImagePath('https://cbg-yys.res.netease.com/game_res/hero/200/200.png'), 'heroes/200.png')
    assert.equal(collectionImagePath('https://cbg-yys.res.netease.com/game_res/hero/200/skin/123.png'), 'skins/200/123.png')
    assert.equal(collectionImagePath('https://cbg-yys.res.netease.com/game_res/suit/1.png'), 'suits/1.png')
    const second = 'https://cbg-yys.res.netease.com/game_res/headskin/9012361.png'
    const hash = createHash('sha256').update(second).digest('hex')
    await writeFile(join(directory, `${hash}.png`), png)
    await writeFile(join(directory, `${hash}.meta.json`), JSON.stringify({ url: second, etag: 'v2' }))
    await cache.migrateLegacy()
    assert.deepEqual(await readFile(join(directory, 'headskin/9012361.png')), png)
    assert.equal((await readdir(directory)).includes(`${hash}.png`), false)
    assert.equal((await readdir(directory)).includes(`${hash}.meta.json`), false)
    const retired = 'https://cbg-yys.res.netease.com/game_res/yaozhige/icon_shenlong_01.png'
    const retiredHash = createHash('sha256').update(retired).digest('hex')
    await writeFile(join(directory, `${retiredHash}.json`), JSON.stringify({ url: retired, data: png.toString('base64') }))
    await cache.migrateLegacy()
    assert.deepEqual(await readFile(join(directory, 'legacy/yaozhige/icon_shenlong_01.png')), png)
    assert.equal((await readdir(directory)).includes(`${retiredHash}.json`), false)
    await assert.rejects(cache.get(retired), /unapproved/)
    assert.equal(collectionImagePath('https://evil.test/game_res/currency/1.png'), undefined)
    await assert.rejects(cache.get('https://cbg-yys.res.netease.com/game_res/../secret.png'))
  } finally {
    cache.close()
    globalThis.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  }
})
