import { loadWebEnv } from '@phoenix/config/env'

/**
 * Web 服务端启动时校验并冻结配置：import 本模块即完成校验。
 * 浏览器侧请用 `@phoenix/config/public-env`，不要引用这里。
 */
export const env = loadWebEnv()
