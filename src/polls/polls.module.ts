import { Module } from '@nestjs/common'
import { PollsController } from './polls.controller'
import { PollsService } from './services/polls.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { PollIssuesService } from './services/pollIssues.service'
import { PaymentsModule } from 'src/payments/payments.module'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { PurchaseType } from 'src/payments/purchase.types'
import { PollPurchaseHandlerService } from './services/pollPurchase.service'
import { QueueProducerModule } from 'src/queue/producer/queueProducer.module'

@Module({
  imports: [
    SlackModule,
    ElectedOfficeModule,
    PaymentsModule,
    QueueProducerModule,
  ],
  providers: [PollsService, PollIssuesService, PollPurchaseHandlerService],
  controllers: [PollsController],
  exports: [PollsService, PollIssuesService],
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
