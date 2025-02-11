import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { ConsumerService } from './consumer.service'
import { queueConfig } from '../queue.config'
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
    CampaignsAiModule,
  ],
  providers: [ConsumerService],
})
export class QueueConsumerModule {}
