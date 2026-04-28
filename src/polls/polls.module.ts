import { Module } from '@nestjs/common'
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
import { PollIndividualMessageService } from './services/pollIndividualMessage.service'
import { PollResponsesDownloadService } from './services/pollResponsesDownload.service'
import { ContactsModule } from '@/contacts/contacts.module'
import { OrganizationsModule } from '@/organizations/organizations.module'

@Module({
  imports: [
    ElectedOfficeModule,
    PaymentsModule,
    UsersModule,
    AwsModule,
    SlackModule,
    LlmModule,
    ContactsModule,
    OrganizationsModule,
  ],
  providers: [
    PollsService,
    PollIssuesService,
    PollPurchaseHandlerService,
    PollBiasAnalysisService,
    PollIndividualMessageService,
    PollResponsesDownloadService,
    PollExecutionService,
  ],
  controllers: [PollsController],
  exports: [
    PollsService,
    PollIssuesService,
    PollBiasAnalysisService,
    PollIndividualMessageService,
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

    this.purchaseService.registerCheckoutSessionPostPurchaseHandler(
      PurchaseType.POLL,
      (sessionId, metadata) =>
        this.pollPurchaseHandler.handlePollPostPurchase(sessionId, metadata),
    )
  }
}
