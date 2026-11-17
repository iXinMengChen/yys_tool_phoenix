// In-memory TypeScript transpilation only; no build, real env, database or upstream access.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const cache = new Map()
const fakeEnv = { cbgLoginCookie: 'test=1; sid=initial-test-sid' }
let productDelay = async ms => { assert.equal(ms, 2000) }
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const filename = fileURLToPath(new URL(`../src/modules/cbg/${name}.ts`, import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText
  const compiledModule = new Module(filename)
  compiledModule.paths = require.resolve.paths('@nestjs/common')
  compiledModule.require = (id) => {
    if (id === '../../env') return { env: fakeEnv }
    if (id === 'node:timers/promises') return { setTimeout: ms => productDelay(ms) }
    if (id === '../../database/prisma.service') return { PrismaService: class {} }
    if (id === '@phoenix/utils') assert.fail('商品服务不应依赖共享转换器')
    if (id.endsWith('.json')) return createRequire(filename)(id)
    if (id.startsWith('./')) return load(id.slice(2))
    return require(id)
  }
  compiledModule._compile(compiled, filename)
  cache.set(name, compiledModule.exports)
  return compiledModule.exports
}
const { CbgUpstream, isAllowedCbgUrl, readCbgBody, maxCbgResponseBytes } = load('cbg-upstream')
const { CbgSessionService, sidFromHeaders, withSid } = load('cbg-session.service')
const { ProductQueryDto } = load('product-query.dto')
const { parseCbgPayload, parseCbgDescription, parseCbgDescriptionFile } = load('cbg-payload')
const { ValidationPipe } = require('@nestjs/common')

test('database diagnostics classify nested adapter errors without leaking credentials or SQL', () => {
  const { databaseError } = load('cbg-database-error')
  for (const [code, hint] of [['42501', '权限不足'], ['42P01', '表结构'], ['28P01', '认证失败'], ['ECONNREFUSED', '连接不可用']]) {
    const error = Object.assign(new Error('postgresql://secret:password@private/db SQL payload'), {
      name: 'PrismaClientKnownRequestError', code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: code, message: 'sensitive SQL' } } },
    })
    const diagnostic = databaseError(error)
    assert.ok(diagnostic.includes(code))
    assert.ok(diagnostic.includes(hint))
    assert.doesNotMatch(diagnostic, /secret|password|private|sensitive|SQL payload/)
  }
  const cycle = { code: 'P2021' }
  cycle.cause = cycle
  assert.match(databaseError(cycle), /P2021/)
  assert.match(databaseError(new Error('private credentials')), /UNKNOWN/)
})

test('fixed upstream whitelist blocks external hosts, credentials, redirects and path traversal', () => {
  assert.equal(isAllowedCbgUrl(new URL('https://yys.cbg.163.com/cgi/api/login_auto')), true)
  assert.equal(isAllowedCbgUrl(new URL('https://cbg-other-desc.res.netease.com/yys/static/equipdesc/sample-1.json')), true)
  for (const url of ['http://yys.cbg.163.com/cgi/api/login_auto', 'https://evil.test/cgi/api/get_equip_detail', 'https://a:b@yys.cbg.163.com/cgi/api/login_auto', 'https://yys.cbg.163.com:8443/cgi/api/login_auto', 'https://yys.cbg.163.com/cgi/api/other', 'https://cbg-other-desc.res.netease.com/yys/static/equipdesc/../other.json']) {
    assert.equal(isAllowedCbgUrl(new URL(url)), false, url)
  }
})

test('response boundary enforces declared and streamed size', async () => {
  assert.equal(await readCbgBody(new Response('{"ok":true}')), '{"ok":true}')
  await assert.rejects(readCbgBody(new Response('x', { headers: { 'content-length': String(maxCbgResponseBytes + 1) } })), /大小限制/)
  await assert.rejects(readCbgBody(new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(maxCbgResponseBytes))
    controller.enqueue(new Uint8Array(1))
    controller.close()
  } }))), /大小限制/)
})

test('SID extraction/rotation stays private and refresh is single-flight', async () => {
  assert.equal(sidFromHeaders(new Headers({ sid: 'sid=rotated-test-sid; Path=/' })), 'rotated-test-sid')
  assert.equal(sidFromHeaders(new Headers({ 'set-cookie': 'a=1; Path=/, sid=cookie-test-sid; HttpOnly' })), 'cookie-test-sid')
  assert.equal(sidFromHeaders(new Headers({ sid: '', 'x-sid': 'alternate-test-sid' })), 'alternate-test-sid')
  assert.equal(sidFromHeaders(new Headers({ sid: 'invalid value', 'set-cookie': 'sid=cookie-test-sid; HttpOnly' })), 'cookie-test-sid')
  assert.equal(sidFromHeaders(new Headers({ 'set-cookie': 'sid=; Max-Age=0, SID=cookie-test-sid; HttpOnly' })), 'cookie-test-sid')
  assert.equal(sidFromHeaders(new Headers({ sid: 'invalid value', 'set-cookie': 'sid=invalid value; HttpOnly' })), undefined)
  assert.equal(withSid('a=1; sid=old; b=2; SID=also-old', 'new'), 'a=1; b=2; sid=new')
  let calls = 0
  const session = new CbgSessionService({ async request(url, init) {
    calls++
    assert.equal(url.hostname, 'yys.cbg.163.com')
    assert.equal(init.headers.cookie, 'test=1; sid=initial-test-sid')
    assert.equal(init.headers.accept, 'application/json, text/javascript, */*; q=0.01')
    assert.equal(init.headers['accept-language'], 'zh-CN,zh;q=0.9,en;q=0.8')
    assert.equal(init.headers['x-requested-with'], 'XMLHttpRequest')
    return { json: { status: 1 }, headers: new Headers({ sid: 'rotated-test-sid' }) }
  } })
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'test-1' })
  const cookies = await Promise.all([session.cookieForProduct(query), session.cookieForProduct(query)])
  assert.equal(calls, 1)
  assert.deepEqual(cookies, ['test=1; sid=rotated-test-sid', 'test=1; sid=rotated-test-sid'])
  assert.deepEqual(Object.keys(session.status()), ['configured', 'refreshedAt'])
  assert.equal(JSON.stringify(session.status()).includes('test-sid'), false)
  const refused = new CbgSessionService({ async request() { return { json: { status: 0 }, headers: new Headers() } } })
  await assert.rejects(refused.cookieForProduct(query), /会话刷新失败/)
  assert.equal(refused.status().refreshedAt, null)
  const previousEnv = { ...fakeEnv }
  try {
    for (const cbgLoginCookie of [
      'auth=1; sid=cookie-test-sid; other=2',
      'auth=1; SID=cookie-test-sid; other=2',
    ]) {
      fakeEnv.cbgLoginCookie = cbgLoginCookie
      let refreshes = 0
      const configured = new CbgSessionService({ async request(_url, init) {
        assert.equal(init.headers.cookie, `auth=1; other=2; sid=${refreshes++ ? 'rotated-test-sid' : 'cookie-test-sid'}`)
        return { json: { status: 1 }, headers: new Headers({ sid: 'rotated-test-sid' }) }
      } })
      assert.equal(configured.status().configured, true)
      assert.equal(await configured.cookieForProduct(query), 'auth=1; other=2; sid=rotated-test-sid')
      assert.equal(await configured.cookieForProduct(query), 'auth=1; other=2; sid=rotated-test-sid')
      assert.equal(refreshes, 2)
    }
    for (const cbgLoginCookie of ['', 'auth=1', 'auth=1; sid=', 'auth=1; sid=bad value', 'auth=1; sid=invalid,value']) {
      fakeEnv.cbgLoginCookie = cbgLoginCookie
      const invalid = new CbgSessionService({ async request() { assert.fail('invalid session must not fetch') } })
      assert.equal(invalid.status().configured, false)
      await assert.rejects(invalid.cookieForProduct(query), (error) => error.getStatus() === 503 && /未配置/.test(error.message))
    }
  } finally { Object.assign(fakeEnv, previousEnv) }
})

