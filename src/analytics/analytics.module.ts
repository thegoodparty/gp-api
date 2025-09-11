import { forwardRef, Global, Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { HttpModule } from '@nestjs/axios'
import { SegmentModule } from 'src/vendors/segment/segment.module'
import { UsersModule } from '../users/users.module'

@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  imports: [HttpModule, SegmentModule, forwardRef(() => UsersModule)],
})
export class AnalyticsModule {}
