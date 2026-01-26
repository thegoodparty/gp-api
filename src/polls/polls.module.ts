import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsModule } from 'src/contacts/contacts.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { LlmModule } from 'src/llm/llm.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { PurchaseType } from 'src/payments/purchase.types'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { UsersModule } from 'src/users/users.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { PollsController } from './polls.controller'
import { PollBiasAnalysisService } from './services/pollBiasAnalysis.service'
import { PollExecutionService } from './services/pollExecution.service'
import { PollIssuesService } from './services/pollIssues.service'
import { PollPurchaseHandlerService } from './services/pollPurchase.service'
import { PollsService } from './services/polls.service'

@Module({
  imports: [
    ElectedOfficeModule,
    PaymentsModule,
    UsersModule,
    CampaignsModule,
    ContactsModule,
    AwsModule,
    SlackModule,
    LlmModule,
  ],
  providers: [
    PollsService,
    PollIssuesService,
    PollPurchaseHandlerService,
    PollBiasAnalysisService,
    PollExecutionService,
  ],
  controllers: [PollsController],
  exports: [
    PollsService,
    PollIssuesService,
    PollBiasAnalysisService,
    PollExecutionService,
  ],
})
export class PollsModule {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly pollPurchaseHandler: PollPurchaseHandlerService,
  ) {
    this.purchaseService.registerPurchaseHandler(
      PurchaseType.POLL,
      this.pollPurchaseHandler,
    )

    this.purchaseService.registerPostPurchaseHandler(
      PurchaseType.POLL,
      this.pollPurchaseHandler.executePostPurchase.bind(
        this.pollPurchaseHandler,
      ),
    )
  }
}