test('successful refresh carries rotated login cookies forward and failures preserve the last session', async () => {
  const original = fakeEnv.cbgLoginCookie
  fakeEnv.cbgLoginCookie = 'NTES_SESS=original; retained=x=y; obsolete=1; expired=1; priority=old; sid=initial-test-sid'
  try {
    const headers = new Headers({ sid: 'rotated-test-sid' })
    for (const cookie of [
      'NTES_SESS=next-session; HttpOnly; Secure; Path=/',
      'urs_share_login_token=next-token==; HttpOnly',
      'obsolete=; Max-Age=0; Path=/',
      'expired=; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'priority=kept; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]) headers.append('set-cookie', cookie)
    let response = { json: { status: 1 }, headers }
    let calls = 0
    const expected = 'NTES_SESS=next-session; retained=x=y; priority=kept; urs_share_login_token=next-token==; sid=rotated-test-sid'
    const session = new CbgSessionService({ async request(_url, init) {
      assert.equal(init.headers.cookie, calls++ ? expected : withSid(fakeEnv.cbgLoginCookie, 'initial-test-sid'))
      return response
    } })
    const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'test-1' })
    assert.equal(await session.cookieForProduct(query), expected)
    const refreshedAt = session.status().refreshedAt
    response = { json: { status: 2 }, headers: new Headers({ sid: 'rejected-sid', 'set-cookie': 'NTES_SESS=; Max-Age=0' }) }
    await assert.rejects(session.cookieForProduct(query), /上游未确认登录/)
    response = { json: { status: 1 }, headers: new Headers({ 'set-cookie': 'NTES_SESS=unconfirmed' }) }
    await assert.rejects(session.cookieForProduct(query), /缺少有效 SID/)
    assert.equal(session.status().refreshedAt, refreshedAt)
    response = { json: { status: 1 }, headers: new Headers({ sid: 'rotated-test-sid' }) }
    assert.equal(await session.cookieForProduct(query), expected)
    assert.equal(calls, 4)
    assert.doesNotMatch(JSON.stringify(session.status()), /next-session|next-token|rotated-test-sid/)
  } finally { fakeEnv.cbgLoginCookie = original }
})

test('login business rejection never rotates SID even when a new cookie is returned', async () => {
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'test-1' })
  let responseBody = { status: 0 }
  const session = new CbgSessionService({ async request(_url, init) {
    assert.equal(init.headers.cookie, 'test=1; sid=initial-test-sid')
    return { json: responseBody, headers: new Headers({ 'set-cookie': 'sid=rotated-test-sid; HttpOnly' }) }
  } })
  for (const status of [0, '0', -1, undefined]) {
    responseBody = { status }
    await assert.rejects(session.cookieForProduct(query), /会话刷新失败/)
    assert.equal(session.status().refreshedAt, null)
  }
  responseBody = { status: '1' }
  assert.equal(await session.cookieForProduct(query), 'test=1; sid=rotated-test-sid')
  assert.ok(session.status().refreshedAt)
})

test('refresh diagnostics distinguish business rejection from missing SID without exposing response data', async () => {
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'test-1' })
  const secret = 'private-test-cookie'
  let response = { json: { status: 0, status_code: '401', msg: secret }, headers: new Headers({ sid: secret }) }
  const session = new CbgSessionService({ async request(_url, init) {
    assert.equal(init.headers.cookie, 'test=1; sid=initial-test-sid')
    return response
  } })
  for (const statusCode of ['401', secret, '12345678901']) {
    response.json.status_code = statusCode
    await assert.rejects(session.cookieForProduct(query), error => {
      assert.equal(error.getStatus(), 502)
      assert.match(error.message, /上游未确认登录/)
      assert.ok(error.message.includes(`status=0，status_code=${statusCode === '401' ? '401' : 'unknown'}`))
      assert.equal(String(error.stack).includes(secret), false)
      return true
    })
    assert.equal(session.status().refreshedAt, null)
  }
  response = { json: { status: 1 }, headers: new Headers({ sid: 'invalid value' }) }
  await assert.rejects(session.cookieForProduct(query), /登录响应缺少有效 SID 响应头/)
  assert.equal(session.status().refreshedAt, null)
  // Failure leaves the original SID intact and releases the single-flight lock.
  response = { json: { status: 1 }, headers: new Headers({ sid: '', 'set-cookie': 'sid=rotated-test-sid; HttpOnly' }) }
  assert.equal(await session.cookieForProduct(query), 'test=1; sid=rotated-test-sid')
  assert.ok(session.status().refreshedAt)
})

test('Nest DTO rejects SID inputs and invalid IDs', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
  const metadata = { type: 'query', metatype: ProductQueryDto }
  assert.equal((await pipe.transform({ serverid: '1', ordersn: 'test-1' }, metadata)).channel, 'official')
  await assert.rejects(pipe.transform({ serverid: '1', ordersn: 'test-1', sid: 'test' }, metadata))
  await assert.rejects(pipe.transform({ serverid: '1', ordersn: '../bad' }, metadata))
})

test('third-party envelope and description JSON are validated', () => {
  assert.ok(parseCbgPayload({ equip: { equip_desc: '{"inventory":{}}' } }).equip)
  assert.deepEqual(parseCbgDescriptionFile({ equip_desc: { inventory: {} } }), { inventory: {} })
  assert.throws(() => parseCbgPayload({ equip: [] }), /格式异常/)
  assert.throws(() => parseCbgDescriptionFile({ equip_desc: 42 }), /格式异常/)
  assert.throws(() => parseCbgDescription('{invalid-json'), /格式异常/)
  assert.throws(() => parseCbgDescription({ inventory: { bad: { pos: 2, suitid: 1, rattr: [[{}, 0.99]] } } }), /结构异常/)
  assert.throws(() => parseCbgDescription({ heroes: { bad: { heroId: 1, skinfo: 'bad' } } }), /结构异常/)
  assert.ok(parseCbgDescription({ hero_history: { ssr: { all: 1, got: 1, 1: ['name', 1] } } }))
  assert.ok(parseCbgDescription({ inventory: { relic: { pos: 1, suitid: 1, single_attr: [] } } }))
  assert.deepEqual(parseCbgDescription({ hero_history: { unknown: { private: {} }, ssr: { ignored: { private: {} }, all: '0', got: '0' } }, damo_count_dict: { bag: { unused: {} } } }), {
    hero_history: { ssr: { all: '0', got: '0' } }, damo_count_dict: { bag: {} },
  })
  for (const detail of [
    [], null, { money: 'not-a-number' }, { money: Infinity },
    { heroes: { a: { heroId: 100, skinfo: [[1]] } } },
    { inventory: { a: { pos: 1, suitid: 1, attrs: [['速度']] } } },
    { inventory: { a: { pos: 1, suitid: 1, rattr: [['speedAdditionVal', 'bad']] } } },
    { hero_history: { ssr: { '100': ['ignored', 'bad'] } } },
    { damo_count_dict: { bag: { '411': 'bad' } } },
  ]) assert.throws(() => parseCbgDescription(detail), /结构异常/)
})

function productCache() {
  const rows = new Map()
  const writes = []
  const key = identity => JSON.stringify([identity.channel, identity.serverId, identity.orderSn])
  return {
    rows, writes,
    accountSnapshot: {
      async findUnique({ where }) { return rows.get(key(where.channel_serverId_orderSn)) ?? null },
      async upsert({ where, create, update }) {
        const id = key(where.channel_serverId_orderSn)
        const row = rows.has(id) ? { ...rows.get(id), ...update } : create
        rows.set(id, row)
        writes.push(row)
        return row
      },
    },
  }
}

