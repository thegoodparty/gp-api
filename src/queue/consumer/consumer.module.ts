import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { ConsumerService } from './consumer.service'
import { queueConfig } from '../queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { ElectionsModule } from 'src/elections/elections.module'

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
    CampaignsModule,
    PathToVictoryModule,
    ElectionsModule,
  ],
  providers: [ConsumerService],
})
export class QueueConsumerModule {}
