import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDirectory = path.join(rootDirectory, 'apps', 'web')
const standaloneDirectory = path.join(appDirectory, '.next', 'standalone', 'apps', 'web')
const deploymentDirectory = path.join(appDirectory, 'deploy')
const staticDirectory = path.join(appDirectory, '.next', 'static')
const publicDirectory = path.join(appDirectory, 'public')
const appPackage = JSON.parse(
  await readFile(path.join(appDirectory, 'package.json'), 'utf8'),
)
const runtimeDependencies = {}

for (const dependency of Object.keys(appPackage.dependencies)) {
  const version = appPackage.dependencies[dependency]
  if (version.startsWith('file:')) continue

  const installedPackage = JSON.parse(
    await readFile(
      path.join(appDirectory, 'node_modules', dependency, 'package.json'),
      'utf8',
    ),
  )
  runtimeDependencies[dependency] = installedPackage.version
}

await access(path.join(standaloneDirectory, 'server.js'))
await rm(deploymentDirectory, { recursive: true, force: true })
await cp(standaloneDirectory, deploymentDirectory, {
  recursive: true,
  filter: (source) => {
    const relativePath = path.relative(standaloneDirectory, source)
    return (
      relativePath !== 'package.json' &&
      !relativePath.split(path.sep).includes('node_modules')
    )
  },
})
await mkdir(path.join(deploymentDirectory, '.next'), { recursive: true })
await cp(staticDirectory, path.join(deploymentDirectory, '.next', 'static'), {
  recursive: true,
})
await cp(publicDirectory, path.join(deploymentDirectory, 'public'), {
  recursive: true,
})
await cp(
  path.join(rootDirectory, 'scripts', 'start-web.js'),
  path.join(deploymentDirectory, 'phoenix.js'),
)
await writeFile(
  path.join(deploymentDirectory, 'package.json'),
  `${JSON.stringify(
    {
      name: 'phoenix-web-deployment',
      version: appPackage.version,
      private: true,
      scripts: { start: 'node phoenix.js' },
      dependencies: runtimeDependencies,
    },
    null,
    2,
  )}\n`,
)
await writeFile(path.join(deploymentDirectory, '.env.example'), 'PORT=24974\n')

const deploymentEntries = await readdir(deploymentDirectory, {
  recursive: true,
  withFileTypes: true,
})
if (deploymentEntries.some((entry) => entry.isDirectory() && entry.name === 'node_modules')) {
  throw new Error('部署目录包含 node_modules')
}

console.log('Next.js 独立部署目录已生成：apps/web/deploy（未包含 node_modules）')
