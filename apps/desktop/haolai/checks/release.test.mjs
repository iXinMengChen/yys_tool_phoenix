import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const app = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, app), 'utf8')

test('Phoenix has a separate installation and no legacy update channel', () => {
  const source = read('src-tauri/tauri.conf.json')
  const config = JSON.parse(source)
  assert.equal(config.identifier, 'com.phoenix.yys.cbg.inspector')
  assert.equal(config.productName, '号来 Phoenix')
  assert.equal(config.mainBinaryName, '号来 Phoenix')
  assert.equal(config.app.windows[0].title, '号来 Phoenix')
  assert.match(read('index.html'), /<title>号来 Phoenix<\/title>/)
  assert.doesNotMatch(read('index.html'), /user-scalable=no|maximum-scale=1/)
  assert.equal(config.plugins?.updater, undefined)
  assert.ok(!config.bundle.createUpdaterArtifacts)
  assert.doesNotMatch(source, /desktop-updates|mxtsl8\.cn|pubkey/)

  const permissions = JSON.parse(read('src-tauri/capabilities/default.json')).permissions
  assert.ok(!permissions.some((permission) => typeof permission === 'string' && /^(updater|process):/.test(permission)))
  const about = read('src/pages/Settings/AboutSection/index.tsx')
  assert.match(about, /getDesktopRelease\(releaseEndpoint\)/)
  assert.match(about, /VITE_DESKTOP_VERSION_URL/)
  assert.match(about, /hasUpdate/)
  assert.match(about, /手动安装/)
  const shell = read('src/Workspace/Shell.tsx')
  assert.match(shell, /getDesktopRelease\(releaseEndpoint\)/)
  assert.match(shell, /compareVersions\(release.version, current\) > 0/)
  assert.match(shell, /phoenix-desktop-update-reminders/)
  assert.match(about, /启动时提醒新版本/)
  const bridge = read('src/lib/tauriDesktop.ts')
  assert.match(bridge, /invoke<unknown>\("get_desktop_release"/)
  assert.match(bridge, /invoke<void>\("open_desktop_download"/)
  const native = ['lib.rs', 'release.rs'].map((path) => read(`src-tauri/src/${path}`)).join('\n')
  assert.match(native, /reqwest::redirect::Policy::none\(\)/)
  assert.match(native, /MAX_RELEASE_BYTES/)
  assert.match(native, /validate_release_url\(&url, false\)/)
  assert.doesNotMatch(about, /plugin-updater|downloadAndInstall|checkForUpdates|plugin-process/)
  assert.doesNotMatch(native, /tauri_plugin_(?:updater|process)/)
  assert.doesNotMatch(read('src-tauri/Cargo.toml'), /tauri-plugin-(?:updater|process)/)
  assert.doesNotMatch(read('package.json'), /@tauri-apps\/plugin-(?:updater|process)/)

  const hooks = read('src-tauri/installer-hooks.nsh')
  assert.doesNotMatch(hooks, /taskkill|KillProc|RMDir|Delete\s/i)
  assert.match(hooks, /IfFileExists "\$INSTDIR\\号来\.exe" legacy_installation/)
  assert.match(hooks, /legacy_installation:[\s\S]*?Abort/)
})
