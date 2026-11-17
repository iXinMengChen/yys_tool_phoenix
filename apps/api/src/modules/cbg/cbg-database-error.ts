// Only emit recognized codes and fixed hints; never serialize SQL, payloads or raw errors.
export function databaseError(error: unknown) {
  const codes = new Set<string>()
  function inspect(value: unknown, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return
    const record = value as Record<string, unknown>
    for (const key of ['code', 'errorCode', 'originalCode']) {
      const code = record[key]
      if (typeof code === 'string' && /^(?:P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)$/.test(code)) codes.add(code)
    }
    for (const key of ['meta', 'cause', 'driverAdapterError', 'originalError']) inspect(record[key], depth + 1)
  }
  inspect(error)
  const name = error instanceof Error && /^PrismaClient(?:KnownRequest|UnknownRequest|Validation|Initialization|RustPanic)Error$/.test(error.name)
    ? error.name : 'UnknownError'
  let hint = '核对 API 启动日志中的数据库目标与已提交迁移'
  if (codes.has('42501') || codes.has('P1010')) hint = '数据库权限不足；核对连接角色及目标表的读写、删除权限'
  else if (codes.has('42P01') || codes.has('42703') || codes.has('P2021') || codes.has('P2022')) hint = '核对目标数据库表结构与已提交迁移'
  else if (codes.has('28P01') || codes.has('28000') || codes.has('P1000')) hint = '数据库认证失败；核对连接账号及密码'
  else if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '08001', '08006', '53300', '57P01'].some(code => codes.has(code))) hint = '数据库连接不可用或超时；核对主机、端口及连接池'
  return `${name}/${[...codes].join('/') || 'UNKNOWN'}；${hint}`
}
