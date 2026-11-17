// Offline interaction regression against the shared planner's real event handlers.
// node --test apps/web/checks/speed-reorder.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../../../packages/ui/src/pages/SpeedPage.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(`${source}\nexport { IndependentPlanner }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText

function setup({ reducedMotion = false } = {}) {
  const states = [[{ id: 'a', fourthMainAttributes: [], sixthMainAttributes: [] }, { id: 'b', fourthMainAttributes: [], sixthMainAttributes: [] }, { id: 'c', fourthMainAttributes: [], sixthMainAttributes: [] }]]
  const refs = []
  const layouts = []
  const nodes = new Map()
  const animations = []
  const calculations = []
  let cursor = 0
  let pendingState = false
  let rerender = null
  let hit = 'b'
  let captured = false
  class Element {
    constructor(id) {
      this.dataset = { speedConfigId: id }
      this.style = { transform: '' }
      this.offsetLeft = 0
      this.offsetHeight = 100
      this._animations = []
    }
    get offsetTop() { return list.children.indexOf(this) * 100 }
    getBoundingClientRect() { return { top: this.offsetTop, left: 0, height: 100 } }
    getAnimations() { return this._animations }
    animate(frames, options) {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true } }
      this._animations.push(animation)
      animations.push({ row: this.dataset.speedConfigId, frames, options })
      return animation
    }
  }
  const list = {
    children: [],
    getBoundingClientRect: () => ({ top: 0, left: 0 }),
    focus() {},
    setPointerCapture() { captured = true },
    hasPointerCapture: () => captured,
    releasePointerCapture() { captured = false },
  }
  const exports = {}
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const render = () => {
    cursor = 0
    layouts.length = 0
    const tree = exports.IndependentPlanner({ dataset: {}, suitOptions: [] })
    const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)]
    const result = walk(tree)
    for (const node of result) {
      const id = node.props?.['data-speed-config-id']
      if (id) {
        if (!nodes.has(id)) nodes.set(id, new Element(id))
        node.dom = nodes.get(id)
      }
      if (node.props?.ref && !node.dom && node.props.ref.current === null) {
        configListRef = node.props.ref
        configListRef.current = list
      }
      if (node.props?.ref && node.dom) node.props.ref.current = node.dom
    }
    list.children = result.filter(node => node.dom && node.props?.['data-speed-config-id']).map(node => node.dom)
    for (const effect of layouts) effect()
    return result
  }
  let configListRef
  vm.runInNewContext(compiled, {
    exports,
    HTMLElement: Element,
    document: { elementFromPoint: () => hit ? { closest: () => nodes.get(hit) } : null },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    queueMicrotask: () => {},
    console,
    require: id => {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (id === 'react') return {
        useState: initial => {
          const index = cursor++
          if (!(index in states)) states[index] = initial
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; pendingState = true; rerender?.() }]
        },
        useRef: initial => {
          const index = cursor++
          if (!(index in refs)) refs[index] = { current: initial }
          return refs[index]
        },
        useEffect: () => { cursor++ },
        useLayoutEffect: effect => { cursor++; layouts.push(effect) },
        useMemo: fn => { cursor++; return fn() },
      }
      if (id === '@phoenix/utils') return { calculateIndependentSpeed: (_dataset, configs) => { calculations.push(configs.map(config => config.id).join('')); return configs.map(() => ({ combination: null })) } }
      return new Proxy({}, { get: (_target, name) => String(name) })
    },
  })
  const draw = () => {
    pendingState = false
    const tree = render()
    return tree
  }
  rerender = draw
  const handle = id => {
    const tree = draw()
    const article = tree.find(node => node.props?.['data-speed-config-id'] === id)
    const button = tree.find(node => node.props?.['aria-label']?.startsWith('拖动第') && node.props['aria-label'].includes(`第 ${list.children.indexOf(nodes.get(id)) + 1} 套`))
    assert.ok(article, `rendered article for ${id}; found ${tree.filter(node => node.props?.['data-speed-config-id']).map(node => node.props['data-speed-config-id'])}`)
    assert.ok(button, `rendered handle for ${id}; found ${tree.filter(node => node.props?.['aria-label']).map(node => node.props['aria-label']).filter(label => label.includes('拖动'))}`)
    const currentTarget = { closest: () => nodes.get(id), focus() {} }
    return {
      ...button.props,
      onPointerDown: event => button.props.onPointerDown({ ...event, currentTarget }),
      row: nodes.get(id),
      onPointerMove: (event) => tree.find(node => node.props?.ref === configListRef).props.onPointerMove({ ...event, currentTarget: list }),
      onPointerUp: event => tree.find(node => node.props?.ref === configListRef).props.onPointerUp(event),
      onPointerCancel: event => tree.find(node => node.props?.ref === configListRef).props.onPointerCancel(event),
      onLostPointerCapture: event => tree.find(node => node.props?.ref === configListRef).props.onLostPointerCapture(event),
      currentTarget,
    }
  }
  const pointer = () => ({ isPrimary: true, button: 0, pointerId: 1, clientX: 20, clientY: 151, preventDefault() {}, currentTarget: null })
  draw()
  return {
    draw, handle, pointer, nodes, list, animations, calculations,
    order: () => {
      if (pendingState) draw()
      return list.children.map(node => node.dataset.speedConfigId).join('')
    },
    hit: id => { hit = id },
    pendingState: () => pendingState,
  }
}

