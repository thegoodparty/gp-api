import { Global, Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { HttpModule } from '@nestjs/axios'
import { SegmentModule } from 'src/vendors/segment/segment.module'
import { SharedModule } from 'src/shared/shared.module'

@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  imports: [HttpModule, SegmentModule, SharedModule],
})
export class AnalyticsModule {}
