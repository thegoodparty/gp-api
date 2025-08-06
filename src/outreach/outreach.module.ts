import { Module } from '@nestjs/common'
import { OutreachController } from './outreach.controller'
import { OutreachService } from './services/outreach.service'
import { OutreachPurchaseHandlerService } from './services/outreachPurchase.service'
import { HttpModule } from '@nestjs/axios'
import { EmailModule } from 'src/email/email.module'
import { FilesModule } from '../files/files.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { PurchaseType } from 'src/payments/purchase.types'

@Module({
  imports: [HttpModule, EmailModule, FilesModule, PaymentsModule],
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
      PurchaseType.OUTREACH,
      this.outreachPurchaseHandler,
    )

    this.purchaseService.registerPostPurchaseHandler(
      PurchaseType.OUTREACH,
      this.outreachPurchaseHandler.executePostPurchase.bind(
        this.outreachPurchaseHandler,
      ),
    )
  }
}
