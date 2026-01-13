import { Module } from '@nestjs/common'
import { AnalyticsModule } from 'src/analytics/analytics.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsModule } from 'src/contacts/contacts.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { PollsModule } from 'src/polls/polls.module'
import { PollAnalysisCompleteHandler } from './functions/pollAnalysisComplete.handler'
import { InngestService } from './inngest.service'

@Module({
  imports: [
    PollsModule,
    ContactsModule,
    CampaignsModule,
    ElectedOfficeModule,
    AnalyticsModule,
  ],
  providers: [InngestService, PollAnalysisCompleteHandler],
  exports: [InngestService],
})
export class InngestModule {}
