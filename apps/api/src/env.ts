import { loadApiEnv } from '@phoenix/config/env'

/**
 * 启动时校验并冻结配置：import 本模块即完成校验，
 * 变量缺失或格式错误会在这个 import 阶段直接抛错，进程不会继续启动。
 */
export const env = loadApiEnv()
