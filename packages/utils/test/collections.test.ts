import assert from 'node:assert/strict'
import test from 'node:test'
import { getCollectionSections } from '../src/collections.ts'
import { convertCbgPayloadToDataset } from '../src/relics.ts'

const catalog = { skins: { 1: { name: '典藏目录重复项' }, 2: { name: '其他皮肤' }, 3: { name: '阴阳师皮肤' } }, premiumSkins: { 1: { name: '典藏' }, 4: { name: '未拥有典藏' } }, yards: { 10: { name: '庭院' } }, honors: { 951018: { name: '应援 · 高级', imageUrl: '/cbg/images/badge/951018.png' }, 900401: { name: '普通徽章', imageUrl: '/cbg/images/badge/900401.png' } }, spiritSkins: { 419003: { name: '旧版曜之阁目录' } }, skinBlacklist: [1] }

test('目录不代表持有；皮肤使用明确分类，典藏重叠项不重复展示', () => {
  const old = getCollectionSections(undefined, catalog)
  assert.equal(old.find(s => s.kind === 'yards')?.ownedCount, null)
  assert.equal(old.find(s => s.kind === 'heroRooms')?.label, '幕间')
  assert.ok(old.every(section => section.items.length === 0))
  const sections = getCollectionSections({ heroSkins: [1, 1, 9], skins: [1, 2, 3, 9], otherSkins: [1, 2, 9], onmyojiSkins: [3], heroSkinPairs: [{ heroId: 200, skinId: 1 }, { heroId: 200, skinId: 2 }, { heroId: 10, skinId: 3 }], yards: [], spiritSkins: [419012], honors: [951018, 900401], honorDojoIds: { 951018: 269 } }, catalog)
  assert.equal(sections.find(s => s.kind === 'premiumSkins')?.ownedCount, 1)
  assert.deepEqual(sections.find(s => s.kind === 'premiumSkins')?.items.map(item => item.id), [1])
  assert.deepEqual(sections.find(s => s.kind === 'skins')?.items.map(item => item.id), [2])
  assert.deepEqual(sections.find(s => s.kind === 'onmyojiSkins')?.items.map(item => item.id), [3])
  assert.deepEqual(sections.find(s => s.kind === 'yards')?.items, [])
  assert.ok(sections.every(section => section.items.every(item => item.owned === true)))
  assert.equal(sections.find(s => s.kind === 'premiumSkins')?.items[0]?.imageUrl, '/cbg/images/skins/200/1.png')
  assert.equal(sections.find(s => s.kind === 'skins')?.items[0]?.imageUrl, '/cbg/images/skins/200/2.png')
  assert.equal(sections.find(s => s.kind === 'onmyojiSkins')?.items[0]?.imageUrl, '/cbg/images/skins/10/3.png')
  assert.equal(sections.find(s => s.kind === 'skins')?.ownedCount, 1)
  assert.equal(sections.find(s => s.kind === 'yards')?.ownedCount, 0)
  const honors = sections.find(s => s.kind === 'honors')?.items
  assert.equal(honors?.find(item => item.id === 951018)?.overlayImageUrl, '/cbg/images/yingyuan/269.png')
  assert.equal(honors?.find(item => item.id === 900401)?.overlayImageUrl, undefined)
  for (const kind of ['specialSkins', 'specialSkins2', 'achievements', 'spiritSkins', 'qiling']) assert.equal(sections.some(s => s.kind === kind), false)
})

test('legacy skin union does not reveal unclassified guardian ownership', () => {
  const sections = getCollectionSections({ skins: [1, 2, 3, 419012], spiritSkins: [419012] }, catalog)
  assert.equal(sections.find(s => s.kind === 'skins')?.available, false)
  assert.equal(sections.find(s => s.kind === 'onmyojiSkins')?.available, false)
  assert.deepEqual(sections.find(s => s.kind === 'skins')?.items, [])
  assert.deepEqual(sections.find(s => s.kind === 'onmyojiSkins')?.items, [])
})

