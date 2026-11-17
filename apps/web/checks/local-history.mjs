// Uses an existing Web dev server and Chromium CDP endpoint. Only synthetic data,
// intercepted API responses and a disposable browser context; no upstream requests.
// node apps/web/checks/local-history.mjs <existing-web-origin> <existing-chromium-cdp-origin>
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const origin = process.argv[2] ?? 'http://localhost:13475'
const endpoint = process.argv[3]
if (!endpoint) throw new Error('Pass an existing Chromium CDP origin as the third argument; this check never launches a browser or server.')
const version = await fetch(`${endpoint}/json/version`).then(response => response.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map()
const handlers = new Map()
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  } else handlers.get(message.method)?.(message)
}
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
const { browserContextId } = await send('Target.createBrowserContext')
let sessionId
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + (response.exceptionDetails.exception?.description ?? ''))
  return response.result.value
}
async function until(expression) {
  const end = Date.now() + 30_000
  while (Date.now() < end) {
    if (await evaluate(`Boolean(${expression})`)) return
    await delay(150)
  }
  throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
}
const text = value => JSON.stringify(value)
const button = label => `[...document.querySelectorAll('button')].find(button => button.textContent.includes(${text(label)}))`
const heroes = JSON.parse(readFileSync(new URL('../../api/src/modules/cbg/data/heroes.json', import.meta.url), 'utf8'))
const relicSuits = JSON.parse(readFileSync(new URL('../../api/src/modules/cbg/data/relic-suits.json', import.meta.url), 'utf8'))
const hero = Object.values(heroes.heroesById).find(item => item.name === '须佐之男')
const accountUrl = 'https://yys.cbg.163.com/cgi/mweb/equip/1/local-history-test'
const product = { schemaVersion: 1, channel: 'official', sourceUrl: accountUrl, equip: {
  equip_name: '合成商品', price: 209900, server_name: '测试区', status_desc: '测试数据', equip_desc: {
    name: '本地历史验证 · 合成账号', lv: 60, goyu: 17762,
    heroes: { one: { heroId: hero.id, name: hero.name, level: 40, skinfo: [[1, 5], [2, 5], [3, 5]] } },
    inventory: { one: { uuid: 'synthetic-relic', pos: 2, qua: 6, level: 15, suitid: 300044, name: '招财猫', attrs: [['速度', '57']], rattr: [['speedAdditionVal', 1], ['critRateAdditionVal', 1], ['attackAdditionRate', 1], ['critPowerAdditionVal', 1], ...Array.from({ length: 5 }, () => ['speedAdditionVal', 1])] } },
  },
} }
let productRequests = 0
let rejectApi = false
let productError = false
const interceptionErrors = []
handlers.set('Fetch.requestPaused', message => {
  void (async () => {
    const { requestId, request } = message.params
    const pathname = new URL(request.url).pathname
    if (pathname.endsWith('/cbg/product')) productRequests++
    if (rejectApi) return send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }, sessionId)
    const data = pathname.endsWith('/cbg/product') ? product : pathname.endsWith('/cbg/static') ? { heroes, relicSuits } : { configured: true, refreshedAt: null }
    const status = pathname.endsWith('/cbg/product') && productError ? 429 : 200
    await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ code: status, message: status === 200 ? 'success' : 'rate limited', data: status === 200 ? data : null })).toString('base64') }, sessionId)
  })().catch(error => interceptionErrors.push(error))
})
const databaseRead = store => `new Promise((resolve, reject) => { const request = indexedDB.open('haolai-local-accounts'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const result = db.transaction(${text(store)}).objectStore(${text(store)}).getAll(); result.onsuccess = () => { db.close(); resolve(result.result) }; result.onerror = () => reject(result.error) } })`
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, background: true })
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send('Fetch.enable', { patterns: [{ urlPattern: '*cbg/*' }] }, sessionId)
  // Seed a record older than the removed three-day TTL before React mounts.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!localStorage.getItem('history-check-seeded')) { localStorage.setItem('haolai-product-history-v1', JSON.stringify([{ url: ${text(accountUrl + '?view_loc=old')}, title: '旧合成账号', at: ${Date.now() - 30 * 86400_000} }, {url: 'https://invalid.test/equip/1/no', title: 'invalid', at: 0}])); localStorage.setItem('history-check-seeded', 'yes') }` }, sessionId)
  await send('Page.navigate', { url: `${origin}/yys-cbg-inspector/home` }, sessionId)
  await until(`${button('旧合成账号')} && !${button('旧合成账号')}.disabled`)
  assert.equal(productRequests, 0, 'migration must not request a product')
  assert.equal(await evaluate(`${button('旧合成账号')}.textContent.includes('需读取一次')`), true)
  assert.equal(await evaluate(`localStorage.getItem('haolai-product-history-v1')`), null)
  await evaluate(`document.querySelector('details').open = true; ${button('旧合成账号')}.click()`)
  await until(`${button('本地历史验证')} && !${button('本地历史验证')}.disabled`)
  assert.equal(productRequests, 1, 'explicit legacy click performs exactly one product request')
  const snapshots = await evaluate(databaseRead('snapshots'))
  assert.equal(snapshots.length, 1)
  assert.deepEqual(snapshots[0].product, product)
  assert.ok(snapshots[0].suitConfig.two_piece_attributes)
  assert.equal('relicsByPosition' in snapshots[0], false, 'derived dataset must not be stored')
  assert.equal(snapshots[0].url, accountUrl)
  console.log('PASS legacy migration, no TTL, explicit upgrade, compact raw snapshot and canonical deduplication')

  // Reload with all account/static/session API requests failing. Restore must use
  // the saved suit index, while analysis pages can use the shared static cache.
  rejectApi = true
  await evaluate(`localStorage.setItem('haolai-product-history-v1', JSON.stringify([{ url: ${text(accountUrl)}, title: '同链接的新旧版记录', at: Date.now() }]))`)
  await send('Page.reload', {}, sessionId)
  await until(`${button('本地历史验证')} && !${button('本地历史验证')}.disabled`)
  await evaluate(`document.querySelector('details').open = true; ${button('本地历史验证')}.click()`)
  await until(`document.querySelector('.account-context-strip').textContent.includes('本地历史验证') && !${button('本地历史验证')}.disabled`)
  assert.equal(productRequests, 1, 'restoring after reload must not request a product')
  await evaluate(`document.querySelector('a[href="/yys-cbg-inspector/relics"]').click()`)
  await until(`${button('2 号位')}`)
  await evaluate(`${button('2 号位')}.click()`)
  await until(`document.querySelector('button[aria-label*="查看"][aria-label*="强化"]') !== null`)
  await evaluate(`document.querySelector('button[aria-label*="查看"][aria-label*="强化"]').click()`)
  await until(`document.querySelector('[role="dialog"]')?.textContent.includes('+15')`)
  assert.match(await evaluate(`document.querySelector('[role="dialog"]').textContent`), /速度/)
  assert.equal(productRequests, 1)
  await evaluate(`document.querySelector('[role="dialog"] button[aria-label="关闭"]')?.click()`)
  console.log('PASS reload with API unavailable, local Worker restore, original relic dialog and lazy enhancement stages')

  // Clear through the real UI, verify both account stores are empty after reload.
  await send('Page.navigate', { url: `${origin}/yys-cbg-inspector/home` }, sessionId)
  await until(`${button('清除此浏览器查询记录')} && !${button('清除此浏览器查询记录')}.disabled`)
  await evaluate(`${button('清除此浏览器查询记录')}.click()`)
  await until(`${button('清除此浏览器查询记录')}.disabled`)
  assert.deepEqual(await evaluate(databaseRead('entries')), [])
  assert.deepEqual(await evaluate(databaseRead('snapshots')), [])
  await send('Page.reload', {}, sessionId)
  await until(`${button('清除此浏览器查询记录')}`)
  assert.equal(await evaluate(`${button('清除此浏览器查询记录')}.disabled`), true)
  assert.equal(productRequests, 1)
  console.log('PASS clearing removes stored payloads and metadata and stays cleared after reload')

  rejectApi = false
  productError = true
  await evaluate(`document.querySelector('input').focus()`)
  await send('Input.insertText', { text: accountUrl }, sessionId)
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await until(`document.querySelector('[role="alert"]')?.textContent.includes('频繁')`)
  assert.equal(productRequests, 2)
  assert.deepEqual(await evaluate(databaseRead('snapshots')), [])
  productError = false
  await evaluate(`indexedDB.open = () => { throw new DOMException('synthetic quota failure', 'QuotaExceededError') }; document.querySelector('form').requestSubmit()`)
  await until(`document.querySelector('.account-context-strip').textContent.includes('本地历史验证') && !${button('读取账号')}.disabled`)
  assert.match(await evaluate(`document.body.innerText`), /账号已读取，但本地保存失败/)
  assert.equal(productRequests, 3)
  await send('Page.reload', {}, sessionId)
  await until(`${button('清除此浏览器查询记录')}`)
  assert.deepEqual(await evaluate(databaseRead('snapshots')), [])
  console.log('PASS upstream error stores no account; quota failure keeps the loaded account and reports it was not saved')

  for (let index = 1; index <= 13; index++) {
    product.sourceUrl = `https://yys.cbg.163.com/cgi/mweb/equip/1/history-limit-${index}`
    product.equip.equip_desc.name = `容量验证账号 ${index}`
    await evaluate(`document.querySelector('input').focus(); document.querySelector('input').select()`)
    await send('Input.insertText', { text: product.sourceUrl }, sessionId)
    await evaluate(`document.querySelector('form').requestSubmit()`)
    await until(`document.querySelector('.account-context-strip').textContent.includes(${text(product.equip.equip_desc.name)}) && !${button('读取账号')}.disabled`)
  }
  const retained = await evaluate(databaseRead('snapshots'))
  assert.equal(retained.length, 12)
  assert.equal((await evaluate(databaseRead('entries'))).length, 12)
  assert.equal(retained.some(item => item.url.endsWith('/history-limit-1')), false)
  assert.equal(retained.some(item => item.url.endsWith('/history-limit-13')), true)
  const beforeRestore = productRequests
  rejectApi = true
  await send('Page.reload', {}, sessionId)
  await until(`${button('容量验证账号 13')} && !${button('容量验证账号 13')}.disabled`)
  await evaluate(`document.querySelector('details').open = true; ${button('容量验证账号 13')}.click()`)
  await until(`document.querySelector('.account-context-strip').textContent.includes('容量验证账号 13') && !${button('容量验证账号 13')}.disabled`)
  assert.equal(productRequests, beforeRestore)
  console.log('PASS latest 12 retained, oldest payload evicted atomically, newest survives reload without any product request')
  assert.deepEqual(interceptionErrors, [])
} finally {
  await send('Target.disposeBrowserContext', { browserContextId })
  socket.close()
}
