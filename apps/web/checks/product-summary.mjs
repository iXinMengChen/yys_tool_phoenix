// Offline regression: real upload module, controlled transport, clock and browser storage.
// node --test apps/web/checks/product-summary.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/Haolai/product-summary.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const product = { channel: 'official', sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/1/ORDER_1', equip: { privateFixture: 'never-upload-raw' } }
const dataset = { account: { level: 60 }, relicsByPosition: {}, privateFixture: 'never-upload-dataset' }

function setup({ storage = new Map(), storageFails = false, post = async () => ({ data: { id: 'receipt', expiresAt: new Date(10000).toISOString() } }) } = {}) {
  let now = 1000
  let builds = 0
  const calls = []
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    Date: { now: () => now, parse: Date.parse },
    localStorage: {
      getItem: key => { if (storageFails) throw Error('denied'); return storage.get(key) ?? null },
      setItem: (key, value) => { if (storageFails) throw Error('denied'); storage.set(key, value) },
    },
    require: id => {
      if (id === '@/api/client') return { apiClient: { post: async (path, payload) => {
        calls.push({ path, payload })
        return post(calls.length)
      } } }
      assert.equal(id, '@phoenix/utils')
      return {
        buildAccountSummary: value => { assert.equal(value, dataset); builds++; return '等级：60；御魂：0 件' },
        parseProductUrl: url => { const parts = new URL(url).pathname.split('/'); return { serverid: parts.at(-2), ordersn: parts.at(-1) } },
      }
    },
  })
  return { upload: (p = product) => exports.uploadProductSummary(p, dataset), calls, builds: () => builds, storage, advance: time => { now = time } }
}

test('uploads only identity and copied text, skips successful duplicates across module reloads until receipt expiry', async () => {
  const state = setup()
  await state.upload()
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls)), [{ path: '/cbg/product-summary', payload: { channel: 'official', serverid: '1', ordersn: 'ORDER_1', summary: '等级：60；御魂：0 件' } }])
  await state.upload()
  assert.equal(state.calls.length, 1)
  assert.equal(state.builds(), 1, 'duplicates also skip summary calculation')
  const reloaded = setup({ storage: state.storage })
  await reloaded.upload()
  assert.equal(reloaded.calls.length, 0)
  reloaded.advance(10000)
  await reloaded.upload()
  assert.equal(reloaded.calls.length, 1, 'expired server summaries can be uploaded again')
})

test('concurrent reads do not duplicate an unfinished upload or wait for it', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const state = setup({ post: () => gate })
  const first = state.upload()
  await state.upload()
  assert.equal(state.calls.length, 1)
  release({ data: { id: 'receipt', expiresAt: new Date(10000).toISOString() } })
  await first
})

test('failed upload releases the pending key and is retried on the next read', async () => {
  const state = setup({ post: async count => {
    if (count === 1) throw Error('offline')
    return { data: { id: 'receipt', expiresAt: new Date(10000).toISOString() } }
  } })
  await assert.rejects(state.upload(), /offline/)
  assert.equal(state.storage.size, 0)
  await state.upload()
  await state.upload()
  assert.equal(state.calls.length, 2)
})

test('storage denial preserves upload and in-memory deduplication', async () => {
  const state = setup({ storageFails: true })
  await state.upload()
  await state.upload()
  assert.equal(state.calls.length, 1)
})

test('channel, server and order isolate deduplication keys', async () => {
  const state = setup()
  await state.upload()
  await state.upload({ ...product, channel: 'huawei' })
  await state.upload({ ...product, sourceUrl: product.sourceUrl.replace('/1/', '/2/') })
  await state.upload({ ...product, sourceUrl: product.sourceUrl.replace('ORDER_1', 'ORDER_2') })
  assert.equal(state.calls.length, 4)
})

test('missing or invalid persistence receipt never marks an upload as successful', async () => {
  for (const data of [null, {}, { id: 'receipt', expiresAt: 'invalid' }, { id: 'receipt', expiresAt: new Date(999).toISOString() }]) {
    const state = setup({ post: async () => ({ data }) })
    await state.upload()
    await state.upload()
    assert.equal(state.calls.length, 2)
    assert.equal(state.storage.size, 0)
  }
})
