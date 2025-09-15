import { forwardRef, Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { DomainsController } from './controllers/domains.controller'
import { DomainsService } from './services/domains.service'
import { WebsitesService } from './services/websites.service'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { VercelModule } from 'src/vendors/vercel/vercel.module'
import { WebsitesController } from './controllers/websites.controller'
import { FilesModule } from 'src/files/files.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { UsersModule } from 'src/users/users.module'
import { WebsiteContactsService } from './services/websiteContacts.service'
import { WebsiteViewsService } from './services/websiteViews.service'
import { PurchaseService } from 'src/payments/services/purchase.service'
import { PurchaseType } from 'src/payments/purchase.types'
import { StripeModule } from 'src/vendors/stripe/stripe.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ForwardEmailModule } from '../vendors/forwardEmail/forwardEmail.module'

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
