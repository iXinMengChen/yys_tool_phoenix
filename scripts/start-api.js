/* eslint-disable @typescript-eslint/no-require-imports -- Keep this launcher CommonJS beside Nest's compiled entry. */
const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const serverPath = path.join(__dirname, 'dist', 'main.js')
const nestPackagePath = path.join(__dirname, 'node_modules', '@nestjs', 'core', 'package.json')
const configRuntimePath = path.join(__dirname, 'node_modules', '@phoenix', 'config', 'env.cjs')
const utilsRuntimePath = path.join(__dirname, 'node_modules', '@phoenix', 'utils', 'src', 'index.js')
const prismaCliPath = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')
const prismaConfigPath = path.join(__dirname, 'prisma.config.cjs')
const pnpmLockPath = path.join(__dirname, 'node_modules', '.pnpm', 'lock.yaml')
const envFilePath = path.resolve(
  process.env.PHOENIX_ENV_FILE || path.join(__dirname, '.env'),
)
const isWindows = process.platform === 'win32'

if (existsSync(envFilePath)) process.loadEnvFile(envFilePath)
process.env.PHOENIX_ENV_FILE = envFilePath

if ([serverPath, path.join(__dirname, 'package.json'), prismaConfigPath,
  path.join(__dirname, 'prisma', 'schema.prisma'),
  path.join(__dirname, 'prisma', 'migrations', 'migration_lock.toml'),
].some((file) => !existsSync(file))) {
  console.error('部署文件不完整，请先上传完整的 deploy 目录。')
  process.exit(1)
}

if (!existsSync(nestPackagePath) || !existsSync(configRuntimePath) || !existsSync(utilsRuntimePath) || !existsSync(prismaCliPath)) {
  const packageManager = existsSync(pnpmLockPath) ? 'pnpm' : 'npm'
  const installArgs = packageManager === 'pnpm'
    ? ['install', '--prod', '--no-frozen-lockfile']
    : ['install', '--omit=dev']

  console.log(`正在使用 ${packageManager} 安装或更新 Phoenix API 运行依赖……`)
  const install = spawnSync(
    isWindows ? process.env.ComSpec || 'cmd.exe' : packageManager,
    isWindows
      ? ['/d', '/s', '/c', `${packageManager} ${installArgs.join(' ')}`]
      : installArgs,
    { cwd: __dirname, stdio: 'inherit' },
  )

  if (install.error) {
    console.error(`依赖安装失败：${install.error.message}`)
    process.exit(1)
  }

  if (install.status !== 0) process.exit(install.status ?? 1)
}

console.log('正在应用 Phoenix API 数据库迁移……')
const migration = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy', '--config', prismaConfigPath], {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
})
if (migration.error || migration.status !== 0) {
  console.error('数据库迁移失败，API 未启动；请检查上方迁移日志。')
  process.exit(migration.status || 1)
}

console.log('正在启动 Phoenix API……')
const server = spawn(process.execPath, [serverPath], {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
})

server.on('error', (error) => {
  console.error(`NestJS 启动失败：${error.message}`)
  process.exitCode = 1
})

server.on('exit', (code) => {
  process.exitCode = code ?? 1
})

process.on('SIGINT', () => server.kill('SIGINT'))
process.on('SIGTERM', () => server.kill('SIGTERM'))
