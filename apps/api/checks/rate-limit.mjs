// Offline regression: no app startup, real env, database or network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const express = createRequire(require.resolve('@nestjs/platform-express'))('express')
function load(path) {
  const filename = fileURLToPath(new URL(path, import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText
  const mod = new Module(filename)
  mod.paths = createRequire(filename).resolve.paths('@nestjs/common')
  mod._compile(compiled, filename)
  return mod.exports
}
const { RateLimitGuard } = load('../src/common/guards/rate-limit.guard.ts')
const { ApiExceptionFilter } = load('../src/common/filters/api-exception.filter.ts')
function attempt(guard, path = '/api/health', ip = '192.0.2.1', method = 'GET') {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value } }
  const request = { path, ip, method, socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'spoofed' } }
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) }
  return { response, context, run: () => guard.canActivate(context) }
}
function rejected(request) {
  assert.throws(request.run, error => error.getStatus() === 429)
  assert.equal(request.response.headers['Cache-Control'], 'no-store')
  assert.ok(request.response.headers['Retry-After'] >= 1)
}

test('all normal endpoints and HTTP methods share the IP budget; errors use the real envelope', () => {
  const guard = new RateLimitGuard()
  for (let i = 0; i < 10; i++) assert.equal(attempt(guard, `/custom-prefix/${i % 2 ? 'cbg/product' : 'health'}`, undefined, i % 2 ? 'GET' : 'POST').run(), true)
  const blocked = attempt(guard, '/api/desktop/version')
  rejected(blocked)
  const response = blocked.response
  response.status = status => { response.statusCode = status; return response }
  response.json = body => { response.body = body }
  try { blocked.run() } catch (error) { new ApiExceptionFilter().catch(error, blocked.context) }
  assert.equal(response.statusCode, 429)
  assert.deepEqual(response.body, { code: 429, message: '访问过于频繁，请稍后重试', data: null })
  assert.equal(attempt(guard, '/api/health', '192.0.2.2').run(), true)
})

test('both image routes share a separate budget across changing IDs', () => {
  const guard = new RateLimitGuard()
  for (let i = 0; i < 60; i++) assert.equal(attempt(guard, i % 2 ? `/api/cbg/images/heroes/${i}.png` : `/api/cbg/collection-images/frames/${i}`).run(), true)
  rejected(attempt(guard, '/api/cbg/images/skins/1/2.png'))
  assert.equal(attempt(guard).run(), true)
})

test('window expiry restores quota and blocked retries do not extend it', t => {
  let now = 100_000
  t.mock.method(performance, 'now', () => now)
  const guard = new RateLimitGuard()
  for (let i = 0; i < 10; i++) attempt(guard).run()
  now += 8500
  const blocked = attempt(guard)
  rejected(blocked)
  assert.equal(blocked.response.headers['Retry-After'], 2)
  now += 1500
  assert.equal(attempt(guard).run(), true)
})

test('client storage is bounded and expired entries are reclaimed', t => {
  let now = 100_000
  t.mock.method(performance, 'now', () => now)
  const guard = new RateLimitGuard()
  for (let i = 0; i < 20_000; i++) attempt(guard, '/api/health', `client-${i}`).run()
  rejected(attempt(guard, '/api/health', 'new-client'))
  assert.equal(attempt(guard, '/api/health', 'client-1').run(), true)
  now += 10_000
  assert.equal(attempt(guard, '/api/health', 'new-client').run(), true)
})

test('Express trusts only loopback proxies and ignores forged leftmost addresses', () => {
  const app = express()
  app.set('trust proxy', 'loopback')
  function clientIp(remoteAddress, forwarded) {
    const request = Object.create(express.request)
    request.app = app
    request.socket = { remoteAddress }
    request.headers = { 'x-forwarded-for': forwarded }
    return request.ip
  }
  assert.equal(clientIp('127.0.0.1', '198.51.100.1'), '198.51.100.1')
  assert.equal(clientIp('127.0.0.1', 'spoofed, 198.51.100.1'), '198.51.100.1')
  assert.equal(clientIp('198.51.100.2', 'spoofed'), '198.51.100.2')
  assert.match(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), /app\.set\('trust proxy', 'loopback'\)/)
  assert.match(readFileSync(new URL('../src/app.module.ts', import.meta.url), 'utf8'), /provide: APP_GUARD, useClass: RateLimitGuard/)
})
