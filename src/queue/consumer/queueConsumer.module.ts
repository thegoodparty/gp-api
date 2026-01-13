import { Module } from '@nestjs/common'
import { SqsModule } from '@ssut/nestjs-sqs'
import { CampaignsAiModule } from 'src/campaigns/ai/campaignsAi.module'
import { ContactsModule } from 'src/contacts/contacts.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { PollsModule } from 'src/polls/polls.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AnalyticsModule } from '../../analytics/analytics.module'
import { PathToVictoryModule } from '../../pathToVictory/pathToVictory.module'
import { WebsitesModule } from '../../websites/websites.module'
import { QueueProducerModule } from '../producer/queueProducer.module'
import { queueConfig } from '../queue.config'
import { QueueConsumerService } from './queueConsumer.service'

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
    ContactsModule,
    AwsModule,
  ],
  providers: [QueueConsumerService],
})
export class QueueConsumerModule {}
