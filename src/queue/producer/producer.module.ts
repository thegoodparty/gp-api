import { Module } from '@nestjs/common'
import { EnqueueService } from './enqueue.service'

@Module({
  providers: [EnqueueService],
  exports: [EnqueueService],
})
export class QueueProducerModule {}
