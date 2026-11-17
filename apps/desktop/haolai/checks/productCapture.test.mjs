import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { randomUUID } from 'node:crypto'

const source = ['cbg/product.rs', 'cbg/webview.rs']
  .map((path) => readFileSync(new URL(`../src-tauri/src/${path}`, import.meta.url), 'utf8'))
  .join('\n')
const script = (name) => {
  const match = source.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`))
  assert.ok(match, name)
  return match[1]
}
const requestScript = script('CBG_PRODUCT_REQUEST_SCRIPT')
const captureScript = script('CBG_CAPTURE_SCRIPT')
const takeScriptMatch = source.match(/async fn take_cbg_page_capture[\s\S]*?r#"([\s\S]*?)"#/)
assert.ok(takeScriptMatch)
const takeScript = takeScriptMatch[1]
const nativeScript = (name, id) => {
  const match = source.match(new RegExp(`let ${name} = format!\\(\\s*"([^"\\n]+)"`))
  assert.ok(match, name)
  return match[1].replaceAll('{request_id}', id).replaceAll('{{', '{').replaceAll('}}', '}')
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const calls = []
  class Xhr {
    open() {}
    setRequestHeader() {}
    send() {}
    addEventListener(name, listener) { this.listener = listener }
    complete(body) {
      this.status = 200
      this.responseText = body
      this.listener()
    }
  }
  const context = createContext({
    URL, URLSearchParams, Headers, Request, AbortController,
    crypto: { randomUUID }, XMLHttpRequest: Xhr,
    location: { href: 'https://yys.cbg.163.com/cgi/mweb/equip/20/page-product' },
    fetch(url, options) {
      return new Promise((resolve, reject) => calls.push({ url, options, resolve, reject }))
    },
  })
  context.window = context
  runInContext(captureScript, context)
  return {
    calls, context,
    start(id) {
      const request = {
        requestId: id, apiUrl: 'https://yys.cbg.163.com/cgi/api/get_equip_detail?client_type=h5',
        serverid: '20', ordersn: id, sourceUrl: context.location.href,
        viewLoc: 'home', tfid: 'field', tcid: 'content',
      }
      runInContext(`${requestScript}(${JSON.stringify(request)})`, context)
    },
    poll: (id) => runInContext(nativeScript('poll_script', id), context),
    cleanup: (id) => runInContext(nativeScript('cleanup_script', id), context),
  }
}
const response = (body) => ({ status: 200, text: async () => body, clone() { return this } })

test('late success cannot fulfill the next product, even when abort is ignored', async () => {
  const h = harness()
  h.start('1')
  await flush()
  h.cleanup('1') // native timeout/error cleanup
  assert.equal(h.calls[0].options.signal.aborted, true)
  h.start('2')
  await flush()
  h.calls[0].resolve(response('old-product'))
  await flush()
  assert.equal(h.poll('2'), null)
  // Even after timeout/new request, active responses never enter passive sync.
  assert.equal(h.context.__yysCbgEquipCapture, undefined)
  h.cleanup('1') // delayed cleanup must not cancel product 2
  assert.equal(h.calls[1].options.signal.aborted, false)
  h.calls[1].resolve(response('new-product'))
  await flush()
  assert.equal(h.poll('2').body, 'new-product')
  assert.equal(h.poll('1'), null)
  assert.equal(h.context.__yysCbgEquipCapture, undefined)
})

test('late rejection and passive page capture cannot overwrite a newer product', async () => {
  const h = harness()
  h.start('1')
  await flush()
  h.start('2') // also safe if native cleanup could not execute
  await flush()
  assert.equal(h.calls[0].options.signal.aborted, true)
  h.calls[0].reject(new Error('old request failed'))
  h.context.__yysCbgEquipCapture = { status: 200, body: 'unrelated-page' }
  await flush()
  assert.equal(h.poll('2'), null)
  h.calls[1].resolve(response('new-product'))
  await flush()
  assert.equal(h.poll('2').body, 'new-product')
  assert.equal(h.context.__yysCbgEquipCapture.body, 'unrelated-page')
})

