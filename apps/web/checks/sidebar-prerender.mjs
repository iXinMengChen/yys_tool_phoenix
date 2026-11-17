// node --test apps/web/checks/sidebar-prerender.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(new URL('../package.json', import.meta.url))
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../src/Layout/AppSidebar/index.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText

test('sidebar can prerender without reading the current time, including a saved cooldown', () => {
  for (const staticRefreshAvailableAt of [0, 1_800_000]) {
    const exports = {}
    vm.runInNewContext(compiled, {
      exports,
      Date: { now: () => { throw new Error('Current time read during prerender') } },
      require: id => {
        if (id === 'next/image') return 'img'
        if (id === 'next/link') return 'a'
        if (id === 'next/navigation') return { usePathname: () => '/tools', useRouter: () => ({}) }
        if (id === 'lucide-react') return { History: 'svg', RefreshCw: 'svg' }
        if (id === '@/Haolai/context') return { useAccount: () => ({ history: [], staticRefreshAvailableAt }) }
        if (id === '@/Layout/navigation') return { navigationGroups: [], pageTitleByPath: {} }
        if (id === '@/Layout/NavigationProvider') return { useNavigation: () => ({ activePath: '/tools' }) }
        assert.ok(['react', 'react/jsx-runtime'].includes(id), `Unexpected import: ${id}`)
        return require(id)
      },
    })
    const html = renderToStaticMarkup(createElement(exports.default))
    assert.match(html, /更新资源/)
    assert.doesNotMatch(html, /分钟后可再次更新/)
  }
})
