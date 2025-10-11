import { Module } from '@nestjs/common'
import { PollsController } from './polls.controller'
import { PollsService } from './services/polls.service'
import { AnalyticsModule } from 'src/analytics/analytics.module'

@Module({
  imports: [AnalyticsModule],
  providers: [PollsService],
  controllers: [PollsController],
  exports: [PollsService],
})
export class PollsModule {}
