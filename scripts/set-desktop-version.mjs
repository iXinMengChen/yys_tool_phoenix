import { readFileSync, writeFileSync } from 'node:fs'
import { compareVersions } from '../apps/desktop/haolai/src/lib/desktopRelease.ts'

const desktopDirectory = new URL('../apps/desktop/haolai/', import.meta.url)
const versionFiles = [
  ['package.json', /(^  "version": ")[^"]+("[,]?\r?$)/gm],
  ['src-tauri/tauri.conf.json', /(^  "version": ")[^"]+("[,]?\r?$)/gm],
  ['src-tauri/Cargo.toml', /(^version = ")[^"]+("\r?$)/gm],
  ['src-tauri/Cargo.lock', /(\[\[package\]\]\r?\nname = "yys-cbg-inspector-tauri"\r?\nversion = ")[^"]+(")/g],
]

try {
  const [version, ...extra] = process.argv.slice(2)
  if (!version || extra.length) {
    throw new Error('用法：pnpm version:desktop <版本号>，例如 pnpm version:desktop 1.0.0-beta.10')
  }
  compareVersions(version, version)

  // 先确认所有目标都能读取且唯一匹配，再开始写入。
  const updates = versionFiles.map(([relativePath, pattern]) => {
    const file = new URL(relativePath, desktopDirectory)
    const source = readFileSync(file, 'utf8')
    if ([...source.matchAll(pattern)].length !== 1) {
      throw new Error(`${relativePath} 的版本字段缺失或不唯一`)
    }
    return { file, source: source.replace(pattern, (_, before, after) => `${before}${version}${after}`) }
  })

  for (const { file, source } of updates) writeFileSync(file, source)
  console.log(`桌面版本已统一更新为 ${version}（package.json、Tauri 配置、Cargo.toml、Cargo.lock）`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