test('product caches only pruned raw data without conversion and completes missing descriptions', async () => {
  const { CbgService } = load('cbg.service')
  for (const missing of [undefined, null, '']) {
    const calls = []
    const database = productCache()
    const service = new CbgService({
      assertAvailable() {},
      async request(url, init) {
        calls.push({ url, init })
        return { json: calls.length === 1
          ? { equip: { price: '100', equip_desc: missing, sid: 'private-test-only', ordersn: 'private-test-only', seller: { phone: 'private-test-only' } }, cookie: 'private-test-only' }
          : { equip_desc: { inventory: {}, money: '123', phone: 'private-test-only' }, sid: 'private-test-only' } }
      },
    }, { async cookieForProduct() { return 'sid=private-test-only' } }, { get() { assert.fail('product must not load static data') } }, database)
    const result = await service.product(Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'test-1', view_loc: 'not-persisted', tfid: 'private-tracking', tcid: 'private-content' }))
    assert.equal(calls.length, 2)
    assert.equal(calls[0].init.headers.cookie, 'sid=private-test-only')
    assert.equal(calls[0].init.body.get('view_loc'), 'not-persisted')
    assert.equal(calls[1].url.href, 'https://cbg-other-desc.res.netease.com/yys/static/equipdesc/test-1.json')
    assert.equal(calls[1].init.headers.cookie, undefined)
    assert.deepEqual(result, {
      schemaVersion: 1, channel: 'official', sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/1/test-1',
      equip: { price: '100', equip_desc: { inventory: {}, money: '123' } },
    })
    assert.doesNotMatch(JSON.stringify(result), /private-test-only|not-persisted|private-tracking|private-content/)
    assert.deepEqual(database.writes[0].accountPayload, result)
    assert.deepEqual(database.writes[0].relicPayload, {})
    assert.equal(database.writes[0].expiresAt - database.writes[0].cachedAt, 3 * 24 * 60 * 60 * 1000)
    assert.doesNotMatch(JSON.stringify(database.writes), /private-test-only|not-persisted|private-tracking|private-content/)
  }
})

test('product cache cleanup only removes expired current-format rows and releases its timer', () => {
  const { CbgService } = load('cbg.service')
  let deletion
  const service = new CbgService({}, {}, {}, { accountSnapshot: {
    async deleteMany(args) { deletion = args },
  } })
  service.onModuleInit()
  const timer = service.cleanupTimer
  service.onModuleDestroy()
  assert.equal(deletion.where.relicVersion, 'cbg-product-v1')
  assert.ok(deletion.where.expiresAt.lte instanceof Date)
  assert.equal(timer._idleTimeout, -1)
})

test('all channels normalize equip_data and inline descriptions without sending official credentials to other hosts', async () => {
  const { CbgService } = load('cbg.service')
  for (const [channel, host] of Object.entries({ official: 'yys.cbg.163.com', huawei: 'yys-huawei.cbg.163.com', oppo: 'yys-oppo.cbg.163.com', vivo: 'yys-vivo.cbg.163.com', xiaomi: 'yys-xiaomi.cbg.163.com' })) {
    for (const description of [{ inventory: {}, sid: 'private-test-only' }, '{"inventory":{},"sid":"private-test-only"}']) {
      let refreshes = 0
      let calls = 0
      const service = new CbgService({
        assertAvailable() {},
        async request(url, init) {
          calls++
          assert.equal(url.href, `https://${host}/cgi/api/get_equip_detail?client_type=h5`)
          assert.equal(init.headers.cookie, channel === 'official' ? 'sid=private-test-only' : undefined)
          return { json: { equip_data: { equip_desc: description, price: 0 }, extra: 'private-test-only' } }
        },
      }, { async cookieForProduct() { refreshes++; return 'sid=private-test-only' } }, {}, productCache())
      assert.deepEqual(await service.product(Object.assign(new ProductQueryDto(), { channel, serverid: '1', ordersn: 'test-1' })), {
        schemaVersion: 1, channel, sourceUrl: `https://${host}/cgi/mweb/equip/1/test-1`, equip: { price: 0, equip_desc: { inventory: {} } },
      })
      assert.equal(calls, 1)
      assert.equal(refreshes, channel === 'official' ? 1 : 0)
    }
  }
})

test('product database cache survives service recreation, isolates identities and refreshes expired or legacy rows', async () => {
  const { CbgService } = load('cbg.service')
  const database = productCache()
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'cached-1' })
  let calls = 0
  let refreshes = 0
  const upstream = {
    assertAvailable() {},
    async request() {
      calls++
      return { json: { equip: { price: calls, equip_desc: { inventory: {}, skin: { ss: [[200, 'private-test-only', 1001, 0]] } } } } }
    },
  }
  const session = { async cookieForProduct() { refreshes++; return 'sid=private-test-only' } }
  const service = new CbgService(upstream, session, {}, database)
  const [first, concurrent] = await Promise.all([service.product(query), service.product({ ...query, tfid: 'different-tracking' })])
  assert.deepEqual(first, concurrent)
  assert.equal(calls, 1, 'concurrent requests for the same identity share upstream work')
  assert.equal(refreshes, 1)
  const blocked = () => assert.fail('cache hits must not check upstream availability or refresh SID')
  const restarted = new CbgService({ assertAvailable: blocked, request: blocked }, { cookieForProduct: blocked }, {}, database)
  assert.deepEqual(await restarted.product(query), first)
  assert.deepEqual(first.equip.equip_desc.collections.heroSkins, [1001])
  assert.deepEqual(first.equip.equip_desc.collections.heroSkinPairs, [{ skinId: 1001, heroId: 200 }])
  for (const change of [{ serverid: '2' }, { ordersn: 'cached-2' }, { channel: 'huawei' }]) await service.product({ ...query, ...change })
  assert.equal(calls, 4, 'channel, server and order each have separate cache keys')
  database.writes[0].expiresAt = new Date(0)
  assert.equal((await service.product(query)).equip.price, 5)
  database.writes.at(-1).relicVersion = 'legacy-converted-snapshot'
  assert.equal((await service.product(query)).equip.price, 6)
  assert.equal(database.rows.size, 4, 'expired entries are replaced without deleting unrelated rows')
  assert.equal(service.pendingProducts.size, 0)
})

test('uncached products queue FIFO with two-second waits; hits bypass the queue and failures do not block it', async () => {
  const { CbgService } = load('cbg.service')
  const database = productCache()
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'seed' })
  const response = { json: { equip: { equip_desc: { inventory: {} } } } }
  const delayEntered = Array.from({ length: 3 }, () => Promise.withResolvers())
  const releaseDelay = Array.from({ length: 3 }, () => Promise.withResolvers())
  const upstreamEntered = Promise.withResolvers()
  const releaseUpstream = Promise.withResolvers()
  const calls = []
  const service = new CbgService({
    assertAvailable() {},
    async request(_url, init) {
      const order = init.body.get('ordersn')
      calls.push(order)
      if (order === 'cold') {
        upstreamEntered.resolve()
        await releaseUpstream.promise
        throw new Error('synthetic upstream failure')
      }
      return response
    },
  }, { async cookieForProduct() {} }, {}, database)
  const seeded = await service.product(query)
  const originalDelay = productDelay
  let waits = 0
  productDelay = async ms => {
    assert.equal(ms, 2000)
    const index = waits++
    delayEntered[index].resolve()
    await releaseDelay[index].promise
  }
  try {
    const cold = assert.rejects(service.product({ ...query, ordersn: 'cold' }), /synthetic upstream failure/)
    const duplicate = assert.rejects(service.product({ ...query, ordersn: 'cold', tfid: 'another-trace' }), /synthetic upstream failure/)
    const second = service.product({ ...query, channel: 'huawei', ordersn: 'second' })
    const third = service.product({ ...query, ordersn: 'third' })
    const thirdDuplicate = service.product({ ...query, ordersn: 'third' })
    await delayEntered[0].promise
    assert.deepEqual(calls, ['seed'], 'no upstream work before first delay ends')
    assert.deepEqual(await service.product(query), seeded, 'cached request bypasses the entire queue')
    assert.equal(waits, 1)
    releaseDelay[0].resolve()
    await upstreamEntered.promise
    assert.equal(waits, 1, 'later delays only start after the prior upstream query completes')
    releaseUpstream.resolve()
    await Promise.all([cold, duplicate])
    await delayEntered[1].promise
    assert.deepEqual(calls, ['seed', 'cold'])
    releaseDelay[1].resolve()
    await second
    await delayEntered[2].promise
    assert.deepEqual(calls, ['seed', 'cold', 'second'])
    releaseDelay[2].resolve()
    const [result, shared] = await Promise.all([third, thirdDuplicate])
    assert.deepEqual(result, shared)
    assert.deepEqual(calls, ['seed', 'cold', 'second', 'third'])
    assert.deepEqual(await service.product({ ...query, ordersn: 'third' }), result)
    assert.equal(waits, 3, 'duplicates and cached responses add no waits')
    assert.equal(service.pendingProducts.size, 0)
  } finally {
    productDelay = originalDelay
    releaseDelay.forEach(gate => gate.resolve())
    releaseUpstream.resolve()
  }
})

