import { Controller, Get, Header, HttpStatus } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { DesktopReleaseInfo } from '@phoenix/types'
import { PrismaService } from '../../database/prisma.service'

@ApiTags('桌面应用')
@Controller('desktop')
export class DesktopController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('version')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询桌面应用发布版本与下载地址（不自动安装）', description: '实时读取数据库中发布时间最新的版本，下载入口引导至网盘。' })
  @ApiOkResponse({
    description: '无发布记录返回 configured:false；有记录返回版本、HTTPS 网盘地址和发布说明',
    schema: {
      type: 'object', required: ['code', 'message', 'data'],
      properties: {
        code: { type: 'integer', enum: [HttpStatus.OK] },
        message: { type: 'string', enum: ['success'] },
        data: {
          oneOf: [
            { type: 'object', required: ['configured'], properties: { configured: { type: 'boolean', enum: [false] } } },
            {
              type: 'object', required: ['configured', 'version', 'downloadUrl', 'notes'],
              properties: {
                configured: { type: 'boolean', enum: [true] },
                version: { type: 'string', description: 'SemVer 2.0 版本' },
                downloadUrl: { type: 'string', format: 'uri', description: 'HTTPS 下载地址' },
                notes: { type: 'string', description: '纯文本发布说明，可为空' },
              },
            },
          ],
        },
      },
    },
  })
  async getVersion(): Promise<DesktopReleaseInfo> {
    const release = await this.prisma.desktopRelease.findFirst({
      orderBy: [{ publishedAt: 'desc' }, { version: 'asc' }],
      select: { version: true, downloadUrl: true, notes: true },
    })
    if (!release) return { configured: false }
    return { configured: true, ...release }
  }
}
