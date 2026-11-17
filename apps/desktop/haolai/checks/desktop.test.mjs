import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import { assetUrl } from '../src/lib/assetUrl.ts'

const app = new URL('../', import.meta.url)
const root = new URL('../../../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, app), 'utf8')

test('shared resources are not bundled into the desktop public copy', () => {
  const vite = read('vite.config.ts')
  const config = JSON.parse(read('src-tauri/tauri.conf.json'))
  assert.match(vite, /publicDir: false/)
  assert.deepEqual(config.bundle.resources, { '../../../../packages/assets/haolai/*': 'static-data/assets/' })
  assert.equal(existsSync(new URL('public/static-data/assets', app)), false)
  assert.equal(existsSync(new URL('packages/assets/haolai/icon-goyu.png', root)), true)
})

test('asset paths preserve whitelist and shared UI layout', () => {
  assert.equal(assetUrl('heroes/200.png'), '/haolai/heroes/200.png')
  assert.equal(assetUrl('ui/icon-money.png'), '/haolai/icon-money.png')
  assert.equal(assetUrl('icon-money.png'), '/haolai/icon-money.png')
  for (const path of ['../secret.png', 'heroes/0.png', 'https://example.com/a.png', 'ui/../../a.png']) {
    assert.equal(assetUrl(path), '', path)
  }
  globalThis.window = { __TAURI_INTERNALS__: {} }
  try {
    assert.match(assetUrl('ui/icon-money.png'), /(?:http:\/\/yys-cbg-assets\.localhost|yys-cbg-assets:\/\/localhost)\/ui\/icon-money\.png$/)
  } finally {
    delete globalThis.window
  }
})

test('desktop icon downloads use the official CBG source for every cache backfill path', () => {
  const assets = read('src-tauri/src/assets.rs')
  assert.match(assets, /https:\/\/cbg-yys\.res\.netease\.com\/game_res\/\{path\}/)
  assert.match(assets, /\.get\(official_asset_url\(relative\)\?\)/)
  assert.doesNotMatch(assets, /REMOTE_API_BASE_URL|mxtsl8\.cn|\/cbg\/collection-images|\/static\/assets/)
  assert.doesNotMatch(assets, /spawn_startup_asset_backfill|spawn_product_skin_backfill/)
  assert.match(assets, /async fn serve_asset/)
  assert.match(assets, /resource_root\(\)\?\s*\.join\("assets"\)/)
  const staticData = read('src-tauri/src/static_data.rs')
  assert.match(staticData, /std::env::current_exe\(\)/)
  assert.match(staticData, /directory\.join\("static-data"\)/)
  assert.doesNotMatch(staticData, /app_data_dir/)
  assert.match(read('src-tauri/src/lib.rs'), /register_asynchronous_uri_scheme_protocol/)
  const feature = read('src/pages/FeaturePage.tsx')
  assert.match(feature, /collectionImageUrl:.*assetUrl/)
  assert.match(feature, /return url\.startsWith\('\/cbg\/'\) \? undefined : url/)
})

test('named external browsers can open every supported channel without arbitrary app access', () => {
  const { permissions } = JSON.parse(read('src-tauri/capabilities/default.json'))
  const { allow } = permissions.find((entry) => entry.identifier === 'opener:allow-open-url')
  const hosts = ['yys.cbg.163.com', 'cbg.163.com', 'yys-huawei.cbg.163.com', 'yys-oppo.cbg.163.com', 'yys-vivo.cbg.163.com', 'yys-xiaomi.cbg.163.com']
  const programs = ['msedge.exe', 'chrome.exe', 'firefox.exe']
  const expected = programs.flatMap((app) => [
    ...hosts.map((host) => ({ url: `https://${host}/*`, app })),
    { url: 'https://github.com/iXinMengChen/yys-cbg-inspector/tree/tauri', app },
  ])
  const key = ({ url, app }) => `${app} ${url}`
  assert.deepEqual(allow.map(key).sort(), expected.map(key).sort())
})

test('migrated calculation workers use module mode for Vite ESM imports', () => {
  for (const [sharedPath, worker] of [
    ['../../../packages/ui/src/components/PveDamageTable.tsx', 'pve'],
    ['../../../packages/ui/src/pages/CalculatorPage.tsx', 'calculator'],
  ]) {
    const source = read(sharedPath)
    assert.ok(source.includes(`new Worker(new URL('../${worker}.worker.ts', import.meta.url), { type: 'module' })`), sharedPath)
    assert.ok(existsSync(new URL(`../../../packages/ui/src/${worker}.worker.ts`, app)))
  }
})

test('desktop packaging matches the legacy release layout without updater artifacts', () => {
  const rootPackage = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'))
  const packageJson = JSON.parse(read('package.json'))
  const script = read('scripts/package-tauri.mjs')

  assert.equal(rootPackage.scripts['package:desktop'], 'monoenv && pnpm --filter @phoenix/haolai-desktop package')
  assert.equal(packageJson.scripts.package, 'node scripts/package-tauri.mjs')
  assert.equal(packageJson.scripts['package:installer'], 'node scripts/package-tauri.mjs --installer')
  assert.equal(packageJson.scripts['package:portable'], 'node scripts/package-tauri.mjs --portable')
  assert.match(script, /release', 'tauri/)
  assert.match(script, /packages\/assets\/haolai/)
  assert.match(script, /const pnpmCommand = process\.platform === 'win32' \? 'pnpm\.exe' : 'pnpm'/)
   assert.match(script, /build', '--no-bundle/)
  assert.doesNotMatch(script, /TAURI_SIGNING_PRIVATE_KEY|latest\.json|updater/)
})

test('local account flow cannot upload account summaries', () => {
  const nativeSources = readdirSync(new URL('src-tauri/src/', app), { recursive: true })
    .filter((path) => path.endsWith('.rs'))
    .map((path) => `src-tauri/src/${path}`)
  for (const path of ['src/features/account/context.tsx', 'src/lib/tauriDesktop.ts', 'src/desktop.d.ts', ...nativeSources]) {
    assert.doesNotMatch(read(path), /saveAccountSummary|save_account_summary|account-summaries/)
  }
  assert.match(read('src/lib/relics.ts'), /from ['"]@phoenix\/utils['"]/)
})
