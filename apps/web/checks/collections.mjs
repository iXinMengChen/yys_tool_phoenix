// Background CDP regression with synthetic ownership, real public catalogs and one real premium image.
// node apps/web/checks/collections.mjs <existing-web-origin> <existing-cdp-origin> [api-prefix=/api]
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
const origin = process.argv[2] ?? 'http://localhost:13475'
const endpoint = process.argv[3]
if (!endpoint) throw Error('Pass the existing Chromium CDP endpoint; this check never launches a browser.')
const apiPrefix = process.argv[4] ?? '/api'
const catalog = (await (await fetch(`${origin}${apiPrefix}/cbg/static`)).json()).data
assert.ok(catalog.collections?.premiumSkins)
assert.equal(catalog.collections.spiritSkins, undefined)
// 旧缓存即使仍包含错误的曜之阁目录，摘要和图鉴也不显示此分类。
catalog.collections.spiritSkins = { '419003': { name: '旧版曜之阁目录', imageUrl: '/cbg/images/sceneskin/419003.png' } }
const realSkinId = 412195
const fixtureHeroId = 219
assert.ok(catalog.collections.premiumSkins[realSkinId])
assert.ok(catalog.heroCatalog[fixtureHeroId])
const premiumIds = [realSkinId, Number(Object.keys(catalog.collections.premiumSkins).find(id => Number(id) !== realSkinId))]
assert.ok(premiumIds[1])
const otherSkinIds = Object.keys(catalog.collections.skins).map(Number).filter(id => !catalog.collections.premiumSkins[id]).slice(0, 80)
assert.ok(otherSkinIds.length > 24, 'need enough official skins to exercise pagination')
const onmyojiSkinId = Number(Object.keys(catalog.collections.skins).map(Number).find(id => !otherSkinIds.includes(id)))
assert.ok(onmyojiSkinId)
// Only the failure case and other categories use synthetic artwork; the first premium goes through the live image API.
const fixturePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII='
const yardId = Number(Object.keys(catalog.collections.yards)[0])
const frameIds = Object.keys(catalog.collections.frames).slice(0, 80).map(Number)
assert.ok(frameIds.length > 24, 'need enough official frames to exercise pagination')
const version = await (await fetch(`${endpoint}/json/version`)).json()
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map(), handlers = new Map(), errors = [], cancelledRequests = new Set()
handlers.set('Network.loadingFailed', ({ params }) => { if (params.canceled) cancelledRequests.add(params.requestId) })
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  const request = pending.get(message.id)
  if (request) { pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(Error(`${request.method}: ${message.error.message}`)); else request.resolve(message.result) }
  else handlers.get(message.method)?.(message)
}
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out`)) }, 30000); pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
}
const { browserContextId } = await send('Target.createBrowserContext')
let sessionId, productRequests = 0
const accountUrl = 'https://yys.cbg.163.com/cgi/mweb/equip/1/collection-test'
const product = { schemaVersion: 1, channel: 'official', sourceUrl: accountUrl, equip: { equip_name: '收藏验证合成商品', price: 100, server_name: '合成区', equip_desc: { name: '收藏验证合成账号', lv: 60, inventory: {}, heroes: {}, collections: { heroSkins: premiumIds, skins: [...premiumIds, ...otherSkinIds, onmyojiSkinId], otherSkins: otherSkinIds, onmyojiSkins: [onmyojiSkinId], heroSkinPairs: [...premiumIds, ...otherSkinIds, onmyojiSkinId].map(skinId => ({ heroId: fixtureHeroId, skinId })), yards: [yardId], frames: frameIds, summonRooms: [], spiritSkins: [419012] } } } }
let oldSnapshot = false
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId).catch(error => { throw new Error(`${error.message}\nExpression: ${expression}`, { cause: error }) })
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}
async function until(expression) {
  const end = Date.now() + 30000
  while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await delay(150) }
  throw Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
}
async function checkInputIcon(selector) {
  const gap = await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const style = getComputedStyle(input); return input.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) - input.parentElement.querySelector('svg').getBoundingClientRect().right })()`)
  assert.ok(gap >= 6, `${selector}: text overlaps icon (gap ${gap}px)`)
}
const button = text => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`
const category = text => `[...document.querySelectorAll('[aria-pressed]')].find(b => b.textContent.includes(${JSON.stringify(text)}))`
handlers.set('Fetch.requestPaused', message => {
  void (async () => {
    const { requestId, request } = message.params
    const pathname = new URL(request.url).pathname
    if (pathname.includes('/cbg/images/')) {
      if (pathname.endsWith(`/skins/${fixtureHeroId}/${realSkinId}.png`)) {
        await send('Fetch.continueRequest', { requestId }, sessionId)
        return
      }
      const failed = pathname.endsWith(`/skins/${fixtureHeroId}/${premiumIds[1]}.png`)
      await send('Fetch.fulfillRequest', { requestId, responseCode: failed ? 404 : 200, responseHeaders: [{ name: 'Content-Type', value: failed ? 'text/plain' : 'image/png' }], body: failed ? '' : fixturePng }, sessionId)
      return
    }
    if (pathname.endsWith('/cbg/product')) productRequests++
    const payload = oldSnapshot ? { ...product, equip: { ...product.equip, equip_desc: { ...product.equip.equip_desc, collections: undefined } } } : product
    const data = pathname.endsWith('/cbg/product') ? payload : pathname.endsWith('/cbg/static') ? catalog : { configured: true, refreshedAt: null }
    await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ code: 200, message: 'success', data })).toString('base64') }, sessionId)
  })().catch(error => errors.push({ error, networkId: message.params.networkId }))
})
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, background: true })
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Network.enable', {}, sessionId)
  await send('Fetch.enable', { patterns: [{ urlPattern: `*${apiPrefix}/cbg/session*` }, { urlPattern: `*${apiPrefix}/cbg/product*` }, { urlPattern: `*${apiPrefix}/cbg/static*` }, { urlPattern: `*${apiPrefix}/cbg/images/*` }] }, sessionId)
  await send('Page.navigate', { url: `${origin}/yys-cbg-inspector/collections` }, sessionId)
  await until('document.body.textContent.includes("先读取一个藏宝阁账号") || document.querySelector("main a[href$=home]")')
  await send('Page.navigate', { url: `${origin}/yys-cbg-inspector/home` }, sessionId)
  await until('document.querySelector("#product-url")')
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    await checkInputIcon('#product-url')
    if (width === 1440 || width === 390) { const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId); writeFileSync(`.tmp/account-input-${width}.png`, Buffer.from(shot.data, 'base64')) }
  }
  await send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
  console.log('PASS product URL icon spacing at 1440/768/390/320px')
  await evaluate(`(() => { const i=document.querySelector('#product-url'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(accountUrl)}); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await evaluate(`${button('读取账号')}.click()`)
  await until('document.querySelector("#collection-summary")')
  assert.equal(productRequests, 1)
  const summary = await evaluate('Object.fromEntries([...document.querySelector("#collection-summary").closest("section").querySelectorAll("dl > div")].map(d=>[d.querySelector("dt").textContent,d.querySelector("dd").textContent]))')
  assert.equal(summary['典藏 / 臻藏'], '2')
  assert.equal(summary['阴阳师皮肤'], '1')
  assert.equal(summary['其他皮肤'], String(otherSkinIds.length))
  assert.equal(summary['头像框'], String(frameIds.length))
  assert.equal(summary['庭院'], '1')
  assert.equal(summary['召唤屋'], '0')
  assert.equal(summary['高级徽章'], '—')
  for (const label of ['全部皮肤', '特殊皮肤 / 碎片', '特殊皮肤Ⅱ', '成就', '御灵皮肤', '术印']) assert.equal(summary[label], undefined)
  await evaluate('document.querySelector("main a[href$=collections]").click()')
  await until('document.querySelector("#collection-list-title")')
  const owned = catalog.collections.premiumSkins[String(premiumIds[0])]
  assert.ok(owned)
  assert.equal(await evaluate(`${category('典藏 / 臻藏')}.textContent`), '典藏 / 臻藏2')
  for (const label of ['阴阳师皮肤', '其他皮肤', '头像框']) assert.equal(await evaluate(`Boolean(${category(label)})`), true)
  for (const label of ['全部皮肤', '特殊皮肤 / 碎片', '特殊皮肤Ⅱ', '成就', '御灵皮肤', '术印']) assert.equal(await evaluate(`Boolean(${category(label)})`), false)
  await until('document.querySelector("main ul").children.length === 2')
  assert.equal(await evaluate('document.querySelector("main select")'), null)
  for (const [label, total] of [['头像框', frameIds.length], ['其他皮肤', otherSkinIds.length]]) {
    await evaluate(`${category(label)}.click()`)
    await until(`document.querySelector('main ul').children.length === Math.min(${total}, getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length * 3)`)
    const pageSize = await evaluate("getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length * 3")
    assert.ok(total > pageSize)
    const nav = `document.querySelector('nav[aria-label="${label}分页"]')`
    assert.equal(await evaluate(`${nav}.querySelector('span').textContent`), `第 1 / ${Math.ceil(total / pageSize)} 页`)
    await evaluate(`${nav}.querySelector('button[aria-label="下一页"]').click()`)
    await until(`document.querySelector('main ul').children.length === ${Math.min(pageSize, total - pageSize)} && ${nav}.querySelector('span').textContent === '第 2 / ${Math.ceil(total / pageSize)} 页'`)
  }
  await evaluate(`${category('阴阳师皮肤')}.click()`)
  await until('document.querySelector("main ul").children.length === 1')
  await evaluate(`${category('典藏 / 臻藏')}.click()`)
  const expectedNames = premiumIds.map(id => catalog.collections.premiumSkins[String(id)].name).sort()
  assert.deepEqual(await evaluate('[...document.querySelectorAll("main ul li figcaption")].map(card => card.textContent.trim()).sort()'), expectedNames)
  assert.equal(await evaluate('document.querySelector("main").textContent.includes("已拥有") || /#\\d+/.test(document.querySelector("main ul").textContent)'), false)
  await evaluate('[...document.querySelectorAll("main ul img")].forEach(img => { img.loading = "eager" })')
  await until('document.querySelectorAll("main ul img").length === 1 && document.querySelector("main ul img").complete && document.querySelector("main ul img").naturalWidth > 0')
  const artwork = await evaluate('(() => { const img = document.querySelector("main ul img"); const r = img.parentElement.getBoundingClientRect(); return { src: img.src, width: img.naturalWidth, height: img.naturalHeight, ratio: r.width / r.height, cardRatio: r.width / img.closest("li").getBoundingClientRect().width, fit: getComputedStyle(img).objectFit } })()')
  assert.ok(artwork.src.endsWith(`/cbg/images/skins/${fixtureHeroId}/${premiumIds[0]}.png`))
  assert.equal(artwork.width, 184)
  assert.equal(artwork.height, 304)
  assert.ok(Math.abs(artwork.ratio - 23 / 38) < 0.01)
  assert.ok(artwork.cardRatio > 0.95, `artwork should span the card width: ${artwork.cardRatio}`)
  assert.equal(artwork.fit, 'contain')
  const failedCard = `[...document.querySelectorAll('main ul li')].find(card => card.textContent.trim() === ${JSON.stringify(catalog.collections.premiumSkins[String(premiumIds[1])].name)})`
  await until(`${failedCard} && !${failedCard}.querySelector('img')`)
  assert.equal(await evaluate(`Boolean(${failedCard}.querySelector('img'))`), false)
  console.log('PASS real premium PNG through live API (184x304), portrait ratio, ordinary skins hidden, failed artwork removed')
  assert.equal(await evaluate('document.querySelectorAll("main ul button").length'), 0)
  assert.equal(await evaluate('document.querySelector("[role=dialog]")'), null)
  for (const label of ['典藏 / 臻藏', '阴阳师皮肤', '其他皮肤', '头像框', '庭院', '召唤屋']) {
    await evaluate(`${category(label)}.click()`)
    assert.equal(await evaluate('document.querySelector("[role=dialog]")'), null)
  }
  await evaluate(`${category('庭院')}.click()`)
  await until('document.querySelector("#collection-list-title").textContent.includes("庭院")')
  await until('document.querySelector("main ul img")')
  const landscape = await evaluate('(() => { const r = document.querySelector("main ul img").parentElement.getBoundingClientRect(); const card = document.querySelector("main ul li").getBoundingClientRect(); return { ratio: r.width / r.height, width: card.width } })()')
  assert.ok(Math.abs(landscape.ratio - 89 / 49) < 0.01)
  assert.ok(landscape.width >= 240, `landscape cards should be readable: ${landscape.width}px`)
  await evaluate(`(() => { const i=document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'no-such-collection'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await until('document.body.textContent.includes("没有符合搜索条件的收藏")')
  await evaluate(`${category('召唤屋')}.click()`)
  await until('document.body.textContent.includes("此分类暂无收藏")')
  assert.equal(await evaluate('document.querySelector("main ul").children.length'), 0)
  await evaluate(`${category('幕间')}.click()`)
  await until('document.body.textContent.includes("此分类尚无持有数据")')
  assert.equal(await evaluate('document.querySelector("main ul").children.length'), 0)
  console.log('PASS owned-only cards, no dialogs across categories, empty/unknown categories, search')
  await evaluate(`${category('其他皮肤')}.click()`)
  for (const dark of [false, true]) {
    await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
    for (const width of [2560, 2229, 1440, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
      await until(`document.querySelector('main ul').children.length === getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length * 3`)
      await checkInputIcon('input[type=search]')
      const layout = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main button, main input, main select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left < -1)}).map(e=>e.textContent)})`)
      assert.ok(layout.scrollWidth <= width + 1, JSON.stringify(layout))
      assert.deepEqual(layout.overflow, [])
      await evaluate('document.querySelector("main").scrollTop = 0; window.scrollTo(0, 0)')
      const density = await evaluate(`(() => { const main=document.querySelector('main').getBoundingClientRect(); const cards=[...document.querySelectorAll('main ul li > figure')].map(b=>b.getBoundingClientRect()); return { columns:getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length, maxCardHeight:Math.max(...cards.map(r=>r.height)), fullRowsInFirstViewport:new Set(cards.filter(r=>r.top>=Math.max(main.top,0)&&r.bottom<=Math.min(main.bottom,innerHeight)).map(r=>Math.round(r.top))).size } })()`)
      const grid = await evaluate(`(() => { const ul=document.querySelector('main ul'); const cards=[...ul.children].map(e=>e.getBoundingClientRect()); return { columns:getComputedStyle(ul).gridTemplateColumns.split(' ').length, count:cards.length, width:cards[0].width, right:cards.at(-1).right, gridRight:ul.getBoundingClientRect().right } })()`)
      assert.equal(grid.count, grid.columns * 3, 'each regular page must contain three complete rows')
      assert.ok(grid.width < 160, `cards should remain compact: ${grid.width}px`)
      assert.ok(Math.abs(grid.right - grid.gridRight) < 2, 'last row must fill available width')
      console.log(`DENSITY ${dark ? 'dark' : 'light'} ${width}px: ${JSON.stringify({ ...density, ...grid })}`)
      if (width !== 320) {
        const topShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
        writeFileSync(`.tmp/collections-top-${dark ? 'dark' : 'light'}-${width}.png`, Buffer.from(topShot.data, 'base64'))
        await evaluate('document.querySelector("#collection-list-title").scrollIntoView({ block: "start" })')
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
        writeFileSync(`.tmp/collections-${dark ? 'dark' : 'light'}-${width}.png`, Buffer.from(shot.data, 'base64'))
      }
    }
  }
  console.log('PASS light/dark layouts at 1440/390/320px; screenshots saved')
  await send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
  await send('Page.reload', {}, sessionId)
  const historyButton = `[...document.querySelectorAll('details button')].find(b => b.textContent.includes('收藏验证合成账号'))`
  await until(`${historyButton} && !${historyButton}.disabled`)
  await evaluate(`document.querySelector('details').open=true; ${historyButton}.click()`)
  await until('document.querySelector("#collection-list-title")')
  assert.equal(productRequests, 1)
  assert.equal(await evaluate(`${category('典藏 / 臻藏')}.textContent`), '典藏 / 臻藏2')
  assert.equal(await evaluate('document.querySelector("main ul").children.length'), 2)
  await evaluate('[...document.querySelectorAll("main ul img")].forEach(img => { img.loading = "eager" })')
  await until('document.querySelector("main ul img")?.naturalWidth === 184 && document.querySelector("main ul img")?.naturalHeight === 304')
  oldSnapshot = true
  await evaluate('document.querySelector("nav a[href$=home]").click()')
  await until('document.querySelector("#product-url")')
  await evaluate(`(() => { const i=document.querySelector('#product-url'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(accountUrl)}); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await evaluate(`${button('读取账号')}.click()`)
  await until('document.body.textContent.includes("此记录尚无收藏持有数据")')
  await evaluate('document.querySelector("main a[href$=collections]").click()')
  await until('document.body.textContent.includes("旧历史没有保存收藏持有数据")')
  assert.equal(await evaluate(`${category('典藏 / 臻藏')}.textContent`), '典藏 / 臻藏—')
  assert.equal(await evaluate('document.querySelector("main ul").children.length'), 0)
  // 页面切换会取消图片请求，只有 Network 已确认的取消可忽略拦截失效。
  assert.deepEqual(errors.filter(({ error, networkId }) => !(cancelledRequests.has(networkId) && error.message === 'Fetch.fulfillRequest: Invalid InterceptionId.')), [])
  console.log('PASS persisted collection IDs restore without product API; old snapshots show unavailable rather than zero')
} finally {
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
  socket.close()
}
