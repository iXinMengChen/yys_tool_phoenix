import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(name => {
    assert.ok(name in dependencies, `unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

test('navigation renders immediately without waiting for animations or remounting its wrapper', () => {
  const { PageTransition } = load('../../../../packages/ui/src/components/page-transition.tsx', {
    react: { useRef: current => ({ current }), useLayoutEffect: () => {} },
    'react/jsx-runtime': jsxRuntime,
  })
  for (const pathname of ['/calculator', '/relics', '/speed']) {
    const page = { pathname }
    const element = PageTransition({ pathname, children: page })
    assert.equal(element.props['aria-busy'], false)
    assert.equal(element.props.children.props.children, page)
    assert.equal(element.props.children.key, null)
  }
})

test('visited routes keep their outlet mounted and only toggle visibility', () => {
  let pathname = '/'
  let outlet = { page: 'account' }
  let pages
  let updated
  const react = {
    useState: initial => {
      pages ??= initial()
      return [pages, next => { pages = next; updated = true }]
    },
  }
  const { default: CachedOutlet } = load('../src/Workspace/CachedOutlet.tsx', {
    react,
    'react/jsx-runtime': jsxRuntime,
    'react-router-dom': { useLocation: () => ({ pathname }), useOutlet: () => outlet },
    './pageTitleByPath': { pageTitleByPath: { '/': '账号查询', '/settings': '桌面设置' } },
  })
  const render = () => {
    updated = false
    const result = CachedOutlet()
    return updated ? CachedOutlet() : result
  }
  const account = render().props.children[0]
  pathname = '/settings'
  outlet = { page: 'settings' }
  const visiting = render().props.children
  assert.equal(visiting.length, 2)
  assert.equal(visiting[0].type, 'div')
  assert.equal(visiting[0].props.hidden, true)
  assert.equal(visiting[1].props.hidden, false)
  pathname = '/'
  outlet = { page: 'new account outlet must not replace the cached instance' }
  const returned = render().props.children
  assert.equal(returned.length, 2)
  assert.equal(returned[0].key, account.key)
  assert.equal(returned[0].props.children, account.props.children)
  assert.equal(returned[0].props.hidden, false)
  assert.equal(returned[1].props.hidden, true)
  pathname = '/about'
  outlet = { redirect: '/settings' }
  assert.equal(render().props.children.length, 3)
  pathname = '/settings'
  assert.equal(render().props.children.length, 2, 'redirect outlets must not remain mounted in the cache')
})
