import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { HeroBaseStats, RelicDataset, RelicView } from '@phoenix/types'
import {
  analyzeAccountValue,
  buildAccountSummary,
  calculateIndependentSpeed,
  calculateMetricValue,
  calculatePveDamageSummary,
  calculateRelicCombinationsForRequest,
  calculateRelicPanel,
  convertCbgPayloadToDataset,
  createRelicSuitConfig,
  getBestSpeedCombinationForSuit,
  getPveSuitScoreRanking,
  parseIndependentSpeedPresets,
  parseProductUrl,
  scorePveRelic,
} from '../src/index.ts'

const baseStats: HeroBaseStats = {
  attack: 1000, health: 10000, defense: 500, speed: 100,
  critRate: 10, critDamage: 150, effectHit: 0, effectResistance: 0,
}

function relic(position: number, variant = 0): RelicView {
  return {
    id: `${position}-${variant}`, position, level: 15, quality: 6,
    suit: { id: 1, name: '招财猫', twoPieceAttribute: '防御加成30%' },
    mainAttribute: {
      label: position === 2 ? '速度' : position === 6 ? '暴击伤害' : position === 4 ? '攻击加成' : '攻击',
      value: position === 2 ? 57 : 0,
      isPercent: position === 4 || position === 6,
    },
    subAttributes: [{ label: '速度', value: 18 - variant, isPercent: false }],
  }
}

function dataset(variants = 2): RelicDataset {
  return {
    relicsByPosition: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map(position => [String(position), Array.from({ length: variants }, (_, v) => relic(position, v))]),
    ),
  }
}

test('supported product URL parsing normalizes HTTPS and rejects unrelated hosts', () => {
  const result = parseProductUrl(' http://yys.cbg.163.com/equip/123/abc?view_loc=search&tfid=x&tcid=y ')
  assert.deepEqual(result, {
    serverid: '123', ordersn: 'abc', channel: 'official', viewLoc: 'search', tfid: 'x', tcid: 'y',
    sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/123/abc?view_loc=search&tfid=x&tcid=y',
  })
  assert.throws(() => parseProductUrl('https://example.com/equip/1/x'))
  assert.throws(() => parseProductUrl('not a URL'))
  assert.throws(() => parseProductUrl('https://yys.cbg.163.com/'))
})

test('real mobile product links and desktop aliases canonicalize for every supported channel', () => {
  for (const [host, channel] of [
    ['yys.cbg.163.com', 'official'],
    ['cbg.163.com', 'official'],
    ['yys-huawei.cbg.163.com', 'huawei'],
    ['yys-oppo.cbg.163.com', 'oppo'],
    ['yys-vivo.cbg.163.com', 'vivo'],
    ['yys-xiaomi.cbg.163.com', 'xiaomi'],
  ]) {
    const canonicalHost = host === 'cbg.163.com' ? 'yys.cbg.163.com' : host
    for (const path of ['/cgi/mweb/equip', '/equip']) {
      const result = parseProductUrl(`https://${host}${path}/123/20260101_abc-123/?view_loc=search&sid=synthetic-secret#synthetic-secret`)
      assert.equal(result.serverid, '123')
      assert.equal(result.ordersn, '20260101_abc-123')
      assert.equal(result.channel, channel)
      assert.equal(result.sourceUrl, `https://${canonicalHost}/cgi/mweb/equip/123/20260101_abc-123?view_loc=search`)
    }
  }
  for (const path of ['/mweb/equip', '/other/cgi/mweb/equip', '/cgi/mweb/equip/123/20260101_abc-123/extra']) {
    const suffix = path.includes('/123/') ? '' : '/123/20260101_abc-123'
    assert.throws(() => parseProductUrl(`https://yys.cbg.163.com${path}${suffix}`))
  }
})

