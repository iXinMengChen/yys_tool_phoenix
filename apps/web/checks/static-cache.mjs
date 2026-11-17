// Offline regression: execute the real loader with a controlled clock, storage and transport.
// node --test apps/web/checks/static-cache.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/Haolai/static-data.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const historySource = readFileSync(new URL('../src/Haolai/history.ts', import.meta.url), 'utf8')
const refreshSource = historySource.slice(historySource.indexOf('export async function getStaticRefreshAvailableAt'), historySource.indexOf('export async function saveCachedStaticData'))
const refreshCompiled = ts.transpileModule(refreshSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const day = 24 * 60 * 60 * 1000
const catalog = { heroes: { heroesById: {} }, relicSuits: { yuhun_list: [] }, serverList: [], collections: { fixture: true }, heroCatalog: {} }

function setup({ cached = null, readFails = false, writeFails = false, fetchData = async () => catalog } = {}) {
  let now = day * 10
  let record = cached
  let writes = 0
  let refreshAvailableAt = 0
  const calls = []
  const exports = {}
  const refresh = {}
  vm.runInNewContext(refreshCompiled, {
    exports: refresh,
    Date: { now: () => now },
    accessHistory: async (_mode, action) => {
      const request = { result: refreshAvailableAt }
      action(null, null, { get: () => request, put: value => { refreshAvailableAt = value } })
      request.onsuccess?.()
      return request.result
    },
  })
  vm.runInNewContext(compiled, {
    exports,
    Date: { now: () => now },
    require: id => {
      if (id === '@/api/client') return { apiClient: { get: async (path, params) => {
        calls.push({ path, refresh: params?.refresh })
        return { data: await fetchData(calls.length) }
      } } }
      assert.equal(id, './history')
      return {
        reserveStaticRefresh: refresh.reserveStaticRefresh,
        loadCachedStaticData: async () => { if (readFails) throw new Error('storage denied'); return record },
        saveCachedStaticData: async data => {
          if (writeFails) throw new Error('quota exceeded')
          writes++
          record = { data, cachedAt: now }
        },
      }
    },
  })
  return { load: exports.loadStaticData, calls, advance: ms => { now += ms }, record: () => record, writes: () => writes }
}

test('fresh full JSON cache avoids network; exactly 24h later concurrent readers fetch once', async () => {
  const state = setup({ cached: { data: catalog, cachedAt: day * 10 } })
  assert.equal(await state.load(), catalog)
  assert.equal(state.calls.length, 0)
  state.advance(day)
  const values = await Promise.all([state.load(), state.load(), state.load()])
  assert.equal(values.every(data => data === catalog), true)
  assert.equal(state.calls.length, 1)
  assert.equal(state.writes(), 1)
  assert.equal(state.record().data.collections, catalog.collections)
  assert.equal(state.record().cachedAt, day * 11)
  await state.load()
  assert.equal(state.calls.length, 1)
})

test('legacy stale cache survives offline failure; explicit refresh reports failure', async () => {
  const state = setup({ cached: { data: catalog, cachedAt: 0 }, fetchData: async () => { throw new Error('offline') } })
  assert.equal(await state.load(), catalog)
  assert.equal(state.record().cachedAt, 0)
  await assert.rejects(state.load(true), /offline/)
  await assert.rejects(state.load(true), /30 分钟/)
  assert.equal(state.calls.length, 2, 'failed manual attempts also start the cooldown')
  assert.equal(state.writes(), 0)
})

test('storage denial still allows network; failed requests can retry', async () => {
  const state = setup({ readFails: true, writeFails: true, fetchData: async count => {
    if (count === 1) throw new Error('offline')
    return catalog
  } })
  await assert.rejects(state.load(), /offline/)
  assert.equal(await state.load(), catalog)
  assert.equal(state.calls.length, 2)
})

test('forced refresh bypasses fresh cache and merges concurrent refreshes', async () => {
  const updated = { ...catalog, refreshedAt: 'updated' }
  const state = setup({ cached: { data: catalog, cachedAt: day * 10 }, fetchData: async () => updated })
  const results = await Promise.all([state.load(true), state.load(true), state.load()])
  assert.equal(results.every(data => data === updated), true)
  assert.equal(state.calls.length, 1)
  assert.equal(state.calls[0].refresh, true)
  assert.equal(state.record().data, updated)
  await assert.rejects(state.load(true), /30 分钟/)
  assert.equal(state.calls.length, 1)
  state.advance(30 * 60 * 1000 - 1)
  await assert.rejects(state.load(true), /30 分钟/)
  state.advance(1)
  assert.equal(await state.load(true), updated)
  assert.equal(state.calls.length, 2)
})

test('force during an ordinary fetch runs once afterwards and persists the newer response', async () => {
  let release
  const first = new Promise(resolve => { release = resolve })
  const updated = { ...catalog, refreshedAt: 'updated' }
  const state = setup({ fetchData: async count => count === 1 ? first : updated })
  const initial = state.load()
  const forced = state.load(true)
  const duplicate = state.load(true)
  release(catalog)
  assert.equal(await initial, catalog)
  assert.equal(await forced, updated)
  assert.equal(await duplicate, updated)
  assert.equal(state.calls.length, 2)
  assert.equal(state.calls[1].refresh, true)
  assert.equal(state.record().data, updated)
})