test('旧历史用完整皮肤分组恢复阴阳师和其他皮肤，明确的新字段优先', () => {
  const owned = { heroSkins: [1, 2, 2, 9], skins: [1, 2, 3, 9, 419012], spiritSkins: [419012], heroSkinPairs: [{ heroId: 200, skinId: 2 }, { heroId: 10, skinId: 3 }] }
  const sections = getCollectionSections(owned, catalog)
  assert.equal(sections.find(s => s.kind === 'skins')?.ownedCount, 1)
  assert.equal(sections.find(s => s.kind === 'onmyojiSkins')?.ownedCount, 1)
  assert.deepEqual(sections.find(s => s.kind === 'skins')?.items.map(item => item.id), [2])
  assert.deepEqual(sections.find(s => s.kind === 'onmyojiSkins')?.items.map(item => item.id), [3])
  assert.equal(sections.find(s => s.kind === 'skins')?.items[0]?.imageUrl, '/cbg/images/skins/200/2.png')
  assert.equal(sections.find(s => s.kind === 'onmyojiSkins')?.items[0]?.imageUrl, '/cbg/images/skins/10/3.png')
  const explicit = getCollectionSections({ ...owned, otherSkins: [], onmyojiSkins: [] }, catalog)
  assert.equal(explicit.find(s => s.kind === 'skins')?.ownedCount, 0)
  assert.equal(explicit.find(s => s.kind === 'onmyojiSkins')?.ownedCount, 0)
  const incomplete = getCollectionSections({ heroSkins: [1, 2], skins: [1, 2, 3] }, catalog)
  assert.equal(incomplete.find(s => s.kind === 'skins')?.ownedCount, 1)
  assert.equal(incomplete.find(s => s.kind === 'onmyojiSkins')?.ownedCount, null)
  const empty = getCollectionSections({ heroSkins: [], skins: [], spiritSkins: [] }, catalog)
  assert.equal(empty.find(s => s.kind === 'onmyojiSkins')?.ownedCount, 0)
})

test('user-provided official skin pairs build skin image routes without IDs in names', () => {
  const entries = { '410105': { name: '官方阴阳师皮肤' }, '412001': { name: '官方其他皮肤' } }
  const sections = getCollectionSections({ onmyojiSkins: [410105], otherSkins: [412001], heroSkinPairs: [{ heroId: 10, skinId: 410105 }, { heroId: 200, skinId: 412001 }] }, { skins: entries })
  assert.deepEqual(sections.find(s => s.kind === 'onmyojiSkins')?.items[0], { id: 410105, name: '官方阴阳师皮肤', owned: true, imageUrl: '/cbg/images/skins/10/410105.png' })
  assert.deepEqual(sections.find(s => s.kind === 'skins')?.items[0], { id: 412001, name: '官方其他皮肤', owned: true, imageUrl: '/cbg/images/skins/200/412001.png' })
})

test('旧历史没有角色配对时沿用目录的阴阳师图片，明确配对仍优先', () => {
  const entries = { skins: { 410103: { name: '金月暗羽', imageUrl: '/cbg/images/skins/410103.png' } } }
  const owned = { heroSkins: [], skins: [410103], spiritSkins: [] }
  const item = getCollectionSections(owned, entries).find(s => s.kind === 'onmyojiSkins')?.items[0]
  assert.equal(item?.imageUrl, '/cbg/images/skins/410103.png')
  const paired = getCollectionSections({ ...owned, heroSkinPairs: [{ heroId: 10, skinId: 410103 }] }, entries)
  assert.equal(paired.find(s => s.kind === 'onmyojiSkins')?.items[0]?.imageUrl, '/cbg/images/skins/10/410103.png')
})

test('目录未载入时不能把典藏显示为0；独立ID持有仍可显示', () => {
  const sections = getCollectionSections({ heroSkins: [1], yards: [10] }, undefined)
  assert.equal(sections.find(s => s.kind === 'premiumSkins')?.ownedCount, null)
  assert.equal(sections.find(s => s.kind === 'yards')?.ownedCount, 1)
})

test('Worker使用的转换器将收藏ID传到分析数据，兼容旧历史', () => {
  const collections = { heroSkins: [1], yards: [10], spiritSkins: [419012], heroSkinPairs: [{ heroId: 901, skinId: 419012 }] }
  assert.deepEqual(convertCbgPayloadToDataset({ equip: { equip_desc: { collections } } }, {}).collections, collections)
  assert.equal(convertCbgPayloadToDataset({ equip: { equip_desc: {} } }, {}).collections, undefined)
})