test('product cache does not persist upstream errors and permits retry after failure', async () => {
  const { CbgService } = load('cbg.service')
  const database = productCache()
  const query = Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'retry-1' })
  let fail = true
  const service = new CbgService({
    assertAvailable() {},
    async request() {
      if (fail) throw new Error('synthetic upstream failure')
      return { json: { equip: { equip_desc: { inventory: {} } } } }
    },
  }, { async cookieForProduct() {} }, {}, database)
  await assert.rejects(service.product(query), /synthetic upstream failure/)
  assert.equal(database.writes.length, 0)
  assert.equal(service.pendingProducts.size, 0)
  fail = false
  await service.product(query)
  assert.equal(database.writes.length, 1)
})

test('product cache database failures preserve successful queries without leaking errors', async (t) => {
  const { CbgService } = load('cbg.service')
  for (const operation of ['findUnique', 'upsert']) {
    const database = productCache()
    database.accountSnapshot[operation] = async () => { throw new Error('private-connection-test-only') }
    const service = new CbgService({
      assertAvailable() {},
      async request() { return { json: { equip: { equip_desc: { inventory: {} } } } } } },
    { async cookieForProduct() {} }, {}, database)
    const warnings = []
    t.mock.method(service.logger, 'warn', message => warnings.push(message))
    const result = await service.product(Object.assign(new ProductQueryDto(), { serverid: '1', ordersn: 'failure-1' }))
    assert.deepEqual(result.equip.equip_desc, { inventory: {} })
    assert.equal(warnings.length, 1)
    assert.doesNotMatch(JSON.stringify(warnings), /private-connection-test-only/)
  }
})

test('recursive whitelist preserves real converter currencies, skills, dex and enhancement results while removing unknown data', () => {
  const { convertCbgPayloadToDataset, createRelicSuitConfig } = require('@phoenix/utils')
  const suits = require('../src/modules/cbg/data/relic-suits.json')
  const heroes = require('../src/modules/cbg/data/heroes.json')
  assert.equal(Object.keys(heroes.heroesById).length, heroes.heroCount)
  assert.ok(heroes.heroCount > 200)
  assert.ok(suits.yuhun_list.length > 60)
  const privateData = { sid: 'private-test-only', phone: 'private-test-only' }
  const original = {
    equip: {
      price: '12345', equip_name: '测试商品', format_equip_name: '备用名称', server_name: '测试服务器', status_desc: '上架中',
      highlights: ['散件一速 160.12', '招财一速 150.34', '3头 4尾'], ordersn: 'private-test-only', seller: privateData,
      equip_desc: {
        name: '测试账号', origin_server_name: '原服务器', lv: '60', fengzidu: '1234', pvp_score: '2500', pvp_stage: '名士',
        equips_summary: '123', hero_summary: '456', money: '987654321', strength: '0', currency_900273: '456', level_15: '20',
        goyu: '1200', soul_jade: '999', gameble_card: '2', ar_gamble_card: '3', ssr_coin: '0', sp_coin: '1', currency_490017: '4',
        currency_900215: privateData, seller: privateData,
        hero_history: {
          ssr: { all: '4', got: '2', '100': ['private-test-only', '1', privateData], '200': [privateData, 1], '300': ['private-test-only', '0'], '400': ['private-test-only', 0], profile: privateData },
          sp: { all: '3', got: '0', '500': ['private-test-only', 0], privateData },
          ur: { all: 1, got: 1, '600': 1 }, privateData,
        },
        damo_count_dict: { bag: { '411': '2', '412': privateData }, mail: { '411': 3, phone: privateData } },
        heroes: {
          a: { heroId: '100', heroUid: 'a', name: '测试式神', rarity: '4', lv: '40', skinfo: [['1', '5', privateData], [2, 3], [3, 4]], selectSkills: ['3', '1', '2'], privateData },
          b: { heroId: 101, uid: 'b', level: '35', skinfo: [[1, 2]], rarity: null, privateData },
          c: { heroId: '102', heroLevel: '30', skinfo: [['1', '4']] },
          d: { heroId: '103', hero_level: '25', skinfo: [[1, 3]], selectSkills: [] },
        },
        inventory: {
          a: { uuid: 'r1', level: '15', qua: '6', pos: '2', suitid: '300001', name: '测试御魂', attrs: [['速度', '57', privateData], ['暴击', '3%']], rattr: [['speedAdditionVal', '0.99', privateData], ['critRateAdditionVal', 0.87]], single_attr: ['效果命中', '15%', privateData], privateData },
          b: { uuid: 2, level: '0', qua: '6', pos: 1, suitid: 300001, name: null, attrs: [['攻击', 65]], rattr: [], single_attr: [] },
        },
      },
    },
    privateData,
  }
  const parsed = parseCbgPayload(original)
  const pruned = { equip: { ...parsed.equip, equip_desc: parseCbgDescription(parsed.equip.equip_desc) } }
  assert.doesNotMatch(JSON.stringify(pruned), /private-test-only|privateData|seller|phone|currency_900215|412/)
  assert.deepEqual(pruned.equip.equip_desc.hero_history.ssr, { all: '4', got: '2', '100': ['', '1'], '200': ['', 1], '300': ['', '0'], '400': ['', 0] })
  assert.deepEqual(pruned.equip.equip_desc.damo_count_dict, { bag: { '411': '2' }, mail: { '411': 3 } })
  assert.deepEqual(pruned.equip.equip_desc.heroes.a.skinfo[0], ['1', '5'])
  assert.deepEqual(pruned.equip.equip_desc.inventory.a.rattr[0], ['speedAdditionVal', '0.99'])
  assert.deepEqual(pruned.equip.equip_desc.inventory.a.attrs[0], ['速度', '57'])
  assert.deepEqual(pruned.equip.equip_desc.inventory.a.single_attr, ['效果命中', '15%'])
  const config = createRelicSuitConfig(suits)
  for (const options of [{}, { includeEnhancementStages: false }]) {
    assert.deepEqual(convertCbgPayloadToDataset(pruned, config, options), convertCbgPayloadToDataset(original, config, options))
  }
  const result = convertCbgPayloadToDataset(pruned, config)
  assert.equal(result.account.price, 123.45)
  assert.equal(result.account.money, 987654321)
  assert.equal(result.account.stamina, 456)
  assert.equal(result.account.yuxingDama, 5)
  assert.equal(result.account.soulJade, 1200)
  assert.equal(result.account.summonPower, 18)
  assert.deepEqual(result.account.shikigamiDex.ssr, { owned: 2, total: 2 })
  assert.deepEqual(result.heroes.map((hero) => hero.level), [40, 35, 30, 25])
  assert.deepEqual(result.heroes[0].skillLevels, [4, 5, 3])
  assert.equal(result.relicsByPosition['2'][0].mainAttribute.value, 57)
  assert.equal(result.relicsByPosition['2'][0].detail.enhancementStages.length, 6)
  assert.ok(Math.abs(result.relicsByPosition['2'][0].enhancement.totals[0].total - 2.97) < 1e-12)
  // Nullish fields and the fallback currency/title/server branches remain converter-equivalent.
  const nullish = { equip: { price: null, equip_name: null, format_equip_name: '备用名称', server_name: null, highlights: null, status_desc: null, equip_desc: {
    name: null, origin_server_name: '原服务器', lv: null, fengzidu: null, pvp_score: null, pvp_stage: 0,
    equips_summary: null, hero_summary: null, money: null, strength: null, currency_900273: '123', level_15: null,
    goyu: null, soul_jade: '1500', gameble_card: null, ar_gamble_card: null, ssr_coin: null, sp_coin: null, currency_490017: null,
    heroes: null, inventory: null, hero_history: null, damo_count_dict: null,
  } } }
  const cleanNullish = parseCbgPayload(nullish)
  cleanNullish.equip.equip_desc = parseCbgDescription(cleanNullish.equip.equip_desc)
  assert.deepEqual(convertCbgPayloadToDataset(cleanNullish, config), convertCbgPayloadToDataset(nullish, config))
  assert.equal(convertCbgPayloadToDataset(cleanNullish, config).account.soulJade, 1500)
})

