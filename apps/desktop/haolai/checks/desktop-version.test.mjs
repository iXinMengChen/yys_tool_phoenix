import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../../../../', import.meta.url)

test('desktop version command synchronizes metadata and rejects invalid input before writing', t => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'phoenix-desktop-version-'))
  t.after(() => {
    assert.equal(path.dirname(fixture), tmpdir())
    rmSync(fixture, { recursive: true, force: true })
  })
  for (const file of ['scripts/set-desktop-version.mjs', 'apps/desktop/haolai/src/lib/desktopRelease.ts']) {
    const destination = path.join(fixture, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(new URL(file, root), destination)
  }
  const desktop = path.join(fixture, 'apps/desktop/haolai')
  const oldVersion = '1.0.0-beta.8'
  const json = `${JSON.stringify({ version: oldVersion, nested: { version: oldVersion } }, null, 2)}\n`
  const manifest = `[package]\r\nname = "yys-cbg-inspector-tauri"\r\nversion = "${oldVersion}"\r\n\r\n[dependencies]\r\nserde = { version = "1" }\r\n`
  const lock = `[[package]]\nname = "unrelated"\nversion = "${oldVersion}"\n\n[[package]]\nname = "yys-cbg-inspector-tauri"\nversion = "${oldVersion}"\ndependencies = ["unrelated"]\n`
  const files = ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']
  const readAll = () => files.map(file => readFileSync(path.join(desktop, file), 'utf8'))
  mkdirSync(path.join(desktop, 'src-tauri'), { recursive: true })
  files.forEach((file, index) => writeFileSync(path.join(desktop, file), [json, json, manifest, lock][index]))
  const run = (...args) => spawnSync(process.execPath, [path.join(fixture, 'scripts/set-desktop-version.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8' })

  const version = '1.0.0-beta.10'
  const result = run(version)
  assert.equal(result.status, 0, result.stderr || String(result.error))
  for (const file of files.slice(0, 2)) {
    const metadata = JSON.parse(readFileSync(path.join(desktop, file), 'utf8'))
    assert.equal(metadata.version, version)
    assert.equal(metadata.nested.version, oldVersion)
  }
  assert.equal(readAll()[2], manifest.replace(`version = "${oldVersion}"`, `version = "${version}"`))
  assert.equal(readAll()[3], lock.replace(`name = "yys-cbg-inspector-tauri"\nversion = "${oldVersion}"`, `name = "yys-cbg-inspector-tauri"\nversion = "${version}"`))

  const updated = readAll()
  for (const args of [[], ['1.0'], ['1.0.0-beta.01'], [version, 'extra']]) {
    assert.equal(run(...args).status, 1, `must reject ${JSON.stringify(args)}`)
    assert.deepEqual(readAll(), updated)
  }
  writeFileSync(path.join(desktop, files[3]), '[[package]]\nname = "unrelated"\nversion = "1.0.0"\n')
  const broken = readAll()
  assert.equal(run('1.0.1').status, 1)
  assert.deepEqual(readAll(), broken)
})
