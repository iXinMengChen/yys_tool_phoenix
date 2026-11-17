import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'packages', 'assets', 'haolai')
const target = path.join(root, 'apps', 'web', 'public', 'assets', 'haolai')

await mkdir(target, { recursive: true })
// 式神和御魂图片已由 API 提供，清理旧版本留下的本地副本。
for (const name of ['heroes', 'suits']) {
  await rm(path.join(target, name), { recursive: true, force: true })
}
for (const name of await readdir(source)) {
  await cp(path.join(source, name), path.join(target, name))
}
