import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const script = name => readFileSync(new URL(`../src-tauri/src/${name}.js`, import.meta.url), 'utf8')
const origin = 'https://yys.cbg.163.com'
const target = `${origin}/cgi/mweb/pl?search_type=role&price_max=10000`
const candidate = id => ({ url: `${origin}/cgi/mweb/equip/1/${id}` })

test('search constructs the results URL without navigating before the native callback', () => {
  for (const pathname of ['/', '/cgi/mweb/advance/search', '/cgi/mweb/pl']) {
    const navigations = []
    const result = vm.runInNewContext(script('cbg_role_search')
      .replace('__CRITERIA_JSON__', JSON.stringify(JSON.stringify({ maximumPrice: 100 })))
      .replace('__SERVER_IDS_JSON__', JSON.stringify('{}')), {
      URL, URLSearchParams,
      document: { body: { innerText: '' } },
      location: { origin, pathname, search: '' },
    })
    assert.equal(result.status, 'submitted')
    assert.equal(navigations.length, 0)
    assert.equal(new URL(result.url).searchParams.get('price_max'), '10000')
    assert.equal(new URL(result.url).pathname, '/cgi/mweb/pl')
  }
})

function resultPage({ nomore = false, loading = false, nested = false } = {}) {
  let clicked = 0
  const events = []
  const root = { scrollHeight: 2000, scrollTop: 0, dispatchEvent: event => events.push(event.type), overflowY: 'auto' }
  const card = { parentElement: nested ? root : null, __vue__: { $data: { nomore, loading, list: [1], pageIndex: 1 } } }
  const next = {
    innerText: '下一页', className: '', parentElement: null,
    getBoundingClientRect: () => ({ width: 10, height: 10 }),
    getAttribute: () => null, matches: () => false, hasAttribute: () => false,
    click: () => clicked++,
  }
  const document = {
    body: { innerText: '' }, scrollingElement: root,
    querySelector: selector => selector === '.product-item' ? card : null,
    querySelectorAll: selector => selector === 'a,button,[role=button]' ? [next] : [],
  }
  const result = vm.runInNewContext(script('cbg_role_results').replace('__ACTION__', '"next"'), {
    URL, URLSearchParams, Event, document,
    location: new URL(target),
    window: { dispatchEvent: event => events.push(`window:${event.type}`) },
    getComputedStyle: element => ({ overflowY: element.overflowY, display: 'block', visibility: 'visible' }),
  })
  return { result, clicked, events, root }
}

test('infinite results scroll the list instead of clicking a next link', () => {
  for (const nested of [false, true]) {
    const page = resultPage({ nested })
    assert.equal(page.result.status, 'scrolling')
    assert.equal(page.clicked, 0)
    assert.equal(page.root.scrollTop, 2000)
    assert.ok(page.events.includes('scroll'))
  }
  assert.equal(resultPage({ loading: true }).result.status, 'waiting')
  const last = resultPage({ nomore: true })
  assert.equal(last.result.status, 'done')
  assert.equal(last.clicked, 0)
})

const background = ts.transpileModule(readFileSync(new URL('../src/lib/cbgBackgroundSearch.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function runBackground(pages, options = {}) {
  const { stopOnNext = false } = options
  const calls = { submit: 0, next: 0, scheduled: 0, notifications: [], running: [] }
  let index = 0
  let api
  let tick
  const emitTick = () => tick({ payload: 1 })
  const notifications = {
    isPermissionGranted: async () => true,
    sendNotification: value => calls.notifications.push(value),
  }
  const exports = {}
  const window = {
    __TAURI_INTERNALS__: {}, localStorage: { getItem: () => null, setItem: () => {} },
    desktop: {
      applyCbgRoleSearch: async () => {
        calls.submit++
        if (options.duplicateTicks) { emitTick(); emitTick() }
        if (options.errorAt === 'submit') throw '藏宝阁要求先登录；请在藏宝阁窗口手动登录后重试'
        return { url: target }
      },
      readCbgRoleResults: async () => ({ status: 'ready', pageUrl: target, ...pages[index] }),
      nextCbgRoleResultsPage: async () => {
        calls.next++
        if (options.errorAt === 'next') throw '藏宝阁要求先登录；请在藏宝阁窗口手动登录后重试'
        if (stopOnNext) await api.stopBackgroundSearch()
        index = Math.min(index + 1, pages.length - 1)
        return true
      },
      setBackgroundSearchRunning: async value => { calls.running.push(value) },
      scheduleBackgroundSearch: async () => { calls.scheduled++ },
    },
  }
  vm.runInNewContext(background, {
    exports, window, URL,
    require: id => id === '@tauri-apps/api/event' ? { listen: async (_, listener) => { tick = listener; return () => {} } } : notifications,
  })
  api = exports
  await api.startBackgroundSearch({}, 30)
  const flush = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setImmediate(resolve))
      if (!api.getBackgroundSearchStatus().searching) break
    }
    assert.equal(api.getBackgroundSearchStatus().searching, false)
  }
  await flush()
  return { calls, status: api.getBackgroundSearchStatus(), api, emitTick, flush }
}

