import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export const cbgChannels = ['official', 'huawei', 'oppo', 'vivo', 'xiaomi'] as const
export type CbgChannel = (typeof cbgChannels)[number]

export class ProductQueryDto {
  @ApiProperty({ description: '藏宝阁区服编号' })
  @IsString()
  @Matches(/^\d{1,20}$/)
  serverid!: string

  @ApiProperty({ description: '藏宝阁商品编号' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  ordersn!: string

  @ApiPropertyOptional({ enum: cbgChannels, default: 'official' })
  @IsIn(cbgChannels)
  channel: CbgChannel = 'official'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^[^\r\n]*$/)
  view_loc?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]*$/)
  tfid?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]*$/)
  tcid?: string
}
