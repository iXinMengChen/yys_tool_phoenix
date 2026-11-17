import assert from 'node:assert/strict'
import test from 'node:test'
import { getTheoreticalRelicPanelRange } from '../src/index.ts'

test('theoretical relic ranges reuse six-star main stats and six maximum rolls per relic', () => {
  assert.deepEqual(getTheoreticalRelicPanelRange('speed', 100), { min: 0, max: 165, formula: '57+18×6=165' })
  assert.equal(getTheoreticalRelicPanelRange('speed', 120).max, 165)
  assert.equal(getTheoreticalRelicPanelRange('critRate', 10).max, 163)
  assert.equal(getTheoreticalRelicPanelRange('critDamage', 150).max, 233)
  assert.equal(getTheoreticalRelicPanelRange('effectHit', 0).max, 199)
  assert.equal(getTheoreticalRelicPanelRange('effectResistance', 0).max, 199)
  assert.deepEqual(getTheoreticalRelicPanelRange('attack', 1000), { min: 486, max: 4188, formula: '1000×273%+486+162×6=4188' })
  assert.equal(getTheoreticalRelicPanelRange('health', 10000).max, 33456)
  assert.equal(getTheoreticalRelicPanelRange('defense', 500).max, 1649)
})
