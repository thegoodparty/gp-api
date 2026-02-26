import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { AiModule } from 'src/ai/ai.module'
import { EmailModule } from 'src/email/email.module'
import { PurchaseType } from 'src/payments/purchase.types'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { GoogleModule } from 'src/vendors/google/google.module'
import { FilesModule } from '../files/files.module'
import { PaymentsModule } from '../payments/payments.module'
import { PeerlyModule } from '../vendors/peerly/peerly.module'
import { OutreachController } from './outreach.controller'
import { OutreachService } from './services/outreach.service'
import { OutreachPurchaseHandlerService } from './services/outreachPurchase.service'

@Module({
  imports: [
    HttpModule,
    EmailModule,
    FilesModule,
    PaymentsModule,
    PeerlyModule,
    GoogleModule,
    AiModule,
  ],
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

    this.purchaseService.registerCheckoutSessionPostPurchaseHandler(
      PurchaseType.TEXT,
      this.outreachPurchaseHandler.executePostPurchase.bind(
        this.outreachPurchaseHandler,
      ),
    )
  }
}
