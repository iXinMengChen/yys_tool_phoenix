import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'
import { getCollectionSections } from '@phoenix/utils'
import { assetUrl } from '../src/lib/assetUrl.ts'

test('local frames and honors keep catalog names and lazy artwork URLs without prefetching', async () => {
  const config = {
    hero_list: [[200, '测试式神', 3, 'test']],
    yuhun_list: [[1, '测试御魂', '', '', '']], two_suit_yuhun: {},
    head_skin_list: { 101: { name: '测试头像框' } },
    honor_list: { 900401: { name: '测试徽章' }, 951018: { name: '应援·高级' } },
  }
  const desktop = {
    readStaticData: async endpoint => endpoint === '/static/game-config' ? config : [{ id: '1', name: '区组', servers: [{ id: '1', name: '区服' }] }],
    updateStaticAssets: async () => { assert.fail('catalog loading must not prefetch artwork') },
  }
  function load(path, dependencies) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}
    vm.runInNewContext(compiled, { exports, window: { desktop }, require: id => {
      assert.ok(id in dependencies, `unexpected dependency: ${id}`)
      return dependencies[id]
    } })
    return exports
  }
  const { readLocalStatic } = load('../src/features/account/localStatic.ts', {
    zod: { z }, '../../lib/assetUrl': { assetUrl },
    '../../lib/staticApi': {
      loadHeroPanels: async () => ({ heroesById: {} }),
      loadRelicSuits: async () => ({ yuhun_list: config.yuhun_list }),
    },
  })
  const data = await readLocalStatic()
  const sections = getCollectionSections({ frames: [101], honors: [900401] }, data.collections)
  for (const [kind, expected] of [['frames', 'headskin/101.png'], ['honors', 'badge/900401.png']]) {
    const item = sections.find(section => section.kind === kind).items[0]
    assert.equal(item.imageUrl, `/cbg/images/${expected}`)
    assert.equal(assetUrl(expected), `/haolai/${expected}`)
  }
  const cheering = getCollectionSections({ honors: [951018], honorDojoIds: { 951018: 269 } }, data.collections)
    .find(section => section.kind === 'honors').items[0]
  assert.equal(cheering.imageUrl, '/cbg/images/badge/951018.png')
  assert.equal(cheering.overlayImageUrl, '/cbg/images/yingyuan/269.png')
  assert.equal(assetUrl('yingyuan/269.png'), '/haolai/yingyuan/269.png')
})
