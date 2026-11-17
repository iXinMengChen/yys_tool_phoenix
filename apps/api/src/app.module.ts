import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { RateLimitGuard } from './common/guards/rate-limit.guard'
import { PrismaModule } from './database/prisma.module'
import { HealthModule } from './modules/health/health.module'
import { CbgModule } from './modules/cbg/cbg.module'
import { DesktopModule } from './modules/desktop/desktop.module'

@Module({
  imports: [PrismaModule, HealthModule, CbgModule, DesktopModule],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