test('static scripts accept only validated JSON assignments, never executable JavaScript', () => {
  const { parseGameConfigScript, parseServerListScript } = load('cbg-static.service')
  const suits = { ...require('../src/modules/cbg/data/relic-suits.json'), hero_list: [[200, '桃花妖', 3, 'taohuayao']], achieve_list: { '1': { name: '成就', desc: '未来功能资料' } }, skin_list: { '410101': '森罗万象' }, future_section: { nested: [1, null, true] } }
  assert.deepEqual(parseGameConfigScript(`var CBG_GAME_CONFIG=${JSON.stringify(suits)};`), suits)
  assert.deepEqual(parseServerListScript('var product_name="yys"; var server_data={"1":[["一区"],[[1,"服务器","2"]]]};'), [{ id: '1', name: '一区', servers: [{ id: '2', name: '服务器' }] }])
  assert.throws(() => parseGameConfigScript('var CBG_GAME_CONFIG=(globalThis.injected=true);'), /格式异常/)
  assert.throws(() => parseGameConfigScript(`var CBG_GAME_CONFIG=${JSON.stringify(suits)}; process.exit();`), /格式异常/)
  assert.throws(() => parseServerListScript('var product_name="other"; var server_data={};'), /格式异常/)
  assert.throws(() => parseGameConfigScript('var CBG_GAME_CONFIG={"hero_list":[]};'), /格式异常/)
  assert.equal(globalThis.injected, undefined)
})

function staticDatabase(initialRows = [], initialConfig = null, initialSuits = []) {
  let rows = structuredClone(initialRows)
  let config = structuredClone(initialConfig)
  let suits = structuredClone(initialSuits)
  function createMany(target, { data, skipDuplicates }) {
    assert.equal(skipDuplicates, true)
    let count = 0
    for (const row of data) {
      if (target.some((existing) => existing.id === row.id || existing.slug === row.slug)) continue
      target.push(structuredClone(row))
      count++
    }
    db.writes += count
    return { count }
  }
  const db = {
    writes: 0, failCommit: false,
    heroCatalog: {
      async count() { return rows.length },
      async createMany(args) { return createMany(rows, args) },
      async findMany() { return structuredClone(rows) },
      async update({ where, data }) { Object.assign(rows.find((row) => row.id === where.id), data); db.writes++ },
      async create({ data }) { rows.push(structuredClone(data)); db.writes++ },
    },
    relicSuitCatalog: {
      async count() { return suits.length },
      async createMany(args) { return createMany(suits, args) },
      async findMany() { return structuredClone(suits) },
    },
    cbgGameAutoConfig: {
      async findUnique() { return structuredClone(config) },
      async upsert({ create }) { config = structuredClone(create); db.writes++ },
    },
    async $transaction(action) {
      const previous = structuredClone({ rows, config, suits })
      try {
        const result = await action(db)
        if (db.failCommit) throw new Error('mock commit failure')
        return result
      } catch (error) { rows = previous.rows; config = previous.config; suits = previous.suits; throw error }
    },
  }
  return db
}

const databasePanel = {
  id: 200, name: '数据库名称', slug: 'database-name', level: 'SR',
  attack: '2385.1250', health: '12532.7600', defense: '490.9200', speed: '100.0000',
  critRate: '5.0000', critDamage: '150.0000', effectHit: '0.0000', effectResistance: '20.0000',
  lowestRank: '155', isCollaboration: false, additionalAttributes: null, additionalAttributesValue: 0,
}

test('startup seeds empty catalog tables atomically, preserves existing data and retries after rollback', async (t) => {
  const { CbgStaticService } = load('cbg-static.service')
  const heroes = require('../src/modules/cbg/data/heroes.json').heroesById
  const relics = require('../src/modules/cbg/data/relic-suits.json')
  // Isolate catalog initialization from the existing background official refresh and daily timer.
  t.mock.method(CbgStaticService.prototype, 'refresh', async function () { return this.current })
  t.mock.method(globalThis, 'setInterval', () => ({ unref() {} }))
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('catalog initialization must be offline') })
  const db = staticDatabase()
  const service = new CbgStaticService(db)
  await service.onModuleInit()
  const rows = await db.heroCatalog.findMany()
  const suits = await db.relicSuitCatalog.findMany()
  assert.equal(rows.length, Object.keys(heroes).length)
  assert.equal(suits.length, relics.yuhun_list.length)
  const { databaseHeroPanel } = load('cbg-catalog-sync')
  for (const row of rows) {
    const bundled = heroes[String(row.id)]
    assert.deepEqual(databaseHeroPanel(row).baseStats, bundled.baseStats)
    assert.equal(row.lowestRank, String(bundled.lowestRank))
    assert.equal(row.isCollaboration, bundled.isCollaboration ?? false)
    assert.equal(row.additionalAttributes, null)
    assert.equal(row.additionalAttributesValue, 0)
  }
  assert.deepEqual(suits.map((row) => [row.id, row.name, row.slug, row.twoPieceAttribute, row.twoPieceEffect]), relics.yuhun_list)
  assert.deepEqual(suits.filter((row) => row.isOma).map((row) => String(row.id)).sort(), Object.keys(relics.two_suit_yuhun).sort())
  assert.equal((await service.get()).heroBaseStatsSource, 'database')
  assert.equal(await db.cbgGameAutoConfig.findUnique(), null)
  const writes = db.writes
  await new CbgStaticService(db).onModuleInit()
  assert.equal(db.writes, writes)
  assert.deepEqual(await db.heroCatalog.findMany(), rows)
  assert.deepEqual(await db.relicSuitCatalog.findMany(), suits)

  const existingSuit = { ...suits[0], name: '手工维护套装', twoPieceEffect: '保留效果' }
  const preserved = staticDatabase([databasePanel], null, [existingSuit])
  await new CbgStaticService(preserved).onModuleInit()
  assert.equal(preserved.writes, 0)
  assert.deepEqual(await preserved.heroCatalog.findMany(), [databasePanel])
  assert.deepEqual(await preserved.relicSuitCatalog.findMany(), [existingSuit])
  for (const [initialHeroes, initialSuits] of [[[databasePanel], []], [[], [existingSuit]]]) {
    const partial = staticDatabase(initialHeroes, null, initialSuits)
    await new CbgStaticService(partial).onModuleInit()
    assert.deepEqual(await partial.heroCatalog.findMany(), initialHeroes.length ? initialHeroes : rows)
    assert.deepEqual(await partial.relicSuitCatalog.findMany(), initialSuits.length ? initialSuits : suits)
  }

  const failedDb = staticDatabase()
  failedDb.failCommit = true
  const failed = new CbgStaticService(failedDb)
  await failed.onModuleInit()
  assert.deepEqual(await failedDb.heroCatalog.findMany(), [])
  assert.deepEqual(await failedDb.relicSuitCatalog.findMany(), [])
  assert.equal((await failed.get()).heroBaseStatsSource, 'bundled')
  failedDb.failCommit = false
  await new CbgStaticService(failedDb).onModuleInit()
  assert.deepEqual(await failedDb.heroCatalog.findMany(), rows)
  assert.deepEqual(await failedDb.relicSuitCatalog.findMany(), suits)

  const concurrentDb = staticDatabase()
  await Promise.all([new CbgStaticService(concurrentDb).onModuleInit(), new CbgStaticService(concurrentDb).onModuleInit()])
  assert.equal(await concurrentDb.heroCatalog.count(), rows.length)
  assert.equal(await concurrentDb.relicSuitCatalog.count(), suits.length)
})

