import { Module } from '@nestjs/common'
import { PrismaModule } from '../../database/prisma.module'
import { CbgController } from './cbg.controller'
import { CbgService } from './cbg.service'
import { CbgProductSummaryService } from './cbg-product-summary.service'
import { CbgSessionService } from './cbg-session.service'
import { CbgUpstream } from './cbg-upstream'
import { CbgStaticService } from './cbg-static.service'
import { CbgCollectionImagesService } from './cbg-collection-images.service'

@Module({
  imports: [PrismaModule],
  controllers: [CbgController],
  providers: [CbgService, CbgProductSummaryService, CbgSessionService, CbgUpstream, CbgStaticService, CbgCollectionImagesService],
})
export class CbgModule {}
