import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../env'
import { CbgUpstream } from './cbg-upstream'
import type { ProductQueryDto } from './product-query.dto'

const loginResponseSchema = z.object({
  status: z.union([z.literal(1), z.literal('1')]),
  status_code: z.union([z.string(), z.number()]).optional(),
})
const sidSchema = z.string().min(1).max(4096).regex(/^[^;\s,]+$/)

export function sidFromHeaders(headers: Headers) {
  const candidates = [
    ...['sid', 'x-sid', 'cbg-sid', 'x-cbg-sid'].map(name => headers.get(name)?.trim().replace(/^sid=/i, '').split(';')[0]),
    ...Array.from((headers.get('set-cookie') ?? '').matchAll(/(?:^|[,;]\s*)sid=([^;,]*)/gi), match => match[1].trim()),
  ]
  for (const candidate of candidates) {
    const parsed = sidSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }
}

// Log only bounded numeric business codes, never upstream messages or credentials.
function diagnosticCode(value: unknown) {
  return (typeof value === 'string' || typeof value === 'number') && /^-?\d{1,10}$/.test(String(value)) ? String(value) : 'unknown'
}

export function withSid(cookie: string, sid: string) {
  const otherCookies = cookie.split(';').map((value) => value.trim()).filter((value) => value && !/^sid\s*=/i.test(value))
  return [...otherCookies, `sid=${sid}`].join('; ')
}

function withResponseCookies(cookie: string, headers: Headers) {
  const cookies = new Map<string, string>()
  const save = (pair: string) => {
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
  }
  cookie.split(';').forEach(save)
  for (const value of headers.getSetCookie()) {
    const pair = value.split(';')[0]
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    const name = pair.slice(0, separator).trim()
    const maxAge = value.match(/;\s*max-age=(-?\d+)(?:;|$)/i)?.[1]
    const expires = value.match(/;\s*expires=([^;]+)/i)?.[1]
    const expired = maxAge !== undefined ? Number(maxAge) <= 0 : expires !== undefined && Date.parse(expires) <= Date.now()
    if (expired) cookies.delete(name)
    else save(pair)
  }
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
}

@Injectable()
export class CbgSessionService {
  private cookie = env.cbgLoginCookie
  private sid: string
  private refreshedAt: string | null = null
  private refreshInFlight?: Promise<void>

  constructor(private readonly upstream: CbgUpstream) {
    const cookieSid = sidSchema.safeParse(env.cbgLoginCookie.match(/(?:^|;)\s*sid\s*=\s*([^;]*)/i)?.[1]?.trim())
    this.sid = cookieSid.success ? cookieSid.data : ''
  }

  status() {
    return { configured: Boolean(this.sid), refreshedAt: this.refreshedAt }
  }

  async cookieForProduct(query: ProductQueryDto) {
    if (!this.sid) throw new ServiceUnavailableException('服务端未配置藏宝阁会话')
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh(query).finally(() => { this.refreshInFlight = undefined })
    }
    await this.refreshInFlight
    return withSid(this.cookie, this.sid)
  }

  private async refresh(query: ProductQueryDto) {
    const url = new URL('https://yys.cbg.163.com/cgi/api/login_auto')
    url.search = new URLSearchParams({
      client_type: 'h5',
      view_loc: query.view_loc ?? '',
      exter: 'direct',
      page_session_id: randomUUID().toUpperCase(),
      traffic_trace: JSON.stringify(query.tfid || query.tcid
        ? { field_id: query.tfid ?? '', content_id: query.tcid ?? '' } : {}),
    }).toString()
    const { json, headers } = await this.upstream.request(url, {
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        cookie: withSid(this.cookie, this.sid),
        referer: `https://yys.cbg.163.com/cgi/mweb/equip/${query.serverid}/${query.ordersn}`,
        'x-requested-with': 'XMLHttpRequest',
      },
    })
    const parsed = loginResponseSchema.safeParse(json)
    if (!parsed.success) {
      const status = json && typeof json === 'object' && 'status' in json ? json.status : undefined
      const statusCode = json && typeof json === 'object' && 'status_code' in json ? json.status_code : undefined
      throw new BadGatewayException(`藏宝阁会话刷新失败：上游未确认登录（status=${diagnosticCode(status)}，status_code=${diagnosticCode(statusCode)}）`)
    }
    const nextSid = sidFromHeaders(headers)
    if (!nextSid) throw new BadGatewayException('藏宝阁会话刷新失败：登录响应缺少有效 SID 响应头')
    this.cookie = withSid(withResponseCookies(this.cookie, headers), nextSid)
    this.sid = nextSid
    this.refreshedAt = new Date().toISOString()
  }
}