test('product URLs canonicalize only allowed paths and bounded public query parameters', () => {
  const safe = parseProductUrl('http://cbg.163.com:80/equip/123/%61bc-_/?sid=synthetic-secret&cookie=synthetic-secret&view_loc=search&tfid=x&tcid=y#synthetic-secret')
  assert.equal(safe.ordersn, 'abc-_')
  assert.equal(safe.sourceUrl, 'https://yys.cbg.163.com/cgi/mweb/equip/123/abc-_?view_loc=search&tfid=x&tcid=y')
  assert.ok(!JSON.stringify(safe).includes('synthetic-secret'))
  assert.equal(parseProductUrl('https://yys-huawei.cbg.163.com:443/equip/1/a').sourceUrl, 'https://yys-huawei.cbg.163.com/cgi/mweb/equip/1/a')
  assert.equal(parseProductUrl(`https://yys.cbg.163.com/equip/${'1'.repeat(20)}/${'a'.repeat(128)}?view_loc=${'v'.repeat(2048)}&tfid=${'t'.repeat(128)}&tcid=${'c'.repeat(128)}`).ordersn.length, 128)
  for (const input of [
    'https://user:synthetic-secret@yys.cbg.163.com/equip/1/a',
    'https://user@yys.cbg.163.com/equip/1/a',
    'ftp://yys.cbg.163.com/equip/1/a',
    'https://yys.cbg.163.com:444/equip/1/a',
    'http://yys.cbg.163.com:443/equip/1/a',
    'https://constructor/equip/1/a',
    'https://__proto__/equip/1/a',
    'https://yys.cbg.163.com.evil.invalid/equip/1/a',
    'https://yys.cbg.163.com/other/equip/1/a',
    'https://yys.cbg.163.com/equip/1/a/extra',
    `https://yys.cbg.163.com/equip/${'1'.repeat(21)}/a`,
    `https://yys.cbg.163.com/equip/1/${'a'.repeat(129)}`,
    'https://yys.cbg.163.com/equip/1/a%2Fb',
    'https://yys.cbg.163.com/equip/1/a%0A',
    'https://yys.cbg.163.com/equip/1/%ZZ',
    'https://yys.cbg.163.com/equip/1/%E0%A4',
    'https://yys.cbg.163.com/equip/1/a?view_loc=a%0Ab',
    'https://yys.cbg.163.com/equip/1/a?view_loc=a%0Db',
    `https://yys.cbg.163.com/equip/1/a?view_loc=${'x'.repeat(2049)}`,
    `https://yys.cbg.163.com/equip/1/a?tfid=${'x'.repeat(129)}`,
    `https://yys.cbg.163.com/equip/1/a?tcid=${'x'.repeat(129)}`,
    'https://yys.cbg.163.com/equip/1/a?tfid=a%26sid%3Dsecret',
    'https://yys.cbg.163.com/equip/1/a?tcid=a%0A',
    'https://yys.cbg.163.com/equip/1/a?tfid=a&tfid=b',
  ]) {
    assert.throws(() => parseProductUrl(input))
  }
})

test('converter preserves heroes, suit indexes, precise growth and resource semantics', () => {
  const config = createRelicSuitConfig({
    yuhun_list: [[1, '招财猫', 'lucky', '防御加成30%']], two_suit_yuhun: {},
  })
  const detail = {
    name: '测试', lv: 60, goyu: 1200, gameble_card: 2, ar_gamble_card: 1,
    damo_count_dict: { normal: { 411: 3 } },
    hero_history: { ssr: { all: 3, got: 1, 1: ['a', 1], 2: ['b', 0], 3: ['c', 0] } },
    heroes: {
      a: { heroId: 100, heroUid: 'a', name: '测试式神', lv: '40', selectSkills: [3, 1], skinfo: [[1, 5], [3, 4]] },
      spirit: { heroId: 900, name: '御灵', level: 40, skinfo: [[1, 1]] },
    },
    inventory: { a: {
      uuid: 'r1', level: 15, qua: 6, pos: 2, suitid: 1, name: '招财猫',
      attrs: [['速度', '57'], ['暴击', '3%']], rattr: [['speedAdditionVal', 0.99]],
    } },
  }
  const payload = { equip: { equip_desc: JSON.stringify(detail), price: 12345, highlights: '散件一速 150.25 2头3尾' } }
  const result = convertCbgPayloadToDataset(payload, config)
  assert.equal(result.account?.price, 123.45)
  assert.equal(result.account?.summonPower, 16)
  assert.equal(result.account?.yuxingDama, 3)
  assert.deepEqual(result.account?.shikigamiDex?.ssr, { owned: 1, total: 1 })
  assert.equal(result.heroes?.length, 1)
  assert.equal(result.heroes?.[0].level, 40)
  assert.deepEqual(result.heroes?.[0].skillLevels, [4, 5])
  assert.equal(result.relicsByPosition['2'][0].suit?.twoPieceAttribute, '防御加成30%')
  assert.ok(Math.abs((result.relicsByPosition['2'][0].enhancement?.totals?.[0].total ?? 0) - 2.97) < 1e-12)
  assert.equal(result.relicsByPosition['2'][0].mainAttribute?.value, 57)
  const lean = convertCbgPayloadToDataset(payload, config, { includeEnhancementStages: false })
  assert.equal(lean.relicsByPosition['2'][0].detail?.enhancementStages, undefined)
  assert.throws(() => convertCbgPayloadToDataset({}, config))
})

