import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios'
import type { ApiResponse } from '@phoenix/types'

/**
 * 创建共享请求实例。全部配置由调用方传入，例如
 * `createApiClient({ baseURL: env.apiBaseUrl, timeout: 10_000 })`；
 * 这里不读取环境变量，也不预设 timeout，避免把服务端配置或请求策略藏进共享层。
 */
export function createApiClient(config: AxiosRequestConfig) {
  const instance: AxiosInstance = axios.create(config)

  async function request<T = unknown>(
    requestConfig: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    const response = await instance.request<ApiResponse<T>>(requestConfig)
    return response.data
  }

  function get<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
  ): Promise<ApiResponse<T>> {
    return request<T>({ url, method: 'GET', params })
  }

  function post<T = unknown>(
    url: string,
    data?: unknown,
  ): Promise<ApiResponse<T>> {
    return request<T>({ url, method: 'POST', data })
  }

  return { request, get, post }
}

export type ApiClient = ReturnType<typeof createApiClient>
