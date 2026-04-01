import { Module, forwardRef } from '@nestjs/common'
import { TemporalService } from './services/temporal.service'
import { TemporalWorkerService } from './services/temporalWorker.service'
import { PollsModule } from '@/polls/polls.module'

@Module({
  imports: [forwardRef(() => PollsModule)],
  providers: [TemporalService, TemporalWorkerService],
  exports: [TemporalService],
})
export class TemporalModule {}
