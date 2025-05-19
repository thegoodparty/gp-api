import { Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { HttpModule } from '@nestjs/axios'
import { AnalyticsController } from './analytics.controller'
import { SegmentModule } from 'src/segment/segment.module'

@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  imports: [HttpModule, SegmentModule],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
