// Mock deployment script IO; the real Prisma loader uses a disposable fixture and synthetic env.
// Never build, install dependencies, read real environment files or access a database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const app = path.join(root, 'apps', 'api')
const deployment = path.join(app, 'deploy')
const require = createRequire(import.meta.url)
const launcher = readFileSync(path.join(root, 'scripts', 'start-api.js'), 'utf8')
const quiet = { log() {}, error() {} }

test('standalone package includes pinned Prisma CLI, schema, migrations and deploy-local config', async () => {
  const copies = []
  const writes = new Map()
  const fakeFs = {
    access: async () => {},
    mkdir: async () => {},
    rm: async (target) => assert.equal(target, deployment),
    cp: async (...args) => copies.push(args),
    readdir: async () => [],
    readFile: async (file) => {
      assert.notEqual(path.basename(file), '.env')
      return readFileSync(file, 'utf8')
    },
    writeFile: async (file, content) => writes.set(file, content),
  }
  const filename = path.join(root, 'scripts', 'package-api.mjs')
  const source = readFileSync(filename, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href))
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  await runInNewContext(`(async () => { ${compiled}\n })()`, {
    exports: {}, console: quiet,
    require: (id) => id === 'node:fs/promises' ? fakeFs : require(id),
  })
  assert.ok(copies.some(([from, to, options]) => from === path.join(app, 'prisma') && to === path.join(deployment, 'prisma') && options.recursive))
  const manifest = JSON.parse(writes.get(path.join(deployment, 'package.json')))
  const installedPrisma = JSON.parse(readFileSync(path.join(app, 'node_modules', 'prisma', 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies.prisma, installedPrisma.version)
  const envFile = path.join(deployment, 'custom.env')
  const loadedFiles = []
  const configModule = { exports: {} }
  runInNewContext(writes.get(path.join(deployment, 'prisma.config.cjs')), {
    exports: configModule.exports, module: configModule,
    process: { env: { PHOENIX_ENV_FILE: envFile }, loadEnvFile: (file) => loadedFiles.push(file) },
    require: (id) => {
      if (id === 'prisma/config') return { defineConfig: (config) => config }
      assert.equal(id, '@phoenix/config/env')
      return { loadApiEnv: () => ({ databaseUrl: 'test-database-url' }), databaseUrlSchema: { parse: (url) => url } }
    },
  })
  assert.deepEqual(loadedFiles, [envFile])
  const config = configModule.exports
  assert.equal(config.schema, 'prisma/schema.prisma')
  assert.equal(config.migrations.path, 'prisma/migrations')
  assert.equal(config.datasource.url, 'test-database-url')

  // Exercise Prisma's real c12/jiti loader, not just JavaScript evaluation.
  const fixture = mkdtempSync(path.join(app, 'node_modules', '.deployment-config-check-'))
  try {
    const runtime = path.join(fixture, 'node_modules', '@phoenix', 'config')
    mkdirSync(runtime, { recursive: true })
    writeFileSync(path.join(runtime, 'package.json'), writes.get(path.join(deployment, 'packages', 'config', 'package.json')))
    writeFileSync(path.join(runtime, 'env.cjs'), writes.get(path.join(deployment, 'packages', 'config', 'env.cjs')))
    const configFile = path.join(fixture, 'prisma.config.cjs')
    writeFileSync(configFile, writes.get(path.join(deployment, 'prisma.config.cjs')))
    const fixtureEnv = path.join(fixture, 'isolated.env')
    writeFileSync(fixtureEnv, 'API_PORT=43127\nAPI_BASE_URL=/api\nDATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture?schema=public\n')
    const apiRequire = createRequire(path.join(app, 'package.json'))
    const loader = createRequire(apiRequire.resolve('prisma/config')).resolve('@prisma/config')
    const child = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict')
      const path = require('node:path')
      require(process.argv[2]).loadConfigFromFile({ configFile: process.argv[1] }).then((result) => {
        if (result.error) { console.error(result.error); process.exitCode = 1; return }
        assert.equal(result.config.schema, path.join(process.cwd(), 'prisma', 'schema.prisma'))
        assert.equal(result.config.migrations.path, path.join(process.cwd(), 'prisma', 'migrations'))
        assert.equal(result.config.datasource.url, 'postgresql://fixture:fixture@127.0.0.1:1/fixture?schema=public')
      }).catch((error) => { console.error(error); process.exitCode = 1 })
    `, configFile, loader], {
      cwd: fixture, encoding: 'utf8', timeout: 20_000,
      env: { NODE_ENV: 'production', PHOENIX_ENV_FILE: fixtureEnv },
    })
    assert.ifError(child.error)
    assert.equal(child.status, 0, child.stderr || child.stdout)
  } finally {
    assert.equal(path.dirname(fixture), path.join(app, 'node_modules'))
    assert.ok(path.basename(fixture).startsWith('.deployment-config-check-'))
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('launcher migrates on every start and never launches API after incomplete files, install or migration failure', () => {
  const cli = path.join(deployment, 'node_modules', 'prisma', 'build', 'index.js')
  const config = path.join(deployment, 'prisma.config.cjs')
  const envFile = path.join(deployment, 'custom.env')
  for (const scenario of [
    { platform: 'linux' }, { platform: 'win32' },
    { platform: 'linux', missing: cli }, { platform: 'win32', missing: cli },
    { missing: cli, installStatus: 9, exit: 9 },
    { migrationStatus: 17, exit: 17 },
    { migrationError: new Error('test spawn failure'), exit: 1 },
    { missing: config, exit: 1 },
  ]) {
    const calls = []
    const exited = {}
    const fakeProcess = {
      env: { PHOENIX_ENV_FILE: envFile }, platform: scenario.platform ?? 'linux', execPath: process.execPath,
      loadEnvFile: (file) => assert.equal(file, envFile), on() {},
      exit: (code) => { calls.push(['exit', code]); throw exited },
    }
    try {
      runInNewContext(launcher, {
        __dirname: deployment, console: quiet, process: fakeProcess,
        require: (id) => {
          if (id === 'node:fs') return { existsSync: (file) => file !== scenario.missing && file !== path.join(deployment, 'node_modules', '.pnpm', 'lock.yaml') }
          if (id === 'node:child_process') return {
            spawnSync: (command, args, options) => {
              calls.push(['sync', command, Array.from(args), options])
              return args[0] === cli
                ? { status: scenario.migrationStatus ?? 0, error: scenario.migrationError }
                : { status: scenario.installStatus ?? 0 }
            },
            spawn: (command, args, options) => {
              calls.push(['server', command, Array.from(args), options])
              return { on() {}, kill() {} }
            },
          }
          assert.equal(id, 'node:path')
          return path
        },
      })
      assert.equal(scenario.exit, undefined)
    } catch (error) { assert.equal(error, exited); assert.ok(scenario.exit) }
    const migration = calls.find((call) => call[0] === 'sync' && call[2][0] === cli)
    if (scenario.exit) {
      assert.deepEqual(calls.at(-1), ['exit', scenario.exit])
      assert.equal(calls.some(([kind]) => kind === 'server'), false)
    } else {
      assert.ok(migration)
      assert.deepEqual(migration[2], [cli, 'migrate', 'deploy', '--config', config])
      assert.equal(migration[3].cwd, deployment)
      assert.equal(migration[3].env.PHOENIX_ENV_FILE, envFile)
      assert.equal(migration[3].env.NODE_ENV, 'production')
      assert.equal(calls.at(-1)[0], 'server')
      if (scenario.missing === cli) assert.ok(calls.indexOf(migration) > 0)
    }
  }
})
