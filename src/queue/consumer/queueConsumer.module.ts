import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { QueueConsumerService } from './queueConsumer.service'
import { queueConfig } from '../queue.config'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { QueueProducerModule } from '../producer/queueProducer.module'
import { AnalyticsModule } from '../../analytics/analytics.module'
import { WebsitesModule } from '../../websites/websites.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { PollsModule } from 'src/polls/polls.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'

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
    AnalyticsModule,
    WebsitesModule,
    SlackModule,
    ElectedOfficeModule,
    PollsModule,
  ],
  providers: [QueueConsumerService],
})
export class QueueConsumerModule {}
