/* eslint-disable @typescript-eslint/no-require-imports -- Keep this launcher CommonJS beside Next's standalone server. */
const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const serverPath = path.join(__dirname, 'server.js')
const nextPackagePath = path.join(__dirname, 'node_modules', 'next', 'package.json')
const isWindows = process.platform === 'win32'
const envFilePath = path.join(__dirname, '.env')

if (existsSync(envFilePath)) process.loadEnvFile(envFilePath)

if (!existsSync(serverPath) || !existsSync(path.join(__dirname, 'package.json'))) {
  console.error('部署文件不完整，请先上传完整的 deploy 目录。')
  process.exit(1)
}

if (!existsSync(nextPackagePath)) {
  console.log('正在安装 Phoenix Web 运行依赖……')
  const install = spawnSync(
    isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm',
    isWindows
      ? ['/d', '/s', '/c', 'npm install --omit=dev']
      : ['install', '--omit=dev'],
    { cwd: __dirname, stdio: 'inherit' },
  )

  if (install.error) {
    console.error(`依赖安装失败：${install.error.message}`)
    process.exit(1)
  }

  if (install.status !== 0) process.exit(install.status ?? 1)
}

console.log('正在启动 Phoenix Web……')
const server = spawn(process.execPath, [serverPath], {
  cwd: __dirname,
  env: { ...process.env, HOSTNAME: '0.0.0.0' },
  stdio: 'inherit',
})

server.on('error', (error) => {
  console.error(`Next.js 启动失败：${error.message}`)
  process.exitCode = 1
})

server.on('exit', (code) => {
  process.exitCode = code ?? 1
})

process.on('SIGINT', () => server.kill('SIGINT'))
process.on('SIGTERM', () => server.kill('SIGTERM'))