test('one background cycle loads successive batches and deduplicates without resubmitting', async () => {
  const { calls, status } = await runBackground([
    { candidates: [candidate('a')], hasNext: true },
    { candidates: [candidate('a'), candidate('b')], hasNext: true },
    { candidates: [candidate('a'), candidate('b'), candidate('c')], hasNext: false },
  ])
  assert.equal(calls.submit, 1)
  assert.equal(calls.next, 2)
  assert.equal(calls.scheduled, 1)
  assert.equal(status.lastFoundCount, 3)
  assert.equal(status.newFoundCount, 3)
  assert.equal(status.error, null)
})

test('stalled or stopped background loading cannot loop or report stale discoveries', async () => {
  const pages = [{ candidates: [candidate('a')], hasNext: true }]
  const stalled = await runBackground(pages)
  assert.equal(stalled.calls.submit, 1)
  assert.equal(stalled.calls.next, 1)
  assert.equal(stalled.status.running, false)
  assert.equal(stalled.calls.scheduled, 0)
  assert.match(stalled.status.error, /没有返回新账号/)
  const stopped = await runBackground(pages, { stopOnNext: true })
  assert.equal(stopped.status.running, false)
  assert.equal(stopped.calls.next, 1)
  assert.equal(stopped.calls.notifications.length, 0)
  assert.equal(stopped.calls.scheduled, 0)
})

test('login at submission, result reading or continuation stops all future background retries', async () => {
  for (const stage of ['submit', 'read', 'next']) {
    const options = { errorAt: stage }
    const pages = [stage === 'read'
      ? { status: 'login_required' }
      : { candidates: [candidate('a')], hasNext: stage === 'next' }]
    const run = await runBackground(pages, options)
    assert.equal(run.status.running, false, stage)
    assert.equal(run.status.nextRunAt, null, stage)
    assert.match(run.status.error, /登录/, stage)
    assert.deepEqual(run.calls.running, [true, false], stage)
    assert.equal(run.calls.scheduled, 0, stage)
    run.emitTick()
    await run.flush()
    assert.equal(run.calls.submit, 1, stage)
    assert.equal(run.calls.notifications.length, 1, stage)
    assert.equal(run.calls.notifications[0].title, '后台搜索已停止', stage)
    // 登录完成后仍由用户明确启动；旧任务事件不能触发新搜索。
    options.errorAt = undefined
    pages[0] = { candidates: [], hasNext: false }
    await run.api.startBackgroundSearch({}, 30)
    await run.flush()
    assert.equal(run.calls.submit, 2, stage)
    assert.equal(run.api.getBackgroundSearchStatus().running, true, stage)
    assert.equal(run.api.getBackgroundSearchStatus().error, null, stage)
    assert.equal(run.calls.scheduled, 1, stage)
  }
})

test('duplicate timer events cannot submit a second search while a cycle is active', async () => {
  const run = await runBackground([{ candidates: [], hasNext: false }], { duplicateTicks: true })
  assert.equal(run.calls.submit, 1)
  assert.equal(run.calls.scheduled, 1)
  assert.equal(run.status.error, null)
})
