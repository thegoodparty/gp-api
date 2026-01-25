import { Module } from '@nestjs/common'
import { AnalyticsModule } from 'src/analytics/analytics.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsModule } from 'src/contacts/contacts.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { PollsModule } from 'src/polls/polls.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { InngestService } from './services/inngest.service'
import { PollAnalysisHandlerService } from './services/pollAnalysisHandler.service'
import { PollCreationHandlerService } from './services/pollCreationHandler.service'
import { InngestController } from './inngest.controller'

@Module({
  imports: [
    PollsModule,
    CampaignsModule,
    ContactsModule,
    AnalyticsModule,
    ElectedOfficeModule,
    AwsModule,
    SlackModule,
  ],
  controllers: [InngestController],
  providers: [
    InngestService,
    PollAnalysisHandlerService,
    PollCreationHandlerService,
  ],
  exports: [
    InngestService,
    PollAnalysisHandlerService,
    PollCreationHandlerService,
  ],
})
export class InngestModule {}
