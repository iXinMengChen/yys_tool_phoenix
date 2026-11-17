// Run against an existing Vite preview and isolated Chromium CDP endpoint; never launches a service.
// node checks/pagination.mjs <vite-origin> <cdp-origin> <screenshot-directory>
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [origin, endpoint, output] = process.argv.slice(2)
if (!origin || !endpoint || !output) throw Error('Pass existing Vite/CDP origins and a screenshot directory')
const { webSocketDebuggerUrl } = await (await fetch(`${endpoint}/json/version`)).json()
const socket = new WebSocket(webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map()
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(Error(JSON.stringify(message.error)))
  else request.resolve(message.result)
}
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
const paginationModule = '/@fs/' + fileURLToPath(new URL('../../../../packages/ui/src/components/Pagination.tsx', import.meta.url)).replaceAll('\\', '/')
const { browserContextId } = await send('Target.createBrowserContext')
let sessionId
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function act(expression) {
  return evaluate(`(async () => { ${expression}; await new Promise(resolve => setTimeout(resolve, 100)); return true })()`)
}
const nav = 'document.querySelector("[aria-label=分页验证]")'
async function expectPage(page) {
  const actual = await evaluate(`${nav}.querySelector('[aria-current="page"]').textContent`)
  assert.equal(actual, String(page), JSON.stringify(await evaluate(`({ active: document.activeElement.outerHTML, input: ${nav}.querySelector('input').value, valid: ${nav}.querySelector('input').validity.valid, events: window.fixtureEvents })`)))
}
async function input(value) {
  await act(`const input = ${nav}.querySelector('input'); input.focus(); input.select()`)
  if (value === '') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, sessionId)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, sessionId)
  } else await send('Input.insertText', { text: value }, sessionId)
  await act('')
  assert.equal(await evaluate(`${nav}.querySelector('input').value`), value)
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId)
  writeFileSync(resolve(output, name), Buffer.from(data, 'base64'))
}
try {
  const { targetId } = await send('Target.createTarget', { url: origin, browserContextId, background: true })
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId)
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('document.querySelector("#root") !== null && document.styleSheets.length > 0')) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await evaluate(`(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = ReactDOM;
    const { Pagination } = await import(${JSON.stringify(paginationModule)});
    const { Table } = await import('/src/pages/AccountMatcher/Table.tsx');
    const { List } = await import('/src/components/ui/primitives.tsx');
    const h = React.createElement;
    function Fixture() {
      const [page, setPage] = React.useState(50);
      const [total, setTotal] = React.useState(100);
      const [relicPage, setRelicPage] = React.useState(1);
      window.setFixtureTotal = setTotal;
      return h('main', { style: { maxWidth: 1100, margin: '0 auto', padding: 20, display: 'grid', gap: 24 } },
        h('h1', null, '分页交互验证（合成数据）'),
        h(Pagination, { label: '分页验证', page, pageCount: total, onPageChange: setPage, summary: '共 1000 条' }),
        h('h2', null, '账号搜索列表'),
        h(Table, { dataSource: Array.from({ length: 95 }, (_, index) => ({ id: String(index + 1), name: '合成记录 ' + (index + 1) })), columns: [{ title: '账号', dataIndex: 'name' }], rowKey: 'id', pagination: { pageSize: 10 } }),
        h('h2', null, '桌面御魂列表'),
        h(List, { dataSource: Array.from({ length: 95 }, (_, index) => index + 1), pagination: { current: relicPage, pageSize: 10, onChange: setRelicPage }, renderItem: item => h('span', { key: item, style: { display: 'inline-block', margin: 8 } }, '御魂 ' + item) }));
    }
    const host = document.createElement('div'); document.body.replaceChildren(host);
    createRoot(host).render(h(Fixture));
  })()`)
  await act('')
  await expectPage(50)
  await evaluate(`window.fixtureEvents = []; for (const type of ['input', 'change', 'keydown', 'keyup']) document.addEventListener(type, event => window.fixtureEvents.push({ type, key: event.key, value: event.target.value, prevented: event.defaultPrevented }))`)
  assert.deepEqual(await evaluate(`${nav}.querySelector('.pagination-pages').textContent`), '1…495051…100')
  await act(`${nav}.querySelector('[aria-label="第 100 页"]').click()`)
  await expectPage(100)
  assert.equal(await evaluate(`${nav}.querySelector('[aria-label="下一页"]').disabled`), true)
  await act(`${nav}.querySelector('[aria-label="第 1 页"]').click()`)
  assert.equal(await evaluate(`${nav}.querySelector('[aria-label="上一页"]').disabled`), true)
  await input('42')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 }, sessionId)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId)
  await act('')
  await expectPage(42)
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), '跳转页码')
  for (const value of ['', '0', '101', '2.5']) {
    await input(value)
    await act(`${nav}.querySelector('.pagination-jump button').click()`)
    await expectPage(42)
    assert.equal(await evaluate(`${nav}.querySelector('input').validity.valid`), false)
  }
  await input('25')
  await act(`${nav}.querySelector('.pagination-jump button').click()`)
  await expectPage(25)
  await act(`document.querySelector('[aria-label="搜索结果分页"] [aria-label="第 10 页"]').click(); document.querySelector('[aria-label="御魂分页"] [aria-label="第 10 页"]').click()`)
  assert.equal(await evaluate('document.querySelector("tbody tr td").textContent'), '合成记录 91')
  assert.equal(await evaluate('document.querySelector(".phoenix-list-items").textContent'), '御魂 91御魂 92御魂 93御魂 94御魂 95')
  mkdirSync(output, { recursive: true })
  await screenshot('pagination-desktop.png')
  for (const width of [320, 390, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId)
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 }, sessionId)
    await act('')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `no overflow at ${width}px`)
    if (width === 390) await screenshot('pagination-mobile.png')
  }
  await act('document.documentElement.classList.add("dark")')
  await screenshot('pagination-dark.png')
  await act('window.setFixtureTotal(2)')
  await expectPage(2)
  assert.equal(await evaluate(`${nav}.querySelector('input').max`), '2')
  await act('window.setFixtureTotal(1)')
  await expectPage(1)
  assert.equal(await evaluate(`${nav}.querySelectorAll('button:disabled').length`), 2)
  console.log(JSON.stringify({ passed: true, checks: ['neighbor pages', 'first/last boundaries', 'Enter and click jumps', 'focus retained', 'empty/zero/overflow/decimal rejected', 'matcher and relic list slices', '320/390/768px no overflow', 'light/dark screenshots', 'shrinking results and single page'], screenshots: output }))
} finally {
  await send('Target.disposeBrowserContext', { browserContextId })
  socket.close()
}
