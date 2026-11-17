import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const fixture = await mkdtemp(path.join(tmpdir(), 'phoenix-web-assets-'))
const source = path.join(fixture, 'packages', 'assets', 'haolai')
const target = path.join(fixture, 'apps', 'web', 'public', 'assets', 'haolai')
const script = path.join(fixture, 'scripts', 'sync-shared-assets.mjs')

try {
  for (const directory of [source, path.dirname(script), path.join(target, 'heroes'), path.join(target, 'suits')]) {
    await mkdir(directory, { recursive: true })
  }
  await cp(new URL('../../../scripts/sync-shared-assets.mjs', import.meta.url), script)
  await writeFile(path.join(target, 'heroes', '1.png'), 'legacy hero')
  await writeFile(path.join(target, 'suits', '1.png'), 'legacy suit')
  await writeFile(path.join(target, 'keep.png'), 'unrelated asset')

  for (const contents of ['initial icon', 'updated icon']) {
    await writeFile(path.join(source, 'icon-pvp.png'), contents)
    execFileSync(process.execPath, [script], { cwd: tmpdir(), stdio: 'inherit' })
    assert.equal(await readFile(path.join(target, 'icon-pvp.png'), 'utf8'), contents)
    assert.equal(await readFile(path.join(target, 'keep.png'), 'utf8'), 'unrelated asset')
    for (const name of ['heroes', 'suits']) {
      await assert.rejects(access(path.join(target, name)), { code: 'ENOENT' })
    }
  }
  console.log('PASS shared icons sync and update; legacy hero/suit directories removed; unrelated assets preserved')
} finally {
  await rm(fixture, { recursive: true, force: true })
}
