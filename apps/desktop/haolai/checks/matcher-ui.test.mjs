import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../src/pages/AccountMatcher/Table.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const paginationSource = readFileSync(new URL('../../../../packages/ui/src/components/Pagination.tsx', import.meta.url), 'utf8')
const paginationCompiled = ts.transpileModule(paginationSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const pagination = {}
new Function('require', 'exports', paginationCompiled.outputText)(require, pagination)
const uiRequire = name => name === '@phoenix/ui/components/Pagination' ? pagination : require(name)
const exports = {}
new Function('require', 'exports', compiled.outputText)(uiRequire, exports)
const { Table } = exports
const nativeSource = readFileSync(new URL('../src/pages/AccountMatcher/native.tsx', import.meta.url), 'utf8')
const nativeCompiled = ts.transpileModule(nativeSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const native = {}
new Function('require', 'exports', nativeCompiled.outputText)(name => name === './Table' ? exports : require(name), native)

test('server picker emits only the active platform and preserves other platform selections once', () => {
  const selected = ['ios-a', 'android-a']
  const options = ['android-a', 'android-b']
  let result
  const group = native.Checkbox.Group({
    options, value: selected,
    onChange: values => { result = [...selected.filter(value => !options.includes(value)), ...values] },
  })
  group.props.children[1].props.onChange({ target: { checked: true } })
  assert.deepEqual(result, ['ios-a', 'android-a', 'android-b'])
  group.props.children[0].props.onChange({ target: { checked: false } })
  assert.deepEqual(result, ['ios-a'])
})

const columns = [
  { title: '账号信息', children: [
    { title: '账号', dataIndex: 'name' },
    { title: '价格', render: (_, row) => `¥${row.price}` },
  ] },
  { title: '操作', fixed: 'right', render: () => '读取账号' },
]
const dataSource = [{ id: 'sample', name: '测试账号', price: 1000 }]

test('matcher table renders grouped headers and leaf values instead of empty group cells', () => {
  const html = renderToStaticMarkup(React.createElement(Table, { columns, dataSource, rowKey: 'id' }))
  assert.match(html, /scope="colgroup" colSpan="2"/)
  for (const text of ['测试账号', '¥1000', '读取账号']) assert.ok(html.includes(text))
  assert.match(html, /class="matcher-cell-fixed"/)
})

test('matcher expanded detail spans leaf columns and the expansion control', () => {
  const html = renderToStaticMarkup(React.createElement(Table, {
    columns, dataSource, rowKey: 'id',
    expandable: { expandedRowKeys: ['sample'], expandedRowRender: () => '详细属性' },
  }))
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /colSpan="4">详细属性/)
})

test('matcher history table displays its empty state and clamps stale pagination', () => {
  const html = renderToStaticMarkup(React.createElement(Table, {
    columns, dataSource: [], locale: { emptyText: '还没有后台搜索使用记录' },
    pagination: { current: 4, pageSize: 10 },
  }))
  assert.ok(html.includes('还没有后台搜索使用记录'))
  assert.ok(html.includes('第 1 / 1 页'))
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2)
})

test('shared pagination keeps first, last and neighboring pages without duplicates at every boundary', () => {
  for (const pageCount of [1, 2, 3, 4, 5, 6, 20, 100]) {
    for (let page = 1; page <= pageCount; page++) {
      const html = renderToStaticMarkup(React.createElement(pagination.Pagination, { page, pageCount, onPageChange() {} }))
      const numbers = [...html.matchAll(/aria-label="第 (\d+) 页"/g)].map(match => Number(match[1]))
      assert.equal(numbers[0], 1)
      assert.equal(numbers.at(-1), pageCount)
      assert.equal(new Set(numbers).size, numbers.length)
      assert.ok(numbers.length <= 5)
      for (const neighbor of [page - 1, page, page + 1].filter(value => value >= 1 && value <= pageCount)) assert.ok(numbers.includes(neighbor))
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
      assert.ok(html.includes(`max="${pageCount}"`))
      assert.ok(html.includes(`value="${page}"`))
    }
  }
})

test('shared pagination clamps stale current pages and handles empty results', () => {
  for (const [page, pageCount, expected] of [[9, 2, 2], [0, 4, 1], [1, 0, 1]]) {
    const html = renderToStaticMarkup(React.createElement(pagination.Pagination, { page, pageCount, onPageChange() {} }))
    assert.match(html, new RegExp(`aria-label="第 ${expected} 页" aria-current="page"`))
  }
})

test('legacy relic list exposes shared pagination and slices the selected page', () => {
  const source = readFileSync(new URL('../src/components/ui/primitives.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const legacy = {}
  new Function('require', 'exports', compiled.outputText)(uiRequire, legacy)
  const html = renderToStaticMarkup(React.createElement(legacy.List, {
    dataSource: Array.from({ length: 95 }, (_, index) => index + 1),
    pagination: { current: 3, pageSize: 10, onChange() {} },
    renderItem: item => React.createElement('div', { key: item }, `relic-${item}`),
  }))
  assert.ok(html.includes('relic-21'))
  assert.ok(html.includes('relic-30'))
  assert.ok(!html.includes('relic-20'))
  assert.ok(!html.includes('relic-31'))
  assert.match(html, /aria-label="御魂分页"/)
  assert.ok(html.includes('第 3 / 10 页'))
})