test('four-piece speed excludes base/main speed and honors main-attribute restrictions', () => {
  const data = dataset()
  const result = getBestSpeedCombinationForSuit(data, '招财猫')
  assert.equal(result?.value, 108)
  assert.equal(result?.relics.length, 6)
  assert.equal(getBestSpeedCombinationForSuit(data, '招财猫', { fourthMainAttributes: ['效果命中'] }), null)
  assert.equal(analyzeAccountValue(data).relics.totalRelics, 12)
})

test('independent speed allocation is sequential and never reuses relic IDs', () => {
  const results = calculateIndependentSpeed(dataset(), ['first', 'second', 'third'].map(id => ({
    id, suitName: '招财猫', fourthMainAttributes: [], sixthMainAttributes: [],
  })))
  assert.equal(results[0].combination?.value, 108)
  assert.equal(results[1].combination?.value, 102)
  assert.equal(results[2].combination, null)
  const ids = results.flatMap(r => r.combination?.relics.map(item => item.relicId) ?? [])
  assert.equal(new Set(ids).size, 12)
})

test('PVE scoring counts effective rolls and output oma bonuses, rejects invalid mains', () => {
  const item: RelicView = {
    ...relic(1), suit: { id: 2, name: '狂骨' },
    enhancement: { totals: [{ key: 'attackAdditionRate', label: '攻击加成', count: 5, total: 15 }] },
  }
  assert.equal(scorePveRelic(item)?.effectiveCount, 5)
  assert.equal(scorePveRelic({ ...item, setBonusAttribute: { label: '暴击', value: 8, isPercent: true } })?.maximumEffectiveCount, 11)
  assert.equal(scorePveRelic({ ...item, level: 14 }), null)
  assert.equal(scorePveRelic({ ...item, position: 2 }), null)
  const ranked = getPveSuitScoreRanking({ relicsByPosition: { 1: [item] } })
  assert.deepEqual(ranked, [{ suitName: '狂骨', totalScore: 5, relicCount: 1, isOma: false }])
})

test('panel calculation shares two-piece, percent/flat, extra attribute and critical cap rules', () => {
  const pair: RelicView[] = [1, 2].map(position => ({
    id: String(position), position, suit: { id: 2, name: '狂骨', twoPieceAttribute: '攻击加成15%' },
    mainAttribute: { label: '攻击加成', value: 55, isPercent: true },
    subAttributes: [{ label: '攻击', value: 100, isPercent: false }],
  }))
  const panel = calculateRelicPanel({ baseStats, relics: pair, suitTwoPieceAttributes: new Map([['狂骨', '攻击加成15%']]), extraAttributes: { attackPercent: 10, critRate: 100 } })
  assert.equal(panel.attack, 2550)
  assert.equal(panel.critRate, 110)
  assert.equal(calculateMetricValue(panel, 'damage'), panel.attack * 1.5)
  assert.equal(calculateRelicPanel({ baseStats, relics: [] }).attack, 1000)
})

test('general and fixed-suit calculator searches return exact six-slot winners for small inventory', () => {
  const data = dataset()
  for (const requiredFourPiece of [undefined, '招财猫']) {
    const before = structuredClone(data)
    const progress: string[] = []
    const results = calculateRelicCombinationsForRequest({
      ...data, baseStats, metric: 'speed', resultLimit: 3,
      filters: { quality: 6, level: 15, mainAttributes: {}, requiredFourPiece },
    }, value => { if (value.stage) progress.push(value.stage) })
    assert.equal(results[0]?.panel.speed, 265)
    assert.equal(results[0]?.relics.length, 6)
    // 固定套搜索会裁掉支配候选；resultLimit 是上限，不保证填满。
    assert.ok(results.length >= 1 && results.length <= 3)
    assert.equal(new Set(results[0].relics.map(item => item.position)).size, 6)
    assert.deepEqual(data, before)
    assert.ok(progress.every(stage => ['preparing', 'matching', 'validating', 'ranking'].includes(stage)))
  }
})

