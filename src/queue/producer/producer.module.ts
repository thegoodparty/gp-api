import { Module } from '@nestjs/common'
import { EnqueueService } from './enqueue.service'
import { QueueController } from './queue.controller'

@Module({
  controllers: [QueueController],
  providers: [EnqueueService],
  exports: [EnqueueService],
})
export class QueueProducerModule {}