test('cleanup invalidates late body completion and current errors remain visible', async () => {
  const h = harness()
  h.start('1')
  await flush()
  let finishBody
  const body = new Promise((resolve) => { finishBody = resolve })
  h.calls[0].resolve({ status: 200, text: () => body, clone() { return this } })
  await flush()
  h.cleanup('1')
  finishBody('old-product')
  await flush()
  assert.equal(h.context.__yysCbgProductRequest, null)
  assert.equal(h.poll('1'), null)
  assert.equal(h.context.__yysCbgEquipCapture, undefined)
  h.start('2')
  await flush()
  h.calls[1].reject(new Error('current failure'))
  await flush()
  assert.equal(h.poll('2').status, 0)
  assert.match(h.poll('2').body, /current failure/)
})

test('real page fetch still captures passively while active reads stay isolated', async () => {
  const h = harness()
  h.start('1')
  await flush()
  const pageFetch = runInContext("fetch('https://yys.cbg.163.com/cgi/api/get_equip_detail?client_type=h5')", h.context)
  h.calls[1].resolve(response('page-product'))
  await pageFetch
  await flush()
  assert.equal(h.context.__yysCbgEquipCapture.body, 'page-product')
  assert.equal(h.context.__yysCbgEquipCapture.pageUrl, h.context.location.href)
  assert.equal(h.poll('1'), null)
  h.calls[0].resolve(response('active-product'))
  await flush()
  assert.equal(h.poll('1').body, 'active-product')
  assert.equal(h.context.__yysCbgEquipCapture.body, 'page-product')
})

test('slow page fetch is dropped after navigation rather than relabeled as the new product', async () => {
  const h = harness()
  const pending = runInContext("fetch('/cgi/api/get_equip_detail')", h.context)
  h.context.location.href = 'https://yys.cbg.163.com/cgi/mweb/equip/20/next-product'
  h.calls[0].resolve(response('previous-product'))
  await pending
  await flush()
  assert.equal(h.context.__yysCbgEquipCapture, undefined)
})

test('XHR capture is bound to the page at send time', () => {
  const h = harness()
  const xhr = runInContext("new XMLHttpRequest()", h.context)
  xhr.open('POST', '/cgi/api/get_equip_detail')
  xhr.send()
  h.context.location.href = 'https://yys.cbg.163.com/cgi/mweb/equip/20/next-product'
  xhr.complete('previous-product')
  assert.equal(h.context.__yysCbgEquipCapture, undefined)
  const next = runInContext("new XMLHttpRequest()", h.context)
  next.open('POST', '/cgi/api/get_equip_detail')
  next.send()
  next.complete('next-product')
  assert.equal(h.context.__yysCbgEquipCapture.body, 'next-product')
  assert.equal(h.context.__yysCbgEquipCapture.pageUrl, h.context.location.href)
})

test('taking passive capture clears records from a page that has since changed', async () => {
  const h = harness()
  const pending = runInContext("fetch('/cgi/api/get_equip_detail')", h.context)
  h.calls[0].resolve(response('page-product'))
  await pending
  await flush()
  assert.equal(h.context.__yysCbgEquipCapture.body, 'page-product')
  h.context.location.href = 'https://yys.cbg.163.com/cgi/mweb/equip/20/next-product'
  assert.equal(runInContext(takeScript, h.context), null)
  assert.equal(h.context.__yysCbgEquipCapture, null)
  h.context.__yysCbgEquipCapture = { pageUrl: h.context.location.href, body: 'next-product', status: 200 }
  assert.equal(runInContext(takeScript, h.context).body, 'next-product')
  assert.equal(h.context.__yysCbgEquipCapture, null)
})

test('local product request preserves required CBG parameters and credentials', async () => {
  const h = harness()
  h.context.__yysCbgSafeCode = 'test-safe-code'
  h.start('1')
  await flush()
  const { url, options } = h.calls[0]
  assert.match(url, /get_equip_detail\?client_type=h5$/)
  assert.equal(options.credentials, 'include')
  assert.equal(options.referrer, h.context.location.href)
  assert.equal(options.headers['cbg-safe-code'], 'test-safe-code')
  assert.equal(options.headers['x-requested-with'], 'XMLHttpRequest')
  assert.equal(options.body.get('exclude_equip_desc'), '1')
  assert.equal(options.body.get('client_type'), 'h5')
  assert.equal(options.body.get('h5_device'), 'other')
  assert.equal(options.body.get('app_client'), 'other')
  assert.equal(options.body.get('ordersn'), '1')
  assert.equal(options.body.get('exter'), 'direct')
  assert.deepEqual(JSON.parse(options.body.get('traffic_trace')), { field_id: 'field', content_id: 'content' })
})
