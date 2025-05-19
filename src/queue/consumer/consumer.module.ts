import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { ConsumerService } from './consumer.service'
import { queueConfig } from '../queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { AnalyticsModule } from 'src/analytics/analytics.module'

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
    PathToVictoryModule,
    ElectionsModule,
    AnalyticsModule,
  ],
  providers: [ConsumerService],
})
export class QueueConsumerModule {}
