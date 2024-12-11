import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { EnqueueService } from './enqueue.service'
import { MessageHandler } from './util/messageHandler.util'
import { QueueController } from './queue.controller'

@Module({
  imports: [
    SqsModule.register({
      consumers: [
        {
          name: process.env.SQS_QUEUE || '',
          queueUrl: process.env.SQS_QUEUE_URL || '',
          region: process.env.AWS_REGION,
          waitTimeSeconds: 1,
          pollingWaitTimeMs: 1000,
        },
      ],
      producers: [
        {
          name: process.env.SQS_QUEUE || '',
          queueUrl: process.env.SQS_QUEUE_URL || '',
          region: process.env.AWS_REGION,
        },
      ],
    }),
  ],
  controllers: [QueueController],
  providers: [MessageHandler, EnqueueService],
  exports: [EnqueueService],
})
export class QueueModule {}
