import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { Request, Response } from 'express'

const windowMs = 10_000
const maxClients = 20_000

@Injectable()
export class RateLimitGuard implements CanActivate {
  // ponytail: per-process counters; use shared storage before deploying multiple API replicas.
  private readonly clients = new Map<string, { count: number; resetAt: number }>()
  private lastCleanup = 0

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()
    const now = performance.now()
    if (now - this.lastCleanup >= windowMs) {
      for (const [key, client] of this.clients) {
        if (client.resetAt <= now) this.clients.delete(key)
      }
      this.lastCleanup = now
    }

    const isImage = /\/cbg\/(?:images|collection-images)\//.test(request.path)
    const limit = isImage ? 60 : 10
    const key = `${isImage ? 'images' : 'api'}:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`
    let client = this.clients.get(key)
    if (client && client.resetAt <= now) {
      this.clients.delete(key)
      client = undefined
    }
    if (!client && this.clients.size < maxClients) {
      client = { count: 0, resetAt: now + windowMs }
      this.clients.set(key, client)
    }
    if (!client || client.count >= limit) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil(((client?.resetAt ?? now + windowMs) - now) / 1000)))
      response.setHeader('Cache-Control', 'no-store')
      throw new HttpException('访问过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    client.count += 1
    return true
  }
}
