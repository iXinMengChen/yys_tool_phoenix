/// <reference types="node" />

import { z } from 'zod'

/* 读取顺序：变量定义 → 各应用子集 → 加载与校验 → 导出。
 * 应用只引用自己需要的入口（loadApiEnv / loadWebEnv），
 * 避免一个应用被迫配置另一个应用的变量。 */

/** 端口：字符串或数字；缺失或非法时保留原值交给 z.number() 报错，避免出现 NaN */
const port = z.preprocess(
  (value) =>
    typeof value === 'string' && Number.isFinite(Number(value))
      ? Number(value)
      : value,
  z.number().int().min(1).max(65535),
)
export const databaseUrlSchema = z
  .url()
  .refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
    message: '必须是 PostgreSQL 连接地址',
  })

const envSchema = z.object({
  API_BASE_URL: z.string(),
  API_PORT: port,
  DATABASE_URL: databaseUrlSchema,
  CBG_LOGIN_COOKIE: z.string().trim().max(16384).regex(/^[^\r\n]*$/, 'Cookie 格式无效').default(''),
  PORT: port,
  API_PROXY_URL: z.url(),
  NEXT_PUBLIC_API_BASE_URL: z.string(),
})

const apiEnvFields = envSchema.pick({
  API_PORT: true,
  API_BASE_URL: true,
  DATABASE_URL: true,
  CBG_LOGIN_COOKIE: true,
})
const webEnvFields = envSchema.pick({
  PORT: true,
  API_PROXY_URL: true,
  NEXT_PUBLIC_API_BASE_URL: true,
})

export const apiEnvSchema = apiEnvFields.transform(
  ({ API_PORT, API_BASE_URL, DATABASE_URL, CBG_LOGIN_COOKIE }) => ({
    apiPort: API_PORT,
    baseUrl: API_BASE_URL,
    databaseUrl: DATABASE_URL,
    cbgLoginCookie: CBG_LOGIN_COOKIE,
  }),
)

const webEnvSchema = webEnvFields.transform(
  ({ PORT, API_PROXY_URL, NEXT_PUBLIC_API_BASE_URL }) => ({
    webPort: PORT,
    apiProxyUrl: API_PROXY_URL,
    apiBaseUrl: NEXT_PUBLIC_API_BASE_URL,
  }),
)

export type ApiEnv = z.infer<typeof apiEnvSchema>
export type WebEnv = z.infer<typeof webEnvSchema>

const defaultEnvFile = '../../.env'

let isEnvFileLoaded = false

/** 读取 monoenv 生成的根 .env；文件不存在时允许完全依赖进程环境变量。 */
function loadEnvFile() {
  if (isEnvFileLoaded) return
  isEnvFileLoaded = true

  try {
    process.loadEnvFile(process.env.PHOENIX_ENV_FILE ?? defaultEnvFile)
  } catch (error) {
    const isMissingFile =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'

    if (!isMissingFile) throw error
  }
}

/** 没有默认值、又没有取到值的变量名。 */
function missingKeys(fields: { shape: Record<string, z.ZodType> }): string[] {
  return Object.keys(fields.shape).filter(
    (key) =>
      !fields.shape[key].safeParse(undefined).success &&
      (process.env[key] ?? '').trim() === '',
  )
}

function parseEnv<TOutput>(
  fields: { shape: Record<string, z.ZodType> },
  schema: z.ZodType<TOutput>,
): TOutput {
  loadEnvFile()

  const envFile = process.env.PHOENIX_ENV_FILE ?? defaultEnvFile

  const missing = missingKeys(fields)
  if (missing.length > 0) {
    throw new Error(
      `环境变量缺少配置：${missing.join('、')}\n环境文件：${envFile}`,
    )
  }

  const result = schema.safeParse(process.env)
  if (result.success) return result.data

  const issues = result.error.issues.map(
    (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
  )

  throw new Error([`环境变量格式错误（${envFile}）：`, ...issues].join('\n'))
}

/** 解析一次并复用：配置是启动期数据，重复调用不应该重复校验。 */
function memo<TOutput>(load: () => TOutput): () => TOutput {
  let value: TOutput | undefined
  return () => (value ??= load())
}

/** NestJS：只校验 API 需要的变量，结果缓存。 */
export const loadApiEnv = memo(() => parseEnv(apiEnvFields, apiEnvSchema))

/** Next.js 服务端：只校验 Web 需要的变量，结果缓存；浏览器侧请用 @phoenix/config/public-env。 */
export const loadWebEnv = memo(() => parseEnv(webEnvFields, webEnvSchema))
