import { createApiClient } from '@phoenix/api-client'
import { apiBaseUrl } from '@phoenix/config/public-env'

// 会话刷新、详情与描述回退各有 20 秒上游超时，预留校验与传输时间。
const apiTimeoutMs = 70_000

export const apiClient = createApiClient({
  baseURL: apiBaseUrl,
  timeout: apiTimeoutMs,
})