test('fast calculator returns the constrained first-place result with exclusions in both suit modes', () => {
  for (const requiredFourPiece of [undefined, '招财猫']) {
    const request = {
      ...dataset(), baseStats, metric: 'speed' as const, resultLimit: 3,
      filters: {
        quality: 6, level: 15, mainAttributes: {}, requiredFourPiece,
        panelConstraints: { speed: { min: 264, max: 264 } }, excludedRelicIds: new Set(['1-0']),
      },
    }
    const normal = calculateRelicCombinationsForRequest(request)
    const fast = calculateRelicCombinationsForRequest({ ...request, resultLimit: 1, filters: { ...request.filters, fastMode: true } })
    assert.equal(fast.length, 1)
    assert.equal(fast[0].panel.speed, 264)
    assert.equal(fast[0].score, normal[0].score)
    assert.equal(new Set(fast[0].relics.map(item => item.position)).size, 6)
    assert.ok(fast[0].relics.every(item => item.id !== '1-0'))
  }
})

test('fixed-suit damage search matches exhaustive enumeration of a mixed-suit inventory', () => {
  const data = dataset()
  for (const [position, items] of Object.entries(data.relicsByPosition)) {
    items.forEach((item, variant) => {
      item.suit = { id: variant + 1, name: variant === 0 ? '狂骨' : '荒骷髅' }
      item.subAttributes = [
        { label: '攻击加成', value: variant === 0 ? 4 + Number(position) : 14 - Number(position), isPercent: true },
        { label: '暴击', value: variant === 0 ? 12 : 15, isPercent: true },
        { label: '暴击伤害', value: variant === 0 ? 8 : 5, isPercent: true },
      ]
    })
  }
  const suits = new Map([['狂骨', '攻击加成15%']])
  let expected = -Infinity
  for (let mask = 0; mask < 64; mask++) {
    const chosen = [1, 2, 3, 4, 5, 6].map((position, i) => data.relicsByPosition[String(position)][(mask >> i) & 1])
    if (chosen.filter(item => item.suit?.name === '狂骨').length < 4) continue
    const panel = calculateRelicPanel({ baseStats, relics: chosen, suitTwoPieceAttributes: suits })
    // 原算法的“伤害指标”为攻击×暴伤；满暴由单独的面板约束保证。
    expected = Math.max(expected, panel.attack * panel.critDamage / 100)
  }
  const results = calculateRelicCombinationsForRequest({
    ...data, baseStats, metric: 'damage', resultLimit: 1,
    filters: { quality: 6, level: 15, mainAttributes: {}, requiredFourPiece: '狂骨', suitTwoPieceAttributes: suits },
  })
  assert.ok(Math.abs(results[0].score - expected) < 1e-8)
})

test('calculator rejects impossible constraints and honors exclusions', () => {
  const data = dataset()
  const request = {
    ...data, baseStats, metric: 'speed' as const,
    filters: { quality: 6, level: 15, mainAttributes: {}, panelConstraints: { speed: { min: 999 } } },
  }
  assert.deepEqual(calculateRelicCombinationsForRequest(request), [])
  const results = calculateRelicCombinationsForRequest({
    ...request, filters: { ...request.filters, panelConstraints: {}, excludedRelicIds: new Set(['1-0']) },
  })
  assert.equal(results[0]?.panel.speed, 264)
  assert.ok(results.every(result => !result.relics.some(item => item.id === '1-0')))
})

test('preset parsers reject malformed boundary input without storage access', () => {
  assert.deepEqual(parseIndependentSpeedPresets('bad json'), [])
})

test('account summary and injected static hero data do not require browser APIs', () => {
  const data = dataset(1)
  assert.match(buildAccountSummary(data), /御魂：6 件/)
  assert.match(buildAccountSummary(data, '狂骨 123'), /狂骨 123/)
  assert.equal(calculatePveDamageSummary(data, { heroesById: {} }), '')
})

test('Node 24 CommonJS loads the package public export via real file dependency', () => {
  const require = createRequire(import.meta.url)
  const shared = require('@phoenix/utils')
  assert.equal(typeof shared.convertCbgPayloadToDataset, 'function')
  assert.equal(shared.parseProductUrl('https://yys.cbg.163.com/equip/1/x').serverid, '1')
  assert.equal(typeof shared.calculateRelicCombinationsForRequest, 'function')
})
