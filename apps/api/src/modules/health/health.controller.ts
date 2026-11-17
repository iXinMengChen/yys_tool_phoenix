import { Controller, Get, HttpStatus } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { HealthResponse } from '@phoenix/types'

@ApiTags('系统')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '健康检查' })
  @ApiOkResponse({
    description: 'API 服务正常',
    schema: {
      example: {
        code: HttpStatus.OK,
        message: 'success',
        data: { status: 'ok' },
      },
    },
  })
  getHealth(): HealthResponse {
    return { status: 'ok' }
  }
}
