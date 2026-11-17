import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('shared image failure is source-bound and both applications consume the hook', () => {
  const source = readFileSync(new URL('../../../../packages/ui/src/hooks/use-image-fallback.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  let state
  let initialized = false
  const exports = {}
  // Only the useState cell is simulated; execute the actual hook body on each render.
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => {
      assert.equal(id, 'react')
      return {
        useState: (initial) => {
          if (!initialized) {
            state = typeof initial === 'function' ? initial() : initial
            initialized = true
          }
          return [state, (value) => { state = typeof value === 'function' ? value(state) : value }]
        },
        useEffect: (effect) => effect(),
      }
    },
  })
  const render = exports.useImageFallback
  assert.equal(render(undefined).failed, true)
  const oldImage = render('/old.png')
  assert.equal(oldImage.failed, false)
  oldImage.onError()
  assert.equal(render('/old.png').failed, true)
  assert.equal(render('/new.png').failed, false)
  oldImage.onError()
  assert.equal(render('/new.png').failed, false)
  render('/new.png').onError()
  assert.equal(render('/new.png').failed, true)
  for (const file of [
    '../../../../packages/ui/src/components/GameIcon.tsx',
  ]) {
    const consumer = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(consumer, /@phoenix\/ui\/hooks\/use-image-fallback/)
    assert.match(consumer, /onError=\{onError\}/)
    assert.doesNotMatch(consumer, /useState|setFailed/)
  }
})
