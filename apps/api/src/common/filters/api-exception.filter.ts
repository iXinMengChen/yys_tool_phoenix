import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import type { ApiResponse } from '@phoenix/types'

function getMessage(exception: HttpException): string {
  const payload = exception.getResponse()

  if (typeof payload === 'string') return payload

  if ('message' in payload) {
    const message = payload.message

    if (typeof message === 'string') return message
    if (Array.isArray(message)) {
      const messages = message.filter(
        (item): item is string => typeof item === 'string',
      )
      if (messages.length > 0) return messages.join('；')
    }
  }

  return exception.message
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR
    const isServerError = statusCode >= HttpStatus.INTERNAL_SERVER_ERROR

    if (isServerError) {
      this.logger.error(
        exception instanceof Error
          ? exception.stack ?? exception.message
          : '未知服务器异常',
      )
    }

    const body: ApiResponse<null> = {
      code: statusCode,
      message:
        !isServerError && exception instanceof HttpException
          ? getMessage(exception)
          : '服务器内部错误，请稍后重试',
      data: null,
    }

    response.status(statusCode).json(body)
  }
}
