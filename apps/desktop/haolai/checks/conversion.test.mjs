import assert from 'node:assert/strict'
import test from 'node:test'
import { convertCbgPayloadToDataset as convertShared } from '@phoenix/utils'
import { convertCbgPayloadToDataset, getStageAttributeHitCount } from '../src/lib/relics.ts'

const config = { two_suit_yuhun: {}, collection_skin_data: { 123: '典藏' } }
const detail = {
  name: '本地样例', lv: '60', goyu: '1200', gameble_card: '2', ar_gamble_card: '1',
  damo_count_dict: { bag: { 411: '3' } },
  skin: { ss: [[0, 0, 123], [0, 0, 456]] },
  heroes: { a: { heroId: 200, lv: '40', selectSkills: [1], skinfo: [[1, 5]] } },
  inventory: { a: {
    uuid: 'r1', pos: 2, suitid: 1001, level: 15, qua: 6, name: '招财猫',
    attrs: [['速度', '57'], ['暴击', '6%']],
    rattr: [['critRateAdditionVal', 1], ['speedAdditionVal', 1], ['critRateAdditionVal', 1],
      ['speedAdditionVal', 1], ['speedAdditionVal', 1], ['speedAdditionVal', 1], ['speedAdditionVal', 1]],
  } },
}
const equip = { equip_desc: detail, price: '12345', highlights: ['散件一速 155.8', '2头3尾'] }

test('desktop uses the shared account, hero, relic and enhancement rules for raw local payloads', () => {
  const actual = convertCbgPayloadToDataset({ equip_data: { ...equip, equip_desc: JSON.stringify(detail) } }, config)
  const expected = convertShared({ equip }, config, { includeEnhancementStages: true })
  assert.deepEqual(actual.heroes, expected.heroes)
  assert.deepEqual(actual.relicsByPosition, expected.relicsByPosition)
  assert.deepEqual(actual.account, { ...expected.account, collectionSkinCount: 1 })
  assert.equal(actual.account.price, 123.45)
  assert.equal(actual.account.yuxingDama, 3)
  assert.equal(actual.heroes[0].level, 40)
  const relic = actual.relicsByPosition['2'][0]
  const withStages = { ...relic, detail: { ...relic.detail, enhancementStages: [
    { level: 0, available: true, upgrade: null, attributes: [] },
    { level: 3, available: true, upgrade: { key: 'speedAdditionVal', label: '速度', increase: 3, isNew: false }, attributes: [] },
    { level: 6, available: true, upgrade: { key: 'speedAdditionVal', label: '速度', increase: 3, isNew: false }, attributes: [] },
  ] } }
  assert.equal(getStageAttributeHitCount(withStages, { key: 'speedAdditionVal', label: '速度', value: 6, values: [3, 3] }, 1), 1)
})

test('accountOnly skips inventory conversion but retains inventory count and account metadata', () => {
  const actual = convertCbgPayloadToDataset({ equip }, config, { accountOnly: true })
  assert.deepEqual(actual.relicsByPosition, {})
  assert.equal(actual.account.relicSummary, 1)
  assert.equal(actual.account.collectionSkinCount, 1)
  assert.equal(actual.heroes.length, 1)
})

test('local conversion rejects malformed upstream descriptions', () => {
  for (const equip_desc of ['{', '[]', 'null', []]) {
    assert.throws(() => convertCbgPayloadToDataset({ equip: { equip_desc } }, config))
  }
})
