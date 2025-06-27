import { Global, Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { HttpModule } from '@nestjs/axios'
import { AnalyticsController } from './analytics.controller'
import { SegmentModule } from 'src/segment/segment.module'
import { SharedModule } from 'src/shared/shared.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { UsersModule } from 'src/users/users.module'

@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  imports: [
    HttpModule,
    SegmentModule,
    SharedModule,
    CampaignsModule,
    UsersModule,
  ],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
