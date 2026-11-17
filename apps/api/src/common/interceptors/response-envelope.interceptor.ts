import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import type { ApiResponse } from '@phoenix/types'

@Injectable()
export class ResponseEnvelopeInterceptor
  implements NestInterceptor<unknown, ApiResponse<unknown> | StreamableFile> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<unknown> | StreamableFile> {
    return next.handle().pipe(
      map((data: unknown) => data instanceof StreamableFile ? data : ({
        code: HttpStatus.OK,
        message: 'success',
        data: data === undefined ? null : data,
      })),
    )
  }
}
