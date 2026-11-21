import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = path.join(projectRoot, 'src-tauri', 'target', 'release')
const outputRoot = path.join(projectRoot, 'release', 'tauri')
const staticAssetsSource = path.resolve(projectRoot, '../../../packages/assets/haolai')
const licenseSource = path.join(projectRoot, 'LICENSE')
const repositoryLicense = path.resolve(projectRoot, '../../../LICENSE')
const mode = process.argv[2] === undefined
  ? 'all'
  : process.argv[2] === '--installer'
    ? 'installer'
    : process.argv[2] === '--portable'
      ? 'portable'
      : process.argv[2]

if (!['all', 'installer', 'portable'].includes(mode)) {
  throw new Error('用法：pnpm package [--installer|--portable]')
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'

function runTauri(args) {
  const result = spawnSync(pnpmCommand, ['tauri', ...args], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(directoryPath) {
  try {
    return (await stat(directoryPath)).isDirectory()
  } catch {
    return false
  }
}

async function readTauriConfig() {
  const config = JSON.parse(
    await readFile(path.join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  )
  const { productName, version, mainBinaryName = productName } = config

  if (![productName, version, mainBinaryName].every((value) => typeof value === 'string')) {
    throw new Error('无法从 src-tauri/tauri.conf.json 读取发布信息')
  }

  return { productName, version, mainBinaryName }
}

async function copyInstaller({ productName, version }) {
  const sourceDirectory = path.join(releaseRoot, 'bundle', 'nsis')
  if (!(await isDirectory(sourceDirectory))) {
    throw new Error(`未找到 NSIS 安装包目录：${sourceDirectory}`)
  }

  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  const installer = entries.find(
    (entry) => entry.isFile()
      && entry.name.toLowerCase().endsWith('-setup.exe')
      && entry.name.includes(version),
  )
  if (!installer) throw new Error(`未找到版本 ${version} 的 NSIS 安装包`)

  const installerDirectory = path.join(outputRoot, 'installer')
  await mkdir(installerDirectory, { recursive: true })
  await cp(
    path.join(sourceDirectory, installer.name),
    path.join(installerDirectory, `${productName}-${version}.exe`),
  )
}

async function copyPortable({ productName, version, mainBinaryName }) {
  const executable = path.join(releaseRoot, `${mainBinaryName}.exe`)
  if (!(await isFile(executable))) throw new Error(`未找到 Tauri 可执行文件：${executable}`)
  if (!(await isDirectory(staticAssetsSource))) {
    throw new Error(`未找到共享静态资源目录：${staticAssetsSource}`)
  }

  const portableDirectory = path.join(outputRoot, 'portable', `${productName}-${version}`)
  await mkdir(path.join(portableDirectory, 'static-data'), { recursive: true })
  await cp(executable, path.join(portableDirectory, `${productName}.exe`))
  await cp(licenseSource, path.join(portableDirectory, 'LICENSE'))
  await cp(
    staticAssetsSource,
    path.join(portableDirectory, 'static-data', 'assets'),
    { recursive: true },
  )
}

const [desktopLicense, rootLicense] = await Promise.all([
  readFile(licenseSource),
  readFile(repositoryLicense),
])
if (!desktopLicense.equals(rootLicense)) {
  throw new Error('桌面端 LICENSE 与仓库根目录 LICENSE 不一致，请先同步')
}

const artifactConfig = await readTauriConfig()
const outputRelativePath = path.relative(projectRoot, outputRoot)
if (outputRelativePath !== path.join('release', 'tauri')) {
  throw new Error(`拒绝清理项目发布目录之外的路径：${outputRoot}`)
}

await rm(outputRoot, { recursive: true, force: true })

if (mode === 'all' || mode === 'portable') {
  // 先生成一次应用本体，all 模式下 NSIS 复用该构建结果。
  runTauri(['build', '--no-bundle'])
}

if (mode === 'installer') {
  runTauri(['build', '--bundles', 'nsis'])
} else if (mode === 'all') {
  runTauri(['bundle', '--bundles', 'nsis'])
}

if (mode === 'all' || mode === 'installer') await copyInstaller(artifactConfig)
if (mode === 'all' || mode === 'portable') await copyPortable(artifactConfig)

console.log(`\n产物已整理到：${outputRoot}`)
