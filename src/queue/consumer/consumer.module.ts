import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { ConsumerService } from './consumer.service'
import { queueConfig } from '../queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { PeerlyModule } from '../../peerly/peerly.module'

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
    PeerlyModule,
  ],
  providers: [ConsumerService],
})
export class QueueConsumerModule {}
