import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareVersions, parseDesktopReleaseResponse, validateDownloadUrl } from '../src/lib/desktopRelease.ts'

const envelope = (data) => ({ code: 200, message: 'success', data })
const release = { configured: true, version: '1.2.3', downloadUrl: 'https://example.com/download', notes: '说明\n第二行' }

test('SemVer precedence includes stable, beta, numeric prereleases and ignores build metadata', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0']
  for (let i = 1; i < ordered.length; i++) {
    assert.equal(compareVersions(ordered[i], ordered[i - 1]), 1)
    assert.equal(compareVersions(ordered[i - 1], ordered[i]), -1)
  }
  assert.equal(compareVersions('1.0.0+one', '1.0.0+two'), 0)
  assert.equal(compareVersions('1.0.0-beta+one', '1.0.0-beta+two'), 0)
  assert.equal(compareVersions('9007199254740993.0.0', '9007199254740992.0.0'), 1)
  for (const invalid of ['v1.0.0', '1.0', '01.0.0', '1.0.0-beta.01', '1.0.0-', '1.0.0\n']) {
    assert.throws(() => compareVersions(invalid, '1.0.0'))
  }
})

test('release API boundary validates envelope, discriminator, version, notes and safe download URL', () => {
  assert.deepEqual(parseDesktopReleaseResponse(envelope({ configured: false })), { configured: false })
  assert.deepEqual(parseDesktopReleaseResponse(envelope(release)), release)
  const invalid = [null, {}, { ...envelope(release), code: 0 }, { ...envelope(release), message: 'error' }, envelope([]), envelope({ configured: false, version: '1.0.0' }), envelope({ ...release, configured: 'true' }), envelope({ ...release, version: '1.2' }), envelope({ ...release, notes: null }), envelope({ ...release, notes: 'x'.repeat(16001) }), envelope({ ...release, downloadUrl: 'javascript:alert(1)' }), envelope({ ...release, downloadUrl: 'http://example.com/' }), envelope({ ...release, downloadUrl: 'https://user:secret@example.com/' }), envelope({ ...release, unexpected: true })]
  for (const value of invalid) assert.throws(() => parseDesktopReleaseResponse(value))
  for (const url of ['file:///tmp/a', 'https://user@example.com/', 'not-a-url']) assert.throws(() => validateDownloadUrl(url))
})
