import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/staticApi.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

function setup({ cached = null, offline = false } = {}) {
  const calls = []
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    window: { desktop: {
      readStaticData: async endpoint => { calls.push(['read', endpoint]); return cached },
      updateStaticData: async endpoint => {
        calls.push(['download', endpoint])
        if (offline) throw new Error('offline')
        return { yuhun_list: [[1, 'downloaded']] }
      },
    } },
    require: id => {
      calls.push(['bundled', id])
      assert.equal(id, '../data/relic-suits.json')
      return { default: { yuhun_list: [[1, 'bundled']] } }
    },
  })
  return { calls, load: exports.loadRelicSuits }
}

test('static JSON is loaded only on demand; cached reads do not download or import fallback', async () => {
  const cached = { yuhun_list: [[1, 'cached']] }
  const state = setup({ cached })
  assert.equal(state.calls.length, 0)
  assert.equal(await state.load(), cached)
  assert.equal(JSON.stringify(state.calls), '[["read","/static/relic-suits"]]')
})

test('a missing JSON downloads on first use; offline reads fall back and manual refresh reports failure', async () => {
  const state = setup()
  assert.equal((await state.load()).yuhun_list[0][1], 'downloaded')
  assert.equal(JSON.stringify(state.calls), '[["read","/static/relic-suits"],["download","/static/relic-suits"]]')
  const offline = setup({ offline: true })
  assert.equal((await offline.load()).yuhun_list[0][1], 'bundled')
  await assert.rejects(offline.load(true), /offline/)
})
