/**
 * 浏览器可以安全引用的公开配置。
 *
 * - 不依赖 zod 与任何 Node API，可以被打包进客户端
 * - `NEXT_PUBLIC_*` 由 Next.js 在构建时内联，改动后需要重新构建
 * - 服务端请用 `@phoenix/config/env`，那里会加载 .env、用 Zod 校验全部变量
 *
 * 校验规则与 env.ts 的 `apiBaseUrlSchema` 一致：只接受单个斜杠开头的站内路径。
 */

const fallbackApiBaseUrl = '/api'

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

export const apiBaseUrl =
  typeof configuredApiBaseUrl === 'string' &&
  configuredApiBaseUrl.startsWith('/') &&
  !configuredApiBaseUrl.startsWith('//')
    ? configuredApiBaseUrl
    : fallbackApiBaseUrl
