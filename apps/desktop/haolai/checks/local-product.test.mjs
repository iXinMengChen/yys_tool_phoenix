import assert from 'node:assert/strict'
import test from 'node:test'
import { convertCbgPayloadToDataset, getCollectionSections } from '@phoenix/utils'
import { localProduct } from '../src/features/account/localProduct.ts'

const url = 'https://yys.cbg.163.com/cgi/mweb/equip/1/TEST?view_loc=search'
const detail = {
  name: '本地测试', inventory: {},
  skin: { ss: [[200, 'SP皮肤', 1001, true], [201, '典藏皮肤', 1002, false], [202, '普通皮肤', 1003]], yys: [], guard: [] },
  head_skin: { 12: { private: true } }, secret: 'discard',
  honors: [951018, 951019, 951020, 951021],
  honors_detail: { 951018: { dojo_id: '269', hero_id: 347 }, 951019: { hero_id: 347 }, 951020: { support_id: 200 }, 951021: { dojo_id: '../invalid', private: 'strip' }, 999: { dojo_id: 123 } },
}

test('normalizes local raw string/equip_data into the shared worker contract without private fields', () => {
  const result = localProduct(JSON.stringify({ equip_data: { equip_desc: JSON.stringify(detail), price: '12300', secret: 'discard' } }), url)
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.channel, 'official')
  assert.equal(result.sourceUrl, url.split('?')[0])
  assert.deepEqual(result.equip.equip_desc.collections.heroSkins, [1001, 1002, 1003])
  assert.deepEqual(result.equip.equip_desc.collections.frames, [12])
  assert.deepEqual(result.equip.equip_desc.collections.honorDojoIds, { 951018: 269, 951019: 347, 951020: 200 })
  assert.equal('honors_detail' in result.equip.equip_desc, false)
  assert.deepEqual(result.equip.equip_desc.collections.heroSkinPairs, [{ skinId: 1001, heroId: 200 }, { skinId: 1002, heroId: 201 }, { skinId: 1003, heroId: 202 }])
  assert.equal('secret' in result.equip, false)
  assert.equal('secret' in result.equip.equip_desc, false)
  assert.equal('skin' in result.equip.equip_desc, false)
  const dataset = convertCbgPayloadToDataset(result, { two_suit_yuhun: {} }, { includeEnhancementStages: false })
  assert.equal(dataset.account.name, '本地测试')
  assert.equal(dataset.account.price, 123)
  const sections = getCollectionSections(dataset.collections, {
    premiumSkins: { 1002: { name: '典藏皮肤' }, 1004: { name: '未拥有典藏' } },
    skins: { 1001: { name: 'SP皮肤' }, 1002: { name: '典藏皮肤' }, 1003: { name: '普通皮肤' } },
  })
  const premium = sections.find(section => section.kind === 'premiumSkins')
  assert.equal(premium.ownedCount, 1)
  assert.deepEqual(premium.items.map(item => item.id), [1002])
  assert.equal(premium.items[0].imageUrl, '/cbg/images/skins/201/1002.png')
  assert.deepEqual(sections.find(section => section.kind === 'skins').items.map(item => item.id), [1001, 1003])
})

test('accepts object descriptions and rejects malformed local input and unsupported URLs', () => {
  assert.equal(localProduct({ equip: { equip_desc: detail } }, url).equip.equip_desc.name, '本地测试')
  for (const payload of [null, {}, { equip: { equip_desc: 'not JSON' } }, { equip: { equip_desc: { inventory: { bad: { pos: 'bad', suitid: 1 } } } } }]) {
    assert.throws(() => localProduct(payload, url))
  }
  assert.throws(() => localProduct({ equip: { equip_desc: detail } }, 'https://example.com/product/1'))
})
