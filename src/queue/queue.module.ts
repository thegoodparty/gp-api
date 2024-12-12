import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { EnqueueService } from './enqueue.service'
import { ConsumerService } from './consumer.service'
import { QueueController } from './queue.controller'
import { queueConfig } from './queue.config'

@Module({
  imports: [
    SqsModule.register({
      consumers: [
        {
          ...queueConfig,
          pollingWaitTimeMs: 10000,
        },
      ],
    }),
  ],
  controllers: [QueueController],
  providers: [ConsumerService, EnqueueService],
  exports: [EnqueueService],
})
export class QueueModule {}
