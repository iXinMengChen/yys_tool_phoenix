import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

const logger = new Logger('HTTP')

export function requestLoggerMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const startedAt = Date.now()

  response.on('finish', () => {
    const duration = Date.now() - startedAt
    logger.log(
      `${request.method} ${request.path} ${response.statusCode} ${duration}ms`,
    )
  })

  next()
}
