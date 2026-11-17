import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class StaticQueryDto {
  @ApiPropertyOptional({ description: 'true 时从固定资料源重新获取；30 秒冷却，失败保留原缓存并返回错误', default: false })
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsOptional()
  @IsBoolean()
  refresh = false
}
