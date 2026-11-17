import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const configUrl = new URL('../vite.config.ts', import.meta.url)
const require = createRequire(configUrl)
const source = ts.transpileModule(readFileSync(configUrl, 'utf8').replaceAll('import.meta.url', JSON.stringify(configUrl.href)), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText

test('desktop version checks have a working default endpoint and support overrides', () => {
  for (const [configured, expected] of [
    [undefined, 'https://mxtsl8.cn/phoenix-api/desktop/version'],
    ['  ', 'https://mxtsl8.cn/phoenix-api/desktop/version'],
    [' https://example.com/api/desktop/version ', 'https://example.com/api/desktop/version'],
  ]) {
    const exports = {}
    const plugin = () => ({})
    runInNewContext(source, {
      exports,
      require: id => id === 'vite'
        ? { defineConfig: value => value, loadEnv: () => ({ VITE_DESKTOP_VERSION_URL: configured }) }
        : ['@vitejs/plugin-react', '@tailwindcss/vite'].includes(id) ? plugin : require(id),
    })
    const config = exports.default({ mode: 'production' })
    assert.equal(JSON.parse(config.define['import.meta.env.VITE_DESKTOP_VERSION_URL']), expected)
  }
})
