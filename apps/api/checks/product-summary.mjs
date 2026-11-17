// Offline checks: no database, local environment, upstream requests or app startup.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(name) {
  const filename = fileURLToPath(new URL(`../src/modules/cbg/${name}.ts`, import.meta.url))
  const mod = new Module(filename)
  mod.paths = createRequire(filename).resolve.paths('@nestjs/common')
  const originalRequire = mod.require.bind(mod)
  mod.require = id => id === './product-query.dto' ? load('product-query.dto') : originalRequire(id)
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText, filename)
  return mod.exports
}
const { ValidationPipe } = require('@nestjs/common')
const { ProductSummaryDto } = load('product-summary.dto')
const { CbgProductSummaryService } = load('cbg-product-summary.service')
const input = { channel: 'official', serverid: '1', ordersn: 'ORDER_1', summary: '式神与御魂摘要' }

test('upload boundary accepts only product identity and nonempty bounded text', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
  const validate = body => pipe.transform(body, { type: 'body', metatype: ProductSummaryDto })
  const accepted = await validate({ serverid: '1', ordersn: 'ORDER_1', summary: '  商品摘要  ' })
  assert.equal(accepted.channel, 'official')
  assert.equal(accepted.summary, '商品摘要')
  for (const body of [
    { ...input, summary: ' \n ' }, { ...input, summary: 'a'.repeat(32001) },
    { ...input, summary: {} }, { ...input, serverid: '-1' },
    { ...input, ordersn: '../../x' }, { ...input, channel: 'unknown' },
    { ...input, cookie: 'not-a-real-cookie' }, { ...input, source: 'verified' },
    { ...input, equip: {} },
  ]) await assert.rejects(validate(body), error => error.getStatus() === 400)
})

test('upserts deduplicate product identity, extend retention and clamp three calendar months', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 30, 6) })
  let saved
  const service = new CbgProductSummaryService({ productSummary: { upsert: async args => {
    saved = args
    return { id: 'stable-id', ...args.update }
  } } })
  const receipt = await service.upload(input)
  assert.equal(receipt.expiresAt, '2027-02-28T06:00:00.000Z')
  assert.equal(receipt.source, 'client_upload')
  assert.equal('summary' in receipt, false)
  assert.deepEqual(saved.where, { channel_serverId_orderSn: { channel: 'official', serverId: '1', orderSn: 'ORDER_1' } })
  assert.equal(saved.create.summary, input.summary)
  t.mock.timers.setTime(Date.UTC(2027, 0, 31, 6))
  const updated = await service.upload({ ...input, summary: 'updated' })
  assert.equal(updated.id, receipt.id)
  assert.equal(updated.expiresAt, '2027-04-30T06:00:00.000Z')
  assert.equal(saved.update.summary, 'updated')
  t.mock.timers.setTime(Date.UTC(2027, 10, 30, 6))
  assert.equal((await service.upload(input)).expiresAt, '2028-02-29T06:00:00.000Z')
})

test('database failure never produces a successful receipt; cleanup only deletes expired summaries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 17) })
  const failure = new Error('database unavailable')
  let deletion
  const service = new CbgProductSummaryService({ productSummary: {
    upsert: async () => { throw failure },
    deleteMany: async args => { deletion = args },
  } })
  await assert.rejects(service.upload(input), failure)
  service.onModuleInit()
  service.onModuleDestroy()
  assert.deepEqual(deletion, { where: { expiresAt: { lte: new Date() } } })
})
