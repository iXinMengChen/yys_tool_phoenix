import { PickType, ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { ProductQueryDto } from './product-query.dto'

export class ProductSummaryDto extends PickType(ProductQueryDto, ['channel', 'serverid', 'ordersn'] as const) {
  @ApiProperty({ description: '客户端生成的商品纯文本摘要，不得包含登录凭据或账号私密资料', minLength: 1, maxLength: 32000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  summary!: string
}
