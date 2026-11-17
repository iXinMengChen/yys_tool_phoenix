// node apps/web/checks/page-transition.mjs <existing-web-origin> <existing-cdp-origin>
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const origin = process.argv[2] ?? 'http://localhost:13475'
const endpoint = process.argv[3]
if (!endpoint) throw Error('Pass an existing CDP endpoint; no browser or server is started.')
const home = '/yys-cbg-inspector/home'
const prefix = '/yys-cbg-inspector/'
assert.match(await (await fetch(`${origin}${home}`)).text(), /id="product-url"/, 'initial HTML retains the server-rendered account form')
const version = await (await fetch(`${endpoint}/json/version`)).json()
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map(), handlers = new Map(), errors = []
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data), request = pending.get(message.id)
  if (!request) { handlers.get(message.method)?.(message); return }
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(Error(message.error.message))
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
const { browserContextId } = await send('Target.createBrowserContext')
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, background: true })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const call = (method, params) => send(method, params, sessionId)
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const until = async expression => {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) { if (await evaluate(`Boolean(${expression})`)) return; await delay(25) }
    throw Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
  }
  await call('Page.enable')
  // Synthetic account only: never read an existing user's session or account data.
  const accountUrl = 'https://yys.cbg.163.com/cgi/mweb/equip/1/transition-test'
  const product = { schemaVersion: 1, channel: 'official', sourceUrl: accountUrl, equip: { equip_name: '切换动画合成商品', price: 100, server_name: '测试区', equip_desc: { name: '动画验证合成账号', lv: 60, inventory: {}, heroes: {} } } }
  const heldSpeedRequests = []
  let holdSpeedRoute = true
  handlers.set('Fetch.requestPaused', ({ params: { requestId, request } }) => {
    if (new URL(request.url).pathname === prefix + 'speed') {
      if (holdSpeedRoute) heldSpeedRequests.push(requestId)
      else void call('Fetch.continueRequest', { requestId })
      return
    }
    const data = new URL(request.url).pathname.endsWith('/cbg/product') ? product : { configured: true, refreshedAt: null }
    void call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ code: 200, message: 'success', data })).toString('base64') }).catch(error => errors.push(error))
  })
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/cbg/product*' }, { urlPattern: '*/cbg/session*' }, { urlPattern: `*${prefix}speed*` }] })
  await call('Page.navigate', { url: `${origin}${home}` })
  await until(`document.querySelector('#product-url') && Object.keys(document.querySelector('form')).some(key => key.startsWith('__reactProps$'))`)
  await evaluate(`document.querySelector('#product-url').focus()`)
  await call('Input.insertText', { text: accountUrl })
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '读取账号').click()`)
  await until(`document.querySelector('.tool-navigation a')`)
  await evaluate(`window.motionCalls = []; const animate = Element.prototype.animate; Element.prototype.animate = function(frames, options) { if (this.classList.contains('page-transition')) window.motionCalls.push({ path: location.pathname, frames, options }); return animate.call(this, frames, options); }`)
  // Observe real frames: content stays available throughout the route's entrance.
  await evaluate(`window.samples = []; window.sampleFrames = true; requestAnimationFrame(function sample() {
    window.samples.push({ path: location.pathname, busy: document.querySelector('main [aria-busy]')?.getAttribute('aria-busy'), content: !!document.querySelector('main .page-transition'), sliding: !!document.querySelector('.tool-nav-indicator')?.getAnimations().some(a => a.playState === 'running') });
    if (window.sampleFrames) requestAnimationFrame(sample);
  })`)
  const click = async path => {
    const mobile = await evaluate(`!!document.querySelector('button[aria-label="打开导航菜单"]')`)
    if (mobile) {
      await until(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`document.querySelector('button[aria-label="打开导航菜单"]').click()`)
      await until(`document.querySelector('[role="dialog"] nav')`)
    }
    await evaluate(`document.querySelector('${mobile ? '[role="dialog"] ' : ''}nav a[href=${JSON.stringify(path)}]').click()`)
  }
  const ready = async path => {
    await until(`location.pathname === ${JSON.stringify(path)} && document.querySelector('main [aria-busy="false"] .page-transition')`)
    await until(`document.querySelector('.tool-navigation a[aria-current="page"]')?.getAttribute('href') === ${JSON.stringify(path)}`)
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  const previousHeading = await evaluate(`document.querySelector('main h1')?.textContent`)
  await evaluate(`window.departures = []; const departureAnimate = Element.prototype.animate; Element.prototype.animate = function(frames, options) { if (this.classList.contains('page-departure')) window.departures.push({ at: performance.now(), frames, options }); return departureAnimate.call(this, frames, options); }`)
  await click(prefix + 'speed')
  await until(`document.querySelector('.tool-navigation a[aria-current="page"]')?.getAttribute('href') === '${prefix}speed'`)
  assert.ok(heldSpeedRequests.length > 0, 'target route is still waiting on its response')
  assert.equal(await evaluate('location.pathname'), home, 'selection updates before the delayed route commits')
  assert.equal(await evaluate(`document.querySelector('main h1')?.textContent`), previousHeading, 'previous content remains visible while target route waits')
  await until(`[...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('正在切换页面'))`)
  assert.equal(await evaluate(`window.departures.at(-1).options.duration`), 120, 'departure starts while target response is held')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.navigation-loading')).animationDelay`), '0.12s', 'loading follows the departure')
  await until(`getComputedStyle(document.querySelector('.navigation-loading')).opacity === '1' && getComputedStyle(document.querySelector('.page-departure')).opacity === '0'`)
  assert.ok(await evaluate(`document.querySelector('.page-departure').inert`), 'departed controls cannot receive focus')
  const loadingCapture = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync('.tmp/menu-navigation-loading.png', Buffer.from(loadingCapture.data, 'base64'))
  // A second click wins even while the first route response is held.
  await click(prefix + 'collections')
  await ready(prefix + 'collections')
  holdSpeedRoute = false
  for (const requestId of heldSpeedRequests) await call('Fetch.continueRequest', { requestId })
  assert.equal(await evaluate(`document.querySelector('.tool-navigation a[aria-current="page"]').getAttribute('href')`), prefix + 'collections')
  await until(`![...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('正在切换页面'))`)
  console.log('PASS: optimistic menu selection precedes delayed content; global loading clears; latest click wins')
  for (const width of [1440, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    for (const page of ['collections', 'speed', 'pve', 'home']) {
      await click(prefix + page)
      await ready(prefix + page)
    }
    await click(prefix + 'calculator')
    await until(`location.pathname === '${prefix}calculator'`)
    await click(prefix + 'relics')
    await ready(prefix + 'relics')
    await evaluate('history.back()')
    await ready(prefix + 'calculator')
    await evaluate('history.forward()')
    await ready(prefix + 'relics')
  }
  const samples = await evaluate('window.samples')
  assert.ok(samples.length > 0, 'observe rendered navigation frames')
  assert.ok(samples.every(sample => sample.busy === 'false' && sample.content), 'navigation never replaces content with an animation wait')
  const motions = await evaluate('window.motionCalls')
  assert.ok(motions.length >= 12, 'route changes and back/forward replay the entrance')
  assert.ok(motions.every(motion => motion.options.duration === 200 && motion.frames[0].opacity > 0 && motion.frames.at(-1).opacity === 1), 'short, already-visible entrance')
  assert.deepEqual(errors, [])
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await click(home)
  await ready(home)
  assert.ok(await evaluate(`document.querySelector('main .page-transition h1') !== null`))
  assert.equal(await evaluate('window.motionCalls.length'), motions.length, 'reduced motion skips the entrance')
  await evaluate('window.sampleFrames = false')
  console.log(`PASS: SSR, immediate navigation (${samples.length} frames), desktop/mobile, rapid changes, back/forward and reduced motion`)

  await click(prefix + 'calculator')
  await until(`document.querySelector('input[role="switch"]')`)
  // Observe the UI's worker requests without running expensive searches.
  await evaluate(`window.calculationRequests = []; window.Worker = class { postMessage(message) { window.calculationRequests.push(message.request); } terminate() {} }; document.querySelector('select').value = 'speed'; document.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));`)
  const start = () => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '开始单人计算').click()`)
  const stop = async () => {
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '停止').click()`)
    await until(`!document.querySelector('[role="switch"]').disabled`)
  }
  await start()
  await until(`window.calculationRequests.length === 1 && document.querySelector('[role="switch"]').disabled`)
  assert.deepEqual(await evaluate('({ fast: window.calculationRequests[0].filters.fastMode, limit: window.calculationRequests[0].resultLimit })'), { fast: false, limit: 5 })
  assert.ok(await evaluate(`document.querySelector('[role="switch"]').disabled`), 'mode cannot change during a calculation')
  await stop()
  await evaluate(`document.querySelector('[role="switch"]').focus()`)
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  assert.ok(await evaluate(`document.querySelector('[role="switch"]').checked`), 'keyboard toggles fast mode')
  assert.equal(await evaluate('window.calculationRequests.length'), 1, 'toggling does not start calculation')
  await start()
  await until(`window.calculationRequests.length === 2 && document.querySelector('[role="switch"]').disabled`)
  assert.deepEqual(await evaluate('({ fast: window.calculationRequests[1].filters.fastMode, limit: window.calculationRequests[1].resultLimit })'), { fast: true, limit: 1 })
  await stop()
  for (const width of [1440, 768, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await evaluate(`new Promise(resolve => { document.querySelector('[role="switch"]').scrollIntoView({ block: 'center', behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'calculator controls fit viewport')
    for (const theme of ['light', 'dark']) {
      await evaluate(`new Promise(resolve => { document.documentElement.classList.toggle('dark', ${theme === 'dark'}); setTimeout(resolve, 350); })`)
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(`.tmp/calculator-switch-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'))
      await evaluate(`new Promise(resolve => { document.querySelector('.calculator-page h1').scrollIntoView({ block: 'start', behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`)
      const heading = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(`.tmp/calculator-heading-${width}-${theme}.png`, Buffer.from(heading.data, 'base64'))
      await evaluate(`document.querySelector('[role="switch"]').scrollIntoView({ block: 'center', behavior: 'instant' })`)
    }
  }
  await evaluate(`document.querySelector('[role="switch"]').click()`)
  await start()
  await until(`window.calculationRequests.length === 3 && document.querySelector('[role="switch"]').disabled`)
  assert.deepEqual(await evaluate('({ fast: window.calculationRequests[2].filters.fastMode, limit: window.calculationRequests[2].resultLimit })'), { fast: false, limit: 5 }, 'turning fast mode off restores configured result count')
  await stop()
  console.log('PASS: calculator switch, keyboard, no automatic start, disabled while running, fast/normal worker requests and restored result count')
} finally {
  await send('Target.disposeBrowserContext', { browserContextId })
  socket.close()
}