test('static default reads database panels and official metadata, preserving decimal and percentage units', async () => {
  const { CbgStaticService } = load('cbg-static.service')
  const { parseGameConfigScript } = load('cbg-static-payload')
  const config = parseGameConfigScript('var CBG_GAME_CONFIG={"hero_list":[[200,"官方名称",3,"official"],[611,"未知面板",4,"unknown"]],"yuhun_list":[[1,"数据库套装","new","攻击加成15%",""]],"two_suit_yuhun":{},"skin_list":{"410101":"森罗万象"},"collection_skin_data":{"412195":"典藏"},"head_skin_list":{"101":{"name":"头像框"}}};')
  const db = staticDatabase([databasePanel], { payload: config, syncedAt: new Date('2026-11-11T00:00:00Z') })
  const service = new CbgStaticService(db)
  const data = await service.get()
  assert.equal(service.imageSource('frames', '101'), 'https://cbg-yys.res.netease.com/game_res/headskin/101.png')
  assert.equal(service.imageSource('frames', '999'), undefined)
  assert.equal(data.source, 'database')
  assert.equal(data.heroBaseStatsSource, 'mixed')
  assert.equal(data.heroes.heroesById['200'].name, '官方名称')
  assert.deepEqual(data.heroes.heroesById['200'].baseStats, { attack: 2385.125, health: 12532.76, defense: 490.92, speed: 100, critRate: 5, critDamage: 150, effectHit: 0, effectResistance: 20 })
  assert.deepEqual(data.heroCatalog['611'], { id: 611, name: '未知面板', rarityCode: 4, slug: 'unknown' })
  assert.equal(data.heroes.heroesById['611'], undefined)
  assert.deepEqual(data.missingHeroIds, [611])
  assert.deepEqual(data.collections.skins, { '410101': { name: '森罗万象', imageUrl: '/cbg/images/skins/10/410101.png' } })
  assert.equal(data.collections.frames['101'].imageUrl, '/cbg/images/headskin/101.png')
  assert.equal(data.relicSuits.yuhun_list[0][1], '数据库套装')
  assert.equal(data.refreshedAt, '2026-11-11T00:00:00.000Z')
  assert.equal(db.writes, 0)
  const bundled = require('../src/modules/cbg/data/heroes.json').heroesById
  const completeRows = Object.values(bundled).map((hero) => ({ ...databasePanel, ...hero, ...hero.baseStats, lowestRank: String(hero.lowestRank) }))
  assert.equal((await new CbgStaticService(staticDatabase(completeRows)).get()).heroBaseStatsSource, 'database')
  const unavailable = staticDatabase()
  unavailable.heroCatalog.findMany = async () => { throw new Error('mock unavailable') }
  const fallbackService = new CbgStaticService(unavailable)
  const fallback = await fallbackService.get()
  assert.equal(fallback.source, 'bundled')
  assert.equal(fallback.heroBaseStatsSource, 'bundled')
  const heroId = Object.keys(fallback.heroCatalog)[0]
  const suitId = String(fallback.relicSuits.yuhun_list[0][0])
  assert.equal(fallbackService.imageSource('heroes', heroId), `https://cbg-yys.res.netease.com/game_res/hero/${heroId}/${heroId}.png`)
  assert.equal(fallbackService.imageSource('suits', suitId), `https://cbg-yys.res.netease.com/game_res/suit/${suitId}.png`)
  assert.equal(fallbackService.imageSource('heroes', '999999999999'), undefined)
  assert.equal(fallbackService.imageSource('frames', '101'), undefined)
})

test('premium images from saved hero/skin IDs work after restart without a product query', async () => {
  const { CbgStaticService } = load('cbg-static.service')
  const { parseGameConfigPayload } = load('cbg-static-payload')
  const config = parseGameConfigPayload({
    hero_list: [[219, '酒吞童子', 4, 'jiutuntongzi']], yuhun_list: [[1, '套装', '', '', '']], two_suit_yuhun: {},
    collection_skin_data: { '412195': '响魂醉曲' },
  })
  const db = staticDatabase([], { payload: config, syncedAt: new Date('2026-11-11T00:00:00Z') })
  for (let restart = 0; restart < 2; restart++) {
    const service = new CbgStaticService(db)
    await service.get()
    assert.equal(service.imageSource('premiumSkins', '412195', '219'), 'https://cbg-yys.res.netease.com/game_res/hero/219/skin/412195.png')
    for (const heroId of [undefined, '../219', '219?x=1', '999999']) assert.equal(service.imageSource('premiumSkins', '412195', heroId), undefined)
    assert.equal(service.imageSource('premiumSkins', '999999', '219'), undefined)
  }
  assert.equal(db.writes, 0)
})

test('onmyoji artwork works without hero_list entries or legacy saved pairs', () => {
  const { parseGameConfigPayload, collectionCatalog } = load('cbg-static-payload')
  const { collectionImageSource } = load('collection-image-source')
  const samples = [[410103, 10], [410201, 11], [410301, 12], [410401, 13], [410501, 15], [410601, 16]]
  const config = parseGameConfigPayload({
    hero_list: [[219, '酒吞童子', 4, 'jiutuntongzi']], yuhun_list: [[1, '套装', '', '', '']], two_suit_yuhun: {},
    skin_list: Object.fromEntries(samples.map(([id]) => [id, `皮肤${id}`])),
  })
  const catalog = collectionCatalog(config)
  for (const [skin, hero] of samples) {
    const source = `https://cbg-yys.res.netease.com/game_res/hero/${hero}/skin/${skin}.png`
    assert.equal(collectionImageSource('skins', String(skin), config), source)
    assert.equal(collectionImageSource('skins', String(skin), config, String(hero)), source)
    assert.equal(collectionImageSource('onmyojiSkins', String(skin), config, String(hero)), source)
    assert.equal(catalog.skins[skin].imageUrl, `/cbg/images/skins/${hero}/${skin}.png`)
  }
  for (const hero of ['14', '999999', '../10', '10?x=1']) assert.equal(collectionImageSource('skins', '410103', config, hero), undefined)
  assert.equal(collectionImageSource('skins', '410199', config), undefined)
})

test('official hero sync changes only metadata, inserts trusted panels and reports missing panels', async () => {
  const { syncOfficialHeroes } = load('cbg-catalog-sync')
  const { parseGameConfigScript } = load('cbg-static-payload')
  const config = parseGameConfigScript('var CBG_GAME_CONFIG={"hero_list":[[200,"新名称",4,"new"],[201,"雪女",3,"xuenv"],[611,"未知面板",4,"unknown"]],"yuhun_list":[[1,"套装","suit","",""]],"two_suit_yuhun":{}};')
  const db = staticDatabase([databasePanel])
  const bundled = require('../src/modules/cbg/data/heroes.json').heroesById
  assert.deepEqual(await db.$transaction((tx) => syncOfficialHeroes(tx, config, bundled)), { insertedHeroes: 1, updatedHeroes: 1, missingPanelHeroes: 1 })
  const rows = await db.heroCatalog.findMany()
  assert.deepEqual(rows.find((row) => row.id === 200), { ...databasePanel, name: '新名称', slug: 'new', level: 'SSR' })
  assert.equal(rows.find((row) => row.id === 201).critDamage, 150)
  assert.equal(rows.find((row) => row.id === 611), undefined)
  assert.deepEqual(await db.$transaction((tx) => syncOfficialHeroes(tx, config, bundled)), { insertedHeroes: 0, updatedHeroes: 0, missingPanelHeroes: 1 })
})

