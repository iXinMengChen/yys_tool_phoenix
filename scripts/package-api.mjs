import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDirectory = path.join(rootDirectory, 'apps', 'api')
const distDirectory = path.join(appDirectory, 'dist')
const deploymentDirectory = path.join(appDirectory, 'deploy')
const configDirectory = path.join(deploymentDirectory, 'packages', 'config')
const configPackage = JSON.parse(
  await readFile(path.join(rootDirectory, 'packages', 'config', 'package.json'), 'utf8'),
)
const apiPackage = JSON.parse(
  await readFile(path.join(appDirectory, 'package.json'), 'utf8'),
)
const runtimeDependencies = {}

// The standalone launcher applies committed migrations before starting Nest.
for (const dependency of [...Object.keys(apiPackage.dependencies), 'prisma']) {
  if (apiPackage.dependencies[dependency]?.startsWith('file:')) continue

  const installedPackage = JSON.parse(
    await readFile(
      path.join(appDirectory, 'node_modules', dependency, 'package.json'),
      'utf8',
    ),
  )
  runtimeDependencies[dependency] = installedPackage.version
}

await access(path.join(distDirectory, 'main.js'))
await rm(deploymentDirectory, { recursive: true, force: true })
await cp(distDirectory, path.join(deploymentDirectory, 'dist'), { recursive: true })
await cp(path.join(appDirectory, 'prisma'), path.join(deploymentDirectory, 'prisma'), { recursive: true })
// Prisma expects the config object, not TypeScript's exports.default namespace.
await writeFile(
  path.join(deploymentDirectory, 'prisma.config.cjs'),
  ts.transpileModule(
    await readFile(path.join(appDirectory, 'prisma.config.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText + '\nmodule.exports = exports.default\n',
)
await mkdir(configDirectory, { recursive: true })
configPackage.exports['./env'].require = './env.cjs'
await cp(
  path.join(rootDirectory, 'packages', 'config', 'env.ts'),
  path.join(configDirectory, 'env.ts'),
)
await writeFile(
  path.join(configDirectory, 'env.cjs'),
  ts.transpileModule(
    await readFile(path.join(rootDirectory, 'packages', 'config', 'env.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
)
await writeFile(
  path.join(configDirectory, 'package.json'),
  `${JSON.stringify(configPackage, null, 2)}\n`,
)
// Nest requires this ESM package on Node 24; emit plain JS, not TS inside node_modules.
const utilsSource = path.join(rootDirectory, 'packages', 'utils', 'src')
const utilsDirectory = path.join(deploymentDirectory, 'packages', 'utils')
const utilsPackage = JSON.parse(await readFile(path.join(rootDirectory, 'packages', 'utils', 'package.json'), 'utf8'))
for (const relativePath of await readdir(utilsSource, { recursive: true })) {
  if (!relativePath.endsWith('.ts') || relativePath.endsWith('.d.ts')) continue
  const sourcePath = path.join(utilsSource, relativePath)
  const outputPath = path.join(utilsDirectory, 'src', relativePath.replace(/\.ts$/, '.js'))
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, ts.transpileModule(await readFile(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText)
}
await writeFile(path.join(utilsDirectory, 'package.json'), `${JSON.stringify({
  name: utilsPackage.name, version: utilsPackage.version, private: true, type: 'module',
  exports: { '.': './src/index.js' },
  // @phoenix/types is erased at transpilation; no runtime monorepo path remains.
  dependencies: Object.fromEntries(Object.entries(utilsPackage.dependencies ?? {}).filter(([, spec]) => !spec.startsWith('file:'))),
}, null, 2)}\n`)
await cp(
  path.join(rootDirectory, 'scripts', 'start-api.js'),
  path.join(deploymentDirectory, 'phoenix.js'),
)
await writeFile(
  path.join(deploymentDirectory, 'package.json'),
  `${JSON.stringify(
    {
      name: 'phoenix-api-deployment',
      version: apiPackage.version,
      private: true,
      engines: { node: '>=24.15.0' },
      scripts: { start: 'node phoenix.js' },
      dependencies: {
        ...runtimeDependencies,
        '@phoenix/config': 'file:./packages/config',
        '@phoenix/utils': 'file:./packages/utils',
      },
    },
    null,
    2,
  )}\n`,
)
await writeFile(
  path.join(deploymentDirectory, '.env.example'),
  [
    'API_PORT=43127',
    'API_BASE_URL=/api',
    'DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/yys_data_phoenix?schema=public',
    '# Server-only login Cookie containing sid; refreshed SID stays in process memory.',
    'CBG_LOGIN_COOKIE=""',
    '',
  ].join('\n'),
)

const deploymentEntries = await readdir(deploymentDirectory, {
  recursive: true,
  withFileTypes: true,
})
if (deploymentEntries.some((entry) => entry.isDirectory() && entry.name === 'node_modules')) {
  throw new Error('部署目录包含 node_modules')
}

console.log('NestJS 独立部署目录已生成：apps/api/deploy（未包含 node_modules）')
