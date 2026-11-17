import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(rootDirectory, 'apps', 'api', 'package.json'))
const { Client } = require('pg')
const { databaseUrlSchema } = require('@phoenix/config/env')

try {
  process.loadEnvFile('../../.env')
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error
  }
}

const databaseUrl = databaseUrlSchema.parse(process.env.DATABASE_URL)
const targetUrl = new URL(databaseUrl)
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1))
if (!databaseName || databaseName.includes('/')) {
  throw new Error('DATABASE_URL 必须包含一个有效数据库名')
}

const adminUrl = new URL(targetUrl)
adminUrl.pathname = '/postgres'
adminUrl.searchParams.delete('schema')

const connectionTimeoutMs = 5_000
const client = new Client({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: connectionTimeoutMs,
})

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

try {
  await client.connect()
  const existing = await client.query(
    'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
    [databaseName],
  )

  if (existing.rows[0]?.exists) {
    console.log('Phoenix 数据库已存在')
  } else {
    const permission = await client.query(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreatedb OR rolsuper)) AS allowed',
    )
    if (!permission.rows[0]?.allowed) {
      throw new Error('当前 PostgreSQL 角色缺少 CREATEDB 权限')
    }

    try {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== '42P04') {
        throw error
      }
    }
    console.log('Phoenix 数据库已创建')
  }
} catch (error) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'unknown'
  let reason = '请检查 PostgreSQL 配置、连接状态和 CREATEDB 权限'
  if (code === '28P01') {
    reason = 'PostgreSQL 用户名或密码认证失败，请检查 DATABASE_URL'
  } else if (error instanceof Error && error.message.includes('CREATEDB')) {
    reason = error.message
  }
  console.error(`数据库初始化失败（${code}）：${reason}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
