import { forwardRef, Module } from '@nestjs/common'
import { OutreachController } from './outreach.controller'
import { OutreachService } from './services/outreach.service'
import { OutreachPurchaseHandlerService } from './services/outreachPurchase.service'
import { HttpModule } from '@nestjs/axios'
import { EmailModule } from 'src/email/email.module'
import { FilesModule } from '../files/files.module'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { PurchaseType } from 'src/payments/purchase.types'
import { PaymentsModule } from '../payments/payments.module'
import { PeerlyModule } from '../peerly/peerly.module'
import { CampaignsModule } from '../campaigns/campaigns.module'

@Module({
  imports: [HttpModule, EmailModule, FilesModule, PaymentsModule, PeerlyModule, forwardRef(() => CampaignsModule)],
  controllers: [OutreachController],
  providers: [OutreachService, OutreachPurchaseHandlerService],
  exports: [OutreachService, OutreachPurchaseHandlerService],
})
export class OutreachModule {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly outreachPurchaseHandler: OutreachPurchaseHandlerService,
  ) {
    this.purchaseService.registerPurchaseHandler(
      PurchaseType.TEXT,
      this.outreachPurchaseHandler,
    )

    this.purchaseService.registerPostPurchaseHandler(
      PurchaseType.TEXT,
      this.outreachPurchaseHandler.handleTextOutreachPostPurchase.bind(this.outreachPurchaseHandler),
    )
  }
}
