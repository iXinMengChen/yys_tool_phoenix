import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { compareVersions, parseDesktopReleaseResponse } from '../src/lib/desktopRelease.ts'

const source = readFileSync(new URL('../src/Workspace/Shell.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace('import.meta.env.VITE_DESKTOP_VERSION_URL?.trim()', "'https://example.com/api/desktop/version'"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const release = { code: 200, message: 'success', data: { configured: true, version: '2.0.0', downloadUrl: 'https://example.com/download', notes: '' } }
const flush = () => new Promise(resolve => setImmediate(resolve))

function mount({ native = true, enabled = true, response = Promise.resolve(release), download = async () => {} } = {}) {
  const cells = []
  const effects = []
  const listeners = new Map()
  let cursor = 0
  let checks = 0
  let preference = enabled
  const window = {
    ...(native ? { __TAURI_INTERNALS__: {} } : {}),
    desktop: {
      getAppVersion: async () => '1.0.0',
      getDesktopRelease: () => { checks++; return response },
      openDesktopDownload: download,
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  }
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports, window,
    localStorage: { getItem: () => String(preference) },
    require: id => {
      if (id === 'react') return {
        useState: initial => {
          const index = cursor++
          if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
          return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value }]
        },
        useRef: initial => {
          const index = cursor++
          return cells[index] ??= { current: initial }
        },
        useEffect: effect => effects.push(effect),
        useLayoutEffect: () => {},
      }
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (id === 'react-router-dom') return { useLocation: () => ({ pathname: '/' }) }
      if (id === '@/lib/desktopRelease') return { compareVersions, parseDesktopReleaseResponse }
      if (id === '@/features/account/context') return { useAccount: () => ({}) }
      if (id === '@/lib/theme') return { getStoredTheme: () => 'light' }
      if (id.endsWith('use-mobile')) return { useIsMobile: () => false }
      if (id.endsWith('pageTitleByPath')) return { pageTitleByPath: { '/': '账号查询' } }
      return {}
    },
  })
  const render = () => { cursor = 0; return exports.default() }
  render()
  const cleanup = effects[0]()
  return {
    render, cleanup, checks: () => checks,
    disable: () => { preference = false; listeners.get('phoenix-update-reminders-changed')?.() },
  }
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}
const banner = app => nodes(app.render()).find(node => node.props?.role === 'status')
const downloadButton = app => nodes(app.render()).find(node => node.type === 'button' && ['前往下载', '正在打开…'].includes(node.props.children))

test('startup checks require native mode and the reminder preference', async () => {
  for (const options of [{ native: false }, { enabled: false }]) {
    const app = mount(options)
    await flush()
    assert.equal(app.checks(), 0)
    assert.equal(banner(app), undefined)
  }
  const app = mount()
  await flush()
  assert.ok(banner(app))
  nodes(app.render()).find(node => node.props?.['aria-label'] === '关闭更新提醒').props.onClick()
  assert.equal(banner(app), undefined)
})

test('late startup responses cannot restore disabled or unmounted reminders', async () => {
  for (const action of ['disable', 'cleanup']) {
    let resolve
    const app = mount({ response: new Promise(done => { resolve = done }) })
    app[action]()
    resolve(release)
    await flush()
    assert.equal(banner(app), undefined, action)
  }
})

test('startup ignores current versions and unavailable release services', async () => {
  for (const response of [
    () => Promise.resolve({ ...release, data: { ...release.data, version: '1.0.0' } }),
    () => Promise.resolve({ ...release, data: { configured: false } }),
    () => Promise.resolve({ code: 500 }),
    () => Promise.reject(new Error('offline')),
  ]) {
    const app = mount({ response: response() })
    await flush()
    assert.equal(banner(app), undefined)
  }
})

test('manual download prevents repeat opens and reports failure with retry', async () => {
  let calls = 0
  let reject
  const app = mount({ download: () => { calls++; return new Promise((_, fail) => { reject = fail }) } })
  await flush()
  const button = downloadButton(app)
  button.props.onClick()
  button.props.onClick()
  assert.equal(calls, 1)
  assert.equal(downloadButton(app).props.disabled, true)
  reject('无法打开浏览器')
  await flush()
  assert.equal(downloadButton(app).props.disabled, false)
  assert.ok(nodes(app.render()).some(node => node.props?.role === 'alert'))
  downloadButton(app).props.onClick()
  assert.equal(calls, 2)
  reject('仍无法打开浏览器')
  await flush()
})