test('reorders live, computes continuously, and uses row midpoints without jitter', () => {
  const state = setup()
  const event = state.pointer()
  state.handle('a').onPointerDown(event)
  state.handle('a').onPointerMove({ ...event, clientY: 149 })
  assert.equal(state.order(), 'abc')
  state.handle('a').onPointerMove(event)
  assert.equal(state.order(), 'bac')
  assert.equal(state.calculations.at(-1), 'bac')
  state.handle('a').onPointerMove(event)
  assert.equal(state.order(), 'bac', 'same midpoint does not oscillate')
  state.handle('a').onPointerMove({ ...event, clientY: 49 })
  assert.equal(state.order(), 'abc')
  state.handle('a').onPointerUp()
  state.handle('a').onPointerMove({ ...event, clientY: 299 })
  assert.equal(state.order(), 'abc')
})

test('drag transform follows pointer and FLIP animates siblings and settled row', () => {
  const state = setup()
  state.draw()
  const event = state.pointer()
  const row = state.nodes.get('a')
  state.handle('a').onPointerDown(event)
  assert.equal(row.style.transform, 'translate(0px, 0px)')
  state.handle('a').onPointerMove({ ...event, clientX: 45, clientY: 140 })
  assert.equal(row.style.transform, 'translate(25px, -11px)')
  state.animations.length = 0
  state.handle('a').onPointerMove({ ...event, clientY: 201 })
  assert.equal(state.order(), 'bac')
  assert.equal(row.style.transform, 'translate(0px, -50px)')
  assert.deepEqual(state.animations.map(animation => animation.row), ['b'])
  assert.deepEqual(state.animations.map(animation => animation.frames[0].transform), ['translateY(100px)'])
  assert.ok(state.animations.every(animation => animation.options.duration === 200))
  state.handle('a').onPointerUp()
  assert.equal(row.style.transform, '')
  assert.equal(state.animations.at(-1).row, 'a', 'released row animates into its settled position')
})

test('reduced motion skips sibling and drop animations', () => {
  const state = setup({ reducedMotion: true })
  const event = state.pointer()
  state.handle('a').onPointerDown(event)
  state.handle('a').onPointerMove({ ...event, clientY: 201 })
  assert.equal(state.order(), 'bac')
  assert.equal(state.animations.length, 0)
  state.handle('a').onPointerUp()
  assert.equal(state.animations.length, 0)
})

test('cancellation and secondary pointers cannot leave an active reorder', () => {
  const state = setup()
  const event = state.pointer()
  state.handle('a').onPointerDown({ ...event, isPrimary: false })
  state.handle('a').onPointerMove(event)
  assert.equal(state.order(), 'abc')
  for (const end of ['onPointerCancel', 'onLostPointerCapture']) {
    state.handle('a').onPointerDown(event)
    state.handle('a')[end]()
    state.handle('a').onPointerMove(event)
    assert.equal(state.order(), 'abc')
  }
  state.handle('a').onPointerDown(event)
  state.handle('a').onPointerUp({ pointerId: 2 })
  state.handle('a').onPointerMove({ ...event, clientY: 201 })
  assert.equal(state.order(), 'bac', 'another pointer cannot finish the active drag')
  state.handle('a').onPointerUp(event)
})

test('Escape cancels a drag and arrows are ignored until then', () => {
  const state = setup()
  state.draw()
  const event = state.pointer()
  const handle = state.handle('a')
  handle.onPointerDown(event)
  handle.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  assert.equal(state.order(), 'abc')
  handle.onKeyDown({ key: 'Escape', preventDefault() {} })
  assert.equal(state.nodes.get('a').style.transform, '')
  state.handle('a').onPointerMove({ ...event, clientY: 201 })
  assert.equal(state.order(), 'abc', 'Escape ends the drag')
})

test('focused handles support arrow keys and stop at list boundaries', () => {
  const state = setup()
  const key = key => ({ key, preventDefault() {} })
  state.handle('a').onKeyDown(key('ArrowUp'))
  assert.equal(state.order(), 'abc')
  state.handle('a').onKeyDown(key('ArrowDown'))
  assert.equal(state.order(), 'bac')
  state.handle('a').onKeyDown(key('ArrowUp'))
  assert.equal(state.order(), 'abc')
  state.handle('c').onKeyDown(key('ArrowDown'))
  assert.equal(state.order(), 'abc')
})
