// Offline checks: no real environment, database, network or build.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(relativePath) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText
  const compiledModule = new Module(filename)
  compiledModule.paths = createRequire(filename).resolve.paths('@nestjs/common')
  compiledModule.require = id => id === '../../database/prisma.service'
    ? { PrismaService: class {} }
    : createRequire(filename)(id)
  compiledModule._compile(compiled, filename)
  return compiledModule.exports
}
const { DesktopController } = load('../src/modules/desktop/desktop.controller.ts')
const announcement = { version: '1.0.0-beta.10', downloadUrl: 'https://share.feijipan.com/s/4b7LXxbh', notes: '' }
const controller = findFirst => new DesktopController({ desktopRelease: { findFirst } })

test('empty database omits version and download data', async () => {
  assert.deepEqual(await controller(async () => null).getVersion(), { configured: false })
})

test('queries latest published record and selects only public release fields', async () => {
  const api = controller(async args => {
    assert.deepEqual(args, {
      orderBy: [{ publishedAt: 'desc' }, { version: 'asc' }],
      select: { version: true, downloadUrl: true, notes: true },
    })
    return announcement
  })
  assert.deepEqual(await api.getVersion(), { configured: true, ...announcement })
})

test('database changes take effect on next request without restart', async () => {
  let release = announcement
  const api = controller(async () => release)
  assert.equal((await api.getVersion()).version, '1.0.0-beta.10')
  release = { ...announcement, version: '1.0.0-beta.11', notes: '更新说明' }
  assert.deepEqual(await api.getVersion(), { configured: true, ...release })
})

test('database failure is propagated instead of announcing no update', async () => {
  const error = new Error('database unavailable')
  await assert.rejects(controller(async () => { throw error }).getVersion(), candidate => candidate === error)
})

test('real response interceptor wraps both states exactly once', async () => {
  const { lastValueFrom, of } = require('rxjs')
  const { ResponseEnvelopeInterceptor } = load('../src/common/interceptors/response-envelope.interceptor.ts')
  for (const release of [null, announcement]) {
    const data = await controller(async () => release).getVersion()
    const wrapped = await lastValueFrom(new ResponseEnvelopeInterceptor().intercept({}, { handle: () => of(data) }))
    assert.deepEqual(wrapped, { code: 200, message: 'success', data })
  }
})

test('route and Swagger preserve existing desktop/version contract', () => {
  assert.equal(Reflect.getMetadata('path', DesktopController), 'desktop')
  assert.equal(Reflect.getMetadata('path', DesktopController.prototype.getVersion), 'version')
  assert.equal(Reflect.getMetadata('swagger/apiResponse', DesktopController.prototype.getVersion)['200'].schema.properties.data.oneOf.length, 2)
})
