import assert from 'node:assert/strict'
import test from 'node:test'
import * as desktop from '../src/lib/accountAnalysis.ts'
import * as shared from '@phoenix/utils'

// Offline inventory: precise totals override rounded stats; ties preserve input order.
const sample = {
  account: { scatteredFirstSpeed: 165, luckyFirstSpeed: 155, pvpScore: 3900, collectionSkinCount: 60 },
  relicsByPosition: Object.fromEntries([1, 2, 3, 4, 5, 6].map((position) => [String(position),
    ['招财猫', '火灵'].map((name, index) => ({
      id: `${position}-${index}`, position, level: 15, quality: 6,
      suit: { id: index + 1, name },
      mainAttribute: { label: position === 2 ? '速度' : index ? '生命加成' : '攻击加成', value: position === 2 ? 57 : 55, isPercent: position !== 2 },
      subAttributes: [{ label: '速度', value: 99, isPercent: false }],
      enhancement: { totals: [
        { key: 'speed', label: '速度', total: index ? 30 - position : 20 + position, count: 6 },
        { key: 'critRate', label: '暴击', total: 12, count: 4 },
      ] },
    })),
  ])),
}
sample.relicsByPosition['1'].push({ ...structuredClone(sample.relicsByPosition['1'][1]), id: 'tie' })
sample.relicsByPosition['2'].push({
  id: 'non-speed-main', position: 2, quality: 6, level: 15,
  mainAttribute: { label: '攻击加成', value: 55, isPercent: true },
  subAttributes: [{ label: '速度', value: 40, isPercent: false }, { label: '攻击', value: 25, isPercent: false }],
})
sample.relicsByPosition['6'].push({ id: 'not-max', position: 6, quality: 5, level: 15, subAttributes: [{ label: '速度', value: 100, isPercent: false }] })