test('static refresh commits before publishing, survives restart, is single-flight and retains old data on failure', async () => {
  const { CbgStaticService } = load('cbg-static.service')
  const { StaticQueryDto } = load('static-query.dto')
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
  const metadata = { type: 'query', metatype: StaticQueryDto }
  assert.equal((await pipe.transform({ refresh: 'true' }, metadata)).refresh, true)
  await assert.rejects(pipe.transform({ refresh: 'no' }, metadata))
  await assert.rejects(pipe.transform({ refresh: 'true', sid: 'forbidden' }, metadata))
  const originalFetch = globalThis.fetch
  try {
    let calls = 0
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(init.redirect, 'error')
      assert.equal(init.headers, undefined)
      if (url.pathname.endsWith('game_auto_config.js')) return new Response('var CBG_GAME_CONFIG={"hero_list":[[200,"远程更新后名称",3,"taohuayao"],[611,"新式神",4,"new"]],"yuhun_list":[[1,"更新套装","new","攻击加成15%",""]],"two_suit_yuhun":{}};')
      return new Response('var product_name="yys"; var server_data={"1":[["新区"],[[1,"新服务器","2"]]]};')
    }
    const db = staticDatabase()
    const service = new CbgStaticService(db)
    assert.equal((await service.get()).source, 'bundled')
    const [a, b] = await Promise.all([service.get(true), service.get(true)])
    assert.equal(calls, 2)
    assert.equal(a, b)
    assert.equal(a.heroes.heroesById['200'].name, '远程更新后名称')
    assert.equal(a.heroBaseStatsSource, 'mixed')
    assert.equal(a.source, 'remote')
    const restarted = await new CbgStaticService(db).get()
    assert.equal(restarted.source, 'database')
    assert.deepEqual(restarted.heroes, a.heroes)
    assert.deepEqual(restarted.heroCatalog, a.heroCatalog)
    assert.deepEqual(restarted.relicSuits, a.relicSuits)
    assert.equal(restarted.refreshedAt, a.refreshedAt)
    assert.equal((await db.cbgGameAutoConfig.findUnique()).sourceHash.length, 64)
    assert.deepEqual(a.missingHeroIds, [611])
    assert.equal(a.heroes.heroesById['611'], undefined)
    assert.equal(a.heroes.heroesById['200'].baseStats.attack, 2385)
    assert.equal(a.relicSuits.yuhun_list[0][1], '更新套装')
    assert.equal(a.serverList[0].name, '新区')
    assert.ok(a.refreshedAt)
    await assert.rejects(service.get(true), /过于频繁/)
    const failedDb = staticDatabase()
    const failed = new CbgStaticService(failedDb)
    const before = await failed.get()
    globalThis.fetch = async () => new Response('unavailable', { status: 503 })
    await assert.rejects(failed.get(true), /暂时不可用/)
    assert.equal(await failed.get(), before)
    assert.equal(failedDb.writes, 0)
    globalThis.fetch = async (url) => url.pathname.endsWith('game_auto_config.js')
      ? new Response('var CBG_GAME_CONFIG={"hero_list":[[200,"事务失败名称",3,"failed"]],"yuhun_list":[[1,"套装","suit","",""]],"two_suit_yuhun":{},"head_skin_list":{"101":{"name":"不得发布"}}};')
      : new Response('var product_name="yys"; var server_data={"1":[["新区"],[[1,"新服务器","2"]]]};')
    const commitDb = staticDatabase([databasePanel])
    const commitFailed = new CbgStaticService(commitDb)
    const commitBefore = await commitFailed.get()
    commitDb.failCommit = true
    await assert.rejects(commitFailed.get(true), /持久化失败/)
    assert.equal(await commitFailed.get(), commitBefore)
    assert.equal(commitFailed.imageSource('frames', '101'), undefined)
    assert.deepEqual(await commitDb.heroCatalog.findMany(), [databasePanel])
    assert.equal(await commitDb.cbgGameAutoConfig.findUnique(), null)
    const invalidDb = staticDatabase()
    const invalid = new CbgStaticService(invalidDb)
    const validFetch = globalThis.fetch
    globalThis.fetch = async (url) => url.pathname.endsWith('game_auto_config.js') ? validFetch(url) : new Response('var product_name="yys"; var server_data={};')
    await assert.rejects(invalid.get(true), /区服资料格式异常/)
    assert.equal(invalidDb.writes, 0)
  } finally { globalThis.fetch = originalFetch }
})

test('static refresh diagnoses failures safely and rolls back before publishing a snapshot', async (t) => {
  const { CbgStaticService } = load('cbg-static.service')
  t.mock.method(CbgStaticService.prototype, 'fetchText', async (input) => input.endsWith('game_auto_config.js')
    ? 'var CBG_GAME_CONFIG={"hero_list":[[200,"桃花妖",3,"taohuayao"]],"yuhun_list":[[1,"套装","suit","",""]],"two_suit_yuhun":{},"head_skin_list":{"101":{"name":"不得发布"}}};'
    : 'var product_name="yys"; var server_data={"1":[["新区"],[[1,"新服务器","2"]]]};')
  for (const [operation, stage, code, name] of [
    ['begin', '开始事务', 'P2028', 'PrismaClientKnownRequestError'],
    ['begin', '开始事务', 'P1001', 'PrismaClientInitializationError'],
    ['upsert', '保存官方配置', 'P2021', 'PrismaClientKnownRequestError'],
    ['read', '读取式神面板', 'P2022', 'PrismaClientKnownRequestError'],
    ['snapshot', '生成资料快照', undefined, 'Error'],
    ['commit', '提交事务', undefined, 'Error'],
    ['upsert', '保存官方配置', undefined, 'PrismaClientValidationError'],
    ['upsert', '保存官方配置', 'sensitive-code', 'sensitive-name'],
  ]) {
    const db = staticDatabase([databasePanel])
    const service = new CbgStaticService(db)
    const before = await service.get()
    const messages = []
    t.mock.method(service.logger, 'warn', (message) => messages.push(message))
    const fail = async () => {
      throw Object.assign(new Error('sensitive connection and SQL payload'), {
        name, meta: { secret: 'sensitive-meta' },
        ...(name === 'PrismaClientInitializationError' ? { errorCode: code } : { code }),
      })
    }
    if (operation === 'begin') t.mock.method(db, '$transaction', fail)
    if (operation === 'upsert') t.mock.method(db.cbgGameAutoConfig, 'upsert', fail)
    if (operation === 'read') t.mock.method(db.heroCatalog, 'findMany', fail)
    if (operation === 'snapshot') t.mock.method(service, 'snapshot', () => { throw new Error('sensitive snapshot payload') })
    if (operation === 'commit') db.failCommit = true
    await assert.rejects(service.get(true), (error) => error.getStatus() === 502 && error.message === '静态资料持久化失败')
    assert.equal(await service.get(), before)
    assert.equal(service.imageSource('frames', '101'), undefined)
    assert.equal(await db.cbgGameAutoConfig.findUnique(), null)
    assert.equal(await db.heroCatalog.count(), 1)
    assert.equal(messages.length, 1)
    assert.ok(messages[0].includes(`阶段=${stage}`))
    assert.ok(messages[0].includes(code?.startsWith('P') ? code : 'UNKNOWN'))
    if (name.startsWith('PrismaClient')) assert.ok(messages[0].includes(name))
    assert.equal(messages[0].includes('sensitive'), false)
  }
  const db = staticDatabase([databasePanel])
  const service = new CbgStaticService(db)
  const refreshed = await service.get(true)
  assert.equal(refreshed.source, 'remote')
  assert.equal(refreshed.heroes.heroesById['200'].name, databasePanel.name)
  assert.ok(await db.cbgGameAutoConfig.findUnique())
  assert.deepEqual((await new CbgStaticService(db).get()).collections, refreshed.collections)
})

