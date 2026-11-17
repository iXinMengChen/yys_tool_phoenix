import { BadGatewayException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { z } from 'zod'

export const maxCbgResponseBytes = 32 * 1024 * 1024
const cooldownMs = 24 * 60 * 60 * 1000
const riskPattern = /风控|账号安全|安全验证|请登录(?:之后|后)?继续访问|请完成验证|验证码|访问频繁|请求频繁|操作频繁|请求被拦截|异常请求|访问异常|稍后再试|系统繁忙[。.!！]?\s*反馈代号\s*\([a-z0-9-]+\)|too many requests|rate[-_ ]?limit|forbidden|blocked|captcha|security verification/i
const detailHosts = new Set([
  'yys.cbg.163.com', 'yys-huawei.cbg.163.com', 'yys-oppo.cbg.163.com',
  'yys-vivo.cbg.163.com', 'yys-xiaomi.cbg.163.com',
])
const messageSchema = z.object({
  status_code: z.union([z.string(), z.number()]).optional(),
  status: z.union([z.string(), z.number()]).optional(),
  msg: z.string().optional(),
  message: z.string().optional(),
  errmsg: z.string().optional(),
  error: z.string().optional(),
})

export function isAllowedCbgUrl(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port) return false
  if (url.hostname === 'cbg-yys.res.netease.com' &&
    ['/js/game_auto_config.js', '/js/server_list_data.js'].includes(url.pathname) && !url.search) return true
  if (detailHosts.has(url.hostname) && url.pathname === '/cgi/api/get_equip_detail') return true
  if (url.hostname === 'yys.cbg.163.com' && url.pathname === '/cgi/api/login_auto') return true
  return url.hostname === 'cbg-other-desc.res.netease.com' &&
    /^\/yys\/static\/equipdesc\/[A-Za-z0-9_-]{1,128}\.json$/.test(url.pathname)
}

/** Bounds decoded stream bytes as well as Content-Length (which may describe compressed bytes). */
export async function readCbgBody(response: Response) {
  if (Number(response.headers.get('content-length')) > maxCbgResponseBytes) {
    await response.body?.cancel()
    throw new BadGatewayException('藏宝阁响应超出大小限制')
  }
  if (!response.body) throw new BadGatewayException('藏宝阁返回空响应')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxCbgResponseBytes) {
        await reader.cancel()
        throw new BadGatewayException('藏宝阁响应超出大小限制')
      }
      chunks.push(value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
  } finally {
    reader.releaseLock()
  }
}

@Injectable()
export class CbgUpstream {
  // ponytail: single-process cooldown; shared storage is needed before running multiple API replicas.
  private cooldownUntil = 0

  assertAvailable() {
    if (this.cooldownUntil > Date.now()) {
      throw new HttpException('藏宝阁触发风控，查询已暂停，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  async request(url: URL, init: RequestInit = {}) {
    this.assertAvailable()
    if (!isAllowedCbgUrl(url)) throw new BadGatewayException('藏宝阁上游地址不受信任')
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if ([403, 429].includes(response.status)) {
        this.cooldownUntil = Date.now() + cooldownMs
        await response.body?.cancel().catch(() => undefined)
        this.assertAvailable()
      }
      const text = await readCbgBody(response)
      let json: unknown
      try { json = JSON.parse(text) as unknown } catch { /* HTML risk-control responses are handled below. */ }
      const metadata = messageSchema.safeParse(json)
      const message = metadata.success ? metadata.data : undefined
      const riskText = message
        ? [message.msg, message.message, message.errmsg, message.error].filter(Boolean).join(' ')
        : text.slice(0, 16_384)
      // Existing CBG deployments also signal risk control with this exact status-0 generic message.
      const knownUnavailableRisk = Number(message?.status) === 0 && message?.msg === '服务暂时不可用，请稍后重试'
      if ([403, 429].includes(Number(message?.status_code)) || riskPattern.test(riskText) || knownUnavailableRisk) {
        this.cooldownUntil = Date.now() + cooldownMs
        this.assertAvailable()
      }
      if (!response.ok || json === undefined) throw new BadGatewayException('藏宝阁响应无效')
      return { json, headers: response.headers }
    } catch (error) {
      if (error instanceof HttpException) throw error
      // Never attach upstream errors/causes: fetch errors can include credential-bearing headers.
      throw new BadGatewayException('藏宝阁暂时无法连接，请稍后重试')
    }
  }
}
