import { HttpModule } from '@nestjs/axios'
import { forwardRef, Global, Module } from '@nestjs/common'
import { SegmentModule } from 'src/vendors/segment/segment.module'
import { UsersModule } from '../users/users.module'
import { AnalyticsService } from './analytics.service'

@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  imports: [HttpModule, SegmentModule, forwardRef(() => UsersModule)],
})
export class AnalyticsModule {}
