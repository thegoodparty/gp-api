import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { DomainsController } from './controllers/domains.controller'
import { DomainsService } from './services/domains.service'
import { WebsitesService } from './services/websites.service'
import { AwsModule } from 'src/aws/aws.module'
import { VercelModule } from 'src/vercel/vercel.module'
import { WebsitesController } from './controllers/websites.controller'
import { FilesModule } from 'src/files/files.module'
import { PaymentsModule } from 'src/payments/payments.module'
import { UsersModule } from 'src/users/users.module'
import { WebsiteContactsService } from './services/websiteContacts.service'
import { WebsiteViewsService } from './services/websiteViews.service'
import { DomainPurchaseHandler } from './handlers/domain-purchase.handler'

@Module({
  imports: [
    HttpModule,
    AwsModule,
    VercelModule,
    FilesModule,
    PaymentsModule,
    UsersModule,
  ],
  controllers: [DomainsController, WebsitesController],
  providers: [
    DomainsService,
    WebsitesService,
    WebsiteContactsService,
    WebsiteViewsService,
    DomainPurchaseHandler,
  ],
  exports: [DomainsService, WebsitesService, DomainPurchaseHandler],
})
export class WebsitesModule {}
