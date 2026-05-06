import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { AiModule } from 'src/ai/ai.module'
import { EmailModule } from 'src/email/email.module'
import { PurchaseType } from 'src/payments/purchase.types'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { GoogleModule } from 'src/vendors/google/google.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { FilesModule } from '../files/files.module'
import { PaymentsModule } from '../payments/payments.module'
import { PeerlyModule } from '../vendors/peerly/peerly.module'
import { VotersModule } from '../voters/voters.module'
import { OutreachController } from './outreach.controller'
import { OutreachNotificationInterceptor } from './interceptors/outreachNotification.interceptor'
import { OutreachService } from './services/outreach.service'
import { OutreachNotificationService } from './services/outreachNotification.service'
import { OutreachPurchaseHandlerService } from './services/outreachPurchase.service'

@Module({
  imports: [
    ClerkModule,
    HttpModule,
    EmailModule,
    FilesModule,
    PaymentsModule,
    forwardRef(() => PeerlyModule),
    // Outreach → Voters → Peerly → Outreach is a 3-cycle in both the file-import
    // graph and the Nest module DI graph. forwardRef defers resolution on this
    // edge so Nest can complete bootstrap.
    forwardRef(() => VotersModule),
    GoogleModule,
    AiModule,
    SlackModule,
  ],
  controllers: [OutreachController],
  providers: [
    OutreachService,
    OutreachNotificationService,
    OutreachNotificationInterceptor,
    OutreachPurchaseHandlerService,
  ],
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
      (sessionId, metadata) =>
        this.outreachPurchaseHandler.executePostPurchase(sessionId, metadata),
    )
  }
}