// Captured from the original 502-line desktop implementation before replacing it.
// Kept as offline output (not recomputed from shared code): locks every evidence field/order.
const legacy = {
  account: {
    totalScore: 71,
    maxScore: 99,
    sellingPoints: [
      {
        id: "speed",
        title: "御魂一速",
        value: 165,
        unit: "",
        score: 30,
        maxScore: 30,
        description: "直接使用藏宝阁商品 highlights 返回的散件一速。",
        evidence: []
      },
      {
        id: "luckySpeed",
        title: "招财一速",
        value: 155,
        unit: "",
        score: 20,
        maxScore: 24,
        description: "直接使用藏宝阁商品 highlights 返回的招财一速。",
        evidence: []
      },
      {
        id: "pveEffectiveRolls",
        title: "PVE 有效强化",
        value: 53,
        unit: "次",
        score: 0,
        maxScore: 20,
        description: "统计暴击、暴击伤害、攻击加成与攻击的副属性强化次数。",
        evidence: []
      },
      {
        id: "pvp",
        title: "斗技",
        value: 3900,
        unit: "分",
        score: 13,
        maxScore: 15,
        description: "按藏宝阁展示的斗技分进行分段评分。",
        evidence: []
      },
      {
        id: "collectionSkin",
        title: "典藏皮肤",
        value: 60,
        unit: "个",
        score: 8,
        maxScore: 10,
        description: "按典藏皮肤数量进行分段评分。",
        evidence: []
      }
    ],
    relics: {
      totalRelics: 15,
      maxLevelRelics: 14,
      effectiveRolls: 53,
      effectiveRelics: 14,
      bestSpeed: {
        value: 218,
        relics: [
          {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
          {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":85},
          {"relicId":"3-1","suitName":"火灵","position":3,"level":15,"quality":6,"mainAttribute":"生命加成","value":27},
          {"relicId":"4-1","suitName":"火灵","position":4,"level":15,"quality":6,"mainAttribute":"生命加成","value":26},
          {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
          {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26}
        ]
      },
      bestLuckySpeed: {
        value: 212,
        relics: [
          {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
          {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":85},
          {"relicId":"3-0","suitName":"招财猫","position":3,"level":15,"quality":6,"mainAttribute":"攻击加成","value":23},
          {"relicId":"4-0","suitName":"招财猫","position":4,"level":15,"quality":6,"mainAttribute":"攻击加成","value":24},
          {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
          {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26}
        ]
      },
      bestSpeedBySuit: {
        招财猫: {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26},
        火灵: {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
        未知御魂: {"relicId":"non-speed-main","suitName":"未知御魂","position":2,"level":15,"quality":6,"mainAttribute":"攻击加成","value":40}
      },
      speedSellerPoints: [
        {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
        {"relicId":"tie","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
        {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":28},
        {"relicId":"3-1","suitName":"火灵","position":3,"level":15,"quality":6,"mainAttribute":"生命加成","value":27},
        {"relicId":"4-1","suitName":"火灵","position":4,"level":15,"quality":6,"mainAttribute":"生命加成","value":26},
        {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26},
        {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
        {"relicId":"5-1","suitName":"火灵","position":5,"level":15,"quality":6,"mainAttribute":"生命加成","value":25},
        {"relicId":"4-0","suitName":"招财猫","position":4,"level":15,"quality":6,"mainAttribute":"攻击加成","value":24},
        {"relicId":"6-1","suitName":"火灵","position":6,"level":15,"quality":6,"mainAttribute":"生命加成","value":24},
        {"relicId":"3-0","suitName":"招财猫","position":3,"level":15,"quality":6,"mainAttribute":"攻击加成","value":23},
        {"relicId":"2-0","suitName":"招财猫","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":22},
        {"relicId":"1-0","suitName":"招财猫","position":1,"level":15,"quality":6,"mainAttribute":"攻击加成","value":21}
      ],
      fullSpeedRelics: [
        {"relicId":"1-0","suitName":"招财猫","position":1,"level":15,"quality":6,"mainAttribute":"攻击加成","value":21},
        {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
        {"relicId":"tie","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
        {"relicId":"2-0","suitName":"招财猫","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":22},
        {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":28},
        {"relicId":"3-0","suitName":"招财猫","position":3,"level":15,"quality":6,"mainAttribute":"攻击加成","value":23},
        {"relicId":"3-1","suitName":"火灵","position":3,"level":15,"quality":6,"mainAttribute":"生命加成","value":27},
        {"relicId":"4-0","suitName":"招财猫","position":4,"level":15,"quality":6,"mainAttribute":"攻击加成","value":24},
        {"relicId":"4-1","suitName":"火灵","position":4,"level":15,"quality":6,"mainAttribute":"生命加成","value":26},
        {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
        {"relicId":"5-1","suitName":"火灵","position":5,"level":15,"quality":6,"mainAttribute":"生命加成","value":25},
        {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26},
        {"relicId":"6-1","suitName":"火灵","position":6,"level":15,"quality":6,"mainAttribute":"生命加成","value":24}
      ]
    }
  },
  scattered: {
    value: 161,
    relics: [
      {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
      {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":28},
      {"relicId":"3-1","suitName":"火灵","position":3,"level":15,"quality":6,"mainAttribute":"生命加成","value":27},
      {"relicId":"4-1","suitName":"火灵","position":4,"level":15,"quality":6,"mainAttribute":"生命加成","value":26},
      {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
      {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26}
    ]
  },
  lucky: {
    value: 155,
    relics: [
      {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
      {"relicId":"2-1","suitName":"火灵","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":28},
      {"relicId":"3-0","suitName":"招财猫","position":3,"level":15,"quality":6,"mainAttribute":"攻击加成","value":23},
      {"relicId":"4-0","suitName":"招财猫","position":4,"level":15,"quality":6,"mainAttribute":"攻击加成","value":24},
      {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
      {"relicId":"6-0","suitName":"招财猫","position":6,"level":15,"quality":6,"mainAttribute":"攻击加成","value":26}
    ]
  },
  restricted: {
    value: 147,
    relics: [
      {"relicId":"1-1","suitName":"火灵","position":1,"level":15,"quality":6,"mainAttribute":"生命加成","value":29},
      {"relicId":"2-0","suitName":"招财猫","position":2,"level":15,"quality":6,"mainAttribute":"速度","value":22},
      {"relicId":"3-0","suitName":"招财猫","position":3,"level":15,"quality":6,"mainAttribute":"攻击加成","value":23},
      {"relicId":"4-0","suitName":"招财猫","position":4,"level":15,"quality":6,"mainAttribute":"攻击加成","value":24},
      {"relicId":"5-0","suitName":"招财猫","position":5,"level":15,"quality":6,"mainAttribute":"攻击加成","value":25},
      {"relicId":"6-1","suitName":"火灵","position":6,"level":15,"quality":6,"mainAttribute":"生命加成","value":24}
    ]
  }
}

function outputs(dataset) {
  return {
    account: desktop.analyzeAccountValue(dataset),
    scattered: desktop.getBestScatteredSpeedCombination(dataset),
    lucky: desktop.getBestSpeedCombinationForSuit(dataset, '招财猫'),
    restricted: desktop.getBestSpeedCombinationForSuit(dataset, '招财猫', { fourthMainAttributes: ['攻击加成'], sixthMainAttribute: '生命加成' }),
  }
}

test('shared public functions are the actual desktop implementation', () => {
  for (const name of ['getBestSpeedCombinationForSuit', 'getBestScatteredSpeedCombination', 'getRelicSubAttributeTotals', 'getRelicEffectiveRollCount', 'getFullSpeedRelics', 'analyzeRelicInventory']) {
    assert.equal(desktop[name], shared[name], name)
  }
  for (const name of ['speed', 'luckySpeed', 'effectiveRolls', 'pvpScore']) {
    assert.equal(desktop.accountScoringRules[name], shared.accountScoringRules[name])
  }
})

test('legacy offline samples retain complete scores, inventory, speed combinations and evidence', () => {
  const before = structuredClone(sample)
  assert.deepEqual(outputs(sample), legacy)
  assert.deepEqual(sample, before)
  const missingPosition = structuredClone(sample)
  delete missingPosition.relicsByPosition['3']
  assert.equal(desktop.getBestScatteredSpeedCombination(missingPosition), null)
  assert.equal(desktop.getBestSpeedCombinationForSuit(sample, '不存在'), null)
  assert.equal(desktop.getBestSpeedCombinationForSuit(sample, '招财猫', { fourthMainAttributes: ['暴击'] }), null)
  assert.deepEqual(desktop.getBestScatteredSpeedCombination(sample, { fourthMainAttributes: [], sixthMainAttributes: [] }), legacy.scattered)
})

test('legacy collection boundaries append only the desktop dimension without shared pollution', () => {
  const before = structuredClone(shared.accountScoringRules)
  for (const [count, score] of [[undefined, 0], [-1, 0], [0, 0], [9, 0], [10, 3], [29, 3], [30, 6], [59, 6], [60, 8], [99, 8], [100, 10], [101, 10]]) {
    const dataset = { account: { ...sample.account, collectionSkinCount: count }, relicsByPosition: {} }
    const common = shared.analyzeAccountValue(dataset)
    const actual = desktop.analyzeAccountValue(dataset)
    assert.deepEqual(actual.sellingPoints.slice(0, -1), common.sellingPoints)
    assert.deepEqual(actual.relics, common.relics)
    assert.deepEqual(actual.sellingPoints.at(-1), {
      id: 'collectionSkin', title: '典藏皮肤', value: count || 0, unit: '个', score, maxScore: 10,
      description: '按典藏皮肤数量进行分段评分。', evidence: [],
    })
    assert.equal(actual.totalScore, common.totalScore + score)
    assert.equal(actual.maxScore, 99)
    assert.equal(common.maxScore, 89)
    assert.equal(common.sellingPoints.length, 4)
  }
  assert.deepEqual(shared.accountScoringRules, before)
  assert.equal('collectionSkin' in shared.accountScoringRules, false)
  const empty = desktop.analyzeAccountValue({ relicsByPosition: {} })
  assert.equal(empty.totalScore, 0)
  assert.equal(empty.sellingPoints.at(-1).value, 0)
})
