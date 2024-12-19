import { forwardRef, Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { EnqueueService } from './enqueue.service'
import { ConsumerService } from './consumer.service'
import { QueueController } from './queue.controller'
import { queueConfig } from './queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'

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
    forwardRef(() => CampaignsAiModule),
  ],
  controllers: [QueueController],
  providers: [ConsumerService, EnqueueService],
  exports: [EnqueueService],
})
export class QueueModule {}
