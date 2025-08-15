import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { QueueConsumerService } from './queueConsumer.service'
import { queueConfig } from '../queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { QueueProducerModule } from '../producer/queueProducer.module'

@Module({
  imports: [
    SqsModule.register({
      consumers: [
        {
          ...queueConfig,
          pollingWaitTimeMs: 1000,
        },
      ],
    }),
    CampaignsAiModule,
    PathToVictoryModule,
    ElectionsModule,
    QueueProducerModule,
  ],
  providers: [QueueConsumerService],
})
export class QueueConsumerModule {}
