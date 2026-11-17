import assert from 'node:assert/strict'
import test from 'node:test'
import type { CbgCollectionSection } from '@phoenix/types'
import { filterCollectionItems } from '@phoenix/ui/lib/collectionSearch'

const items = [
  { id: 1001, name: '月下花', owned: true, description: '夏日限定' },
  { id: 1002, name: '冬雪', owned: true },
  { id: 1003, name: '春樱', owned: true },
]
const section: CbgCollectionSection = { kind: 'skins', label: '其他皮肤', available: true, catalogAvailable: true, ownedCount: items.length, items }
const owned = { heroSkinPairs: [{ skinId: 1001, heroId: 219 }, { skinId: 1002, heroId: 219 }, { skinId: 1003, heroId: 220 }, { skinId: 9999, heroId: 219 }] }
const heroes = { '219': { id: 219, name: '酒吞童子', rarityCode: 4, slug: 'jiutun' }, '220': { id: 220, name: '茨木童子', rarityCode: 4, slug: 'cimu' } }
const search = (query: string) => filterCollectionItems(section, query, owned, heroes).map(item => item.id)

test('其他皮肤按式神名筛选，仅保留当前账号已展示的皮肤', () => {
  assert.deepEqual(search(' 酒吞 '), [1001, 1002])
  assert.deepEqual(search('童子'), [1001, 1002, 1003])
  assert.deepEqual(search('茨木童子'), [1003])
  assert.deepEqual(search('不存在'), [])
  assert.deepEqual(search('月下'), [1001])
  assert.deepEqual(search('夏日'), [1001])
  assert.deepEqual(search('  '), [1001, 1002, 1003])
})

test('缺少旧历史配对或式神目录时仍可搜皮肤名；其他分类不按皮肤配对匹配', () => {
  assert.equal(filterCollectionItems(section, '月下', undefined, undefined).length, 1)
  assert.equal(filterCollectionItems(section, '酒吞', undefined, heroes).length, 0)
  assert.equal(filterCollectionItems(section, '酒吞', owned, undefined).length, 0)
  assert.equal(filterCollectionItems({ ...section, kind: 'frames' }, '酒吞', owned, heroes).length, 0)
  assert.equal(filterCollectionItems({ ...section, kind: 'premiumSkins' }, '酒吞', owned, heroes).length, 2)
})
