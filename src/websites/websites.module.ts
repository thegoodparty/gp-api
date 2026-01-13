import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { FilesModule } from 'src/files/files.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { PurchaseType } from 'src/payments/purchase.types'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { UsersModule } from 'src/users/users.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { StripeModule } from 'src/vendors/stripe/stripe.module'
import { VercelModule } from 'src/vendors/vercel/vercel.module'
import { QueueProducerModule } from '../queue/producer/queueProducer.module'
import { ForwardEmailModule } from '../vendors/forwardEmail/forwardEmail.module'
import { DomainsController } from './controllers/domains.controller'
import { WebsitesController } from './controllers/websites.controller'
import { DomainsService } from './services/domains.service'
import { WebsiteContactsService } from './services/websiteContacts.service'
import { WebsitesService } from './services/websites.service'
import { WebsiteViewsService } from './services/websiteViews.service'

@Module({
  imports: [
    HttpModule,
    AwsModule,
    VercelModule,
    ForwardEmailModule,
    FilesModule,
    PaymentsModule,
    UsersModule,
    StripeModule,
    forwardRef(() => CampaignsModule),
    QueueProducerModule,
  ],
  controllers: [DomainsController, WebsitesController],
  providers: [
    DomainsService,
    WebsitesService,
    WebsiteContactsService,
    WebsiteViewsService,
  ],
  exports: [DomainsService, WebsitesService],
})
export class WebsitesModule {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly domainsService: DomainsService,
  ) {
    this.purchaseService.registerPurchaseHandler(
      PurchaseType.DOMAIN_REGISTRATION,
      this.domainsService,
    )

    this.purchaseService.registerPostPurchaseHandler(
      PurchaseType.DOMAIN_REGISTRATION,
      this.domainsService.handleDomainPostPurchase.bind(this.domainsService),
    )
  }
}
