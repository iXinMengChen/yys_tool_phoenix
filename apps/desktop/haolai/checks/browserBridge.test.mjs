import assert from 'node:assert/strict'
import test from 'node:test'

test('browser preview rejects native maintenance instead of reporting fake success', async () => {
  const previousWindow = globalThis.window
  try {
    globalThis.window = {}
    const { installTauriDesktopBridge } = await import('../src/lib/tauriDesktop.ts')
    installTauriDesktopBridge()
    const desktop = window.desktop
    assert.equal(await desktop.readStaticData('/static/heroes'), null)
    for (const name of ['calculateRelicsNative', 'onNativeCalculatorProgress', 'cancelNativeCalculator']) {
      assert.equal(name in desktop, false)
    }
    for (const operation of [
      () => desktop.getAppVersion(),
      () => desktop.saveStaticData('/static/heroes', {}),
      () => desktop.updateStaticData('/static/heroes'),
      () => desktop.updateStaticAssets(),
      () => desktop.openDownloadsFolder(),
      () => desktop.getDesktopRelease('https://example.test/api/desktop/version'),
      () => desktop.openDesktopDownload('https://example.test/download'),
      () => desktop.loadProduct({ ordersn: 'test', channel: 'netease' }),
    ]) {
      await assert.rejects(operation, /仅支持桌面版，请在桌面应用中使用/)
    }
    installTauriDesktopBridge()
    assert.equal(window.desktop, desktop)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