test('deployment transpilation strips type imports and rewrites relative .ts paths without writing artifacts', () => {
  const root = new URL('../../../packages/utils/src/', import.meta.url)
  const files = readdirSync(root, { recursive: true }).filter((file) => file.endsWith('.ts'))
  for (const file of files) {
    const source = new URL(file.replaceAll('\\\\', '/'), root)
    const output = ts.transpileModule(readFileSync(source, 'utf8'), {
      fileName: fileURLToPath(source),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, rewriteRelativeImportExtensions: true },
    }).outputText
    assert.doesNotMatch(output, /(?:from\s*|import\s*\()['"][^'"]+\.ts['"]/, file)
    assert.doesNotMatch(output, /from\s*['"]@phoenix\/types['"]/, file)
  }
})

test('legacy HTTP-200 risk messages pause every channel before a second fetch', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const payload of [
      { status: 0, msg: '服务暂时不可用，请稍后重试' },
      { status: '0', msg: '服务暂时不可用，请稍后重试' },
      { msg: '系统繁忙。反馈代号(abc-123)' },
      { msg: '系统繁忙! 反馈代号 (ABC-123)' },
      { msg: '稍后再试' },
    ]) {
      let calls = 0
      globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(payload)) }
      const upstream = new CbgUpstream()
      await assert.rejects(upstream.request(new URL('https://yys.cbg.163.com/cgi/api/login_auto')),
        (error) => error.getStatus() === 429 && /暂停/.test(error.message))
      await assert.rejects(upstream.request(new URL('https://yys-huawei.cbg.163.com/cgi/api/get_equip_detail')),
        (error) => error.getStatus() === 429)
      assert.equal(calls, 1, JSON.stringify(payload))
    }
    // Preserve the status-0 requirement; do not block every generic business error.
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response('{"status":0,"msg":"商品不存在"}') }
    const ordinary = new CbgUpstream()
    const url = new URL('https://yys.cbg.163.com/cgi/api/login_auto')
    await ordinary.request(url)
    await ordinary.request(url)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = originalFetch }
})

test('risk response stops subsequent calls and network errors never disclose headers', async () => {
  const originalFetch = globalThis.fetch
  try {
    let calls = 0
    globalThis.fetch = async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return new Response('{"msg":"captcha"}') }
    const upstream = new CbgUpstream()
    const url = new URL('https://yys.cbg.163.com/cgi/api/login_auto')
    await assert.rejects(upstream.request(url), /风控/)
    await assert.rejects(upstream.request(url), /暂停/)
    assert.equal(calls, 1)
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { throw new Error('cancel failure') } }), { status: 403 })
    const forbidden = new CbgUpstream()
    await assert.rejects(forbidden.request(url), /风控/)
    await assert.rejects(forbidden.request(url), /暂停/)
    globalThis.fetch = async () => { throw new Error('cookie=secret-test-only') }
    await assert.rejects(new CbgUpstream().request(url), (error) => !String(error.stack).includes('secret-test-only'))
  } finally { globalThis.fetch = originalFetch }
})

test('premium collection IDs and counts match desktop for false, true and absent skin flags', () => {
  // Load the actual desktop parser and shared display logic without starting either app.
  function loadSource(relativePath, replacements = {}) {
    const filename = fileURLToPath(new URL(relativePath, import.meta.url))
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const compiledModule = new Module(filename)
    const sourceRequire = createRequire(filename)
    compiledModule.require = (id) => replacements[id] ?? sourceRequire(id)
    compiledModule._compile(compiled, filename)
    return compiledModule.exports
  }
  const shared = loadSource('../../../packages/utils/src/relics.ts')
  const { localProduct } = loadSource('../../desktop/haolai/src/features/account/localProduct.ts', { '@phoenix/utils': shared })
  const { getCollectionSections } = loadSource('../../../packages/utils/src/collections.ts')
  const { collectionCatalog, parseGameConfigPayload } = load('cbg-static-payload')
  const catalog = collectionCatalog(parseGameConfigPayload({
    hero_list: [[200, '测试式神', 4, 'test']], yuhun_list: [[300001, '测试御魂', 'test', '', '']], two_suit_yuhun: {},
    skin_list: { 412603: '典藏甲', 413564: '臻藏乙', 413565: '典藏丙', 412604: '普通皮肤' },
    collection_skin_data: { 412603: '典藏甲', 413564: '臻藏乙', 413565: '典藏丙', 415001: '未持有典藏' },
  }))
  const description = { skin: { ss: [
    [200, '典藏甲', '412603', false],
    [200, '典藏甲重复', 412603, false],
    [201, '臻藏乙', 413564, true],
    [202, '典藏丙', 413565],
    [200, '普通皮肤', 412604, false],
    [203, '目录外皮肤', 499999, false],
  ] } }
  const api = parseCbgDescription(description).collections
  const desktop = localProduct({ equip: { equip_desc: description } }, 'https://yys.cbg.163.com/cgi/mweb/equip/1/test-1').equip.equip_desc.collections
  assert.deepEqual(api, desktop)
  const sections = getCollectionSections(api, catalog)
  assert.deepEqual(sections, getCollectionSections(desktop, catalog))
  const premium = sections.find(section => section.kind === 'premiumSkins')
  assert.equal(premium.ownedCount, 3)
  assert.deepEqual(premium.items.map(item => item.id), [412603, 413564, 413565])
  assert.deepEqual(premium.items.map(item => item.name), ['典藏甲', '臻藏乙', '典藏丙'])
  assert.deepEqual(premium.items.map(item => item.imageUrl), [
    '/cbg/images/skins/200/412603.png', '/cbg/images/skins/201/413564.png', '/cbg/images/skins/202/413565.png',
  ])
  const ordinary = sections.find(section => section.kind === 'skins')
  assert.equal(ordinary.ownedCount, 1)
  assert.deepEqual(ordinary.items.map(item => item.id), [412604])
  assert.equal(getCollectionSections(parseCbgDescription({ skin: { ss: [] } }).collections, catalog).find(section => section.kind === 'premiumSkins').ownedCount, 0)
  assert.equal(getCollectionSections(parseCbgDescription({}).collections, catalog).find(section => section.kind === 'premiumSkins').ownedCount, null)
})

test('collection whitelist extracts only public IDs, deduplicates and distinguishes missing from empty', () => {
  const detail = parseCbgDescription({
    skin: { ss: [[200, 'private tuple name', '412603', true, { secret: 'strip' }], [200, 'duplicate', 412603, true], [200, '非 SP 皮肤', 412604, false]], yys: [[1, '晴明', 410101]], guard: [[1, '御灵', 419002]], yard: [['1001341', '庭院']], gamble: [], shishenlu: [[2, '式神录']], battle: [[3, '主题']], yinyangshu: [[4, '阴阳术']], secret: 'strip' },
    head_skin: { 101: false, 102: { private: 'strip' } }, honors: ['900401'], honors_detail: { 900401: { dojo_id: '269', hero_id: 347, private: 'strip' } }, achieve: [1], qiling: [2],
  })
  assert.deepEqual(detail.collections, { heroSkins: [412603, 412604], otherSkins: [412603, 412604], onmyojiSkins: [410101], heroSkinPairs: [{ skinId: 412603, heroId: 200 }, { skinId: 412604, heroId: 200 }, { skinId: 410101, heroId: 1 }, { skinId: 419002, heroId: 1 }], skins: [412603, 412604, 410101, 419002], spiritSkins: [419002], yards: [1001341], summonRooms: [], heroRooms: [2], battleThemes: [3], onmyojiRooms: [4], frames: [101, 102], honors: [900401], honorDojoIds: { 900401: 269 } })
  assert.equal(JSON.stringify(detail).includes('private'), false)
  assert.equal('skin' in detail, false)
  assert.equal('achieve' in detail, false)
  assert.equal(parseCbgDescription({}).collections, undefined)
  assert.deepEqual(parseCbgDescription({ skin: { ss: [] } }).collections, { heroSkins: [], otherSkins: [] })
  assert.deepEqual(parseCbgDescription({ honors: ['900401'], dojo_id: '../269' }).collections, { honors: [900401] })
  assert.deepEqual(parseCbgDescription({ dojo_id: '269' }).collections, undefined)
  assert.deepEqual(parseCbgDescription({ honors: [951018, 951019, 951020], honors_detail: { 951018: { dojo_id: 269, hero_id: 347 }, 951019: { hero_id: '347' }, 951020: { other_id: 200 }, 999: { dojo_id: 123 } } }).collections,
    { honors: [951018, 951019, 951020], honorDojoIds: { 951018: 269, 951019: 347, 951020: 200 } })
  assert.throws(() => parseCbgDescription({ skin: { yard: [['invalid', 'name']] } }), /结构异常/)
})
