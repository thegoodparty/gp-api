import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { LlmModule } from 'src/llm/llm.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { PurchaseType } from 'src/payments/purchase.types'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { QueueProducerModule } from 'src/queue/producer/queueProducer.module'
import { UsersModule } from 'src/users/users.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { PollsController } from './polls.controller'
import { PollBiasAnalysisService } from './services/pollBiasAnalysis.service'
import { PollIssuesService } from './services/pollIssues.service'
import { PollPurchaseHandlerService } from './services/pollPurchase.service'
import { PollsService } from './services/polls.service'
import { ContactsModule } from '@/contacts/contacts.module'

@Module({
  imports: [
    ElectedOfficeModule,
    PaymentsModule,
    QueueProducerModule,
    UsersModule,
    CampaignsModule,
    AwsModule,
    LlmModule,
    ContactsModule,
  ],
  providers: [
    PollsService,
    PollIssuesService,
    PollPurchaseHandlerService,
    PollBiasAnalysisService,
  ],
  controllers: [PollsController],
  exports: [PollsService, PollIssuesService, PollBiasAnalysisService],
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
