import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateIndependentSpeed, parseIndependentSpeedPresets } from '../src/lib/independentSpeed.ts'
import { calculateIndependentSpeed as sharedCalculation } from '@phoenix/utils'

test('desktop runs the shared local speed solver and never reuses relics between sets', () => {
  assert.equal(calculateIndependentSpeed, sharedCalculation)
  const dataset = { relicsByPosition: Object.fromEntries([1, 2, 3, 4, 5, 6].map((position) => [String(position),
    [0, 1].map((index) => ({
      id: `${position}-${index}`, position, level: 15, quality: 6,
      suit: { id: 1, name: '招财猫' },
      mainAttribute: { label: position === 2 ? '速度' : '攻击', value: position === 2 ? 57 : 486, isPercent: false },
      subAttributes: [{ label: '速度', value: 18 - index, isPercent: false }],
    })),
  ])) }
  const configs = [0, 1, 2].map((index) => ({ id: String(index), suitName: '招财猫', fourthMainAttributes: [], sixthMainAttributes: [] }))
  const results = calculateIndependentSpeed(dataset, configs)
  assert.equal(results[0].combination.value, 108)
  assert.equal(results[1].combination.value, 102)
  assert.equal(results[2].combination, null)
  const ids = results.flatMap(({ combination }) => combination?.relics.map(({ relicId }) => relicId) ?? [])
  assert.equal(new Set(ids).size, 12)
  assert.equal(dataset.relicsByPosition['1'].length, 2)
  assert.deepEqual(parseIndependentSpeedPresets('{'), [])
})
