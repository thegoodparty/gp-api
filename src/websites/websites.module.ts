import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { DomainsController } from './controllers/domains.controller'
import { DomainsService } from './services/domains.service'
import { WebsitesService } from './services/websites.service'
import { AwsModule } from 'src/aws/aws.module'
import { VercelModule } from 'src/vercel/vercel.module'
import { WebsitesController } from './controllers/websites.controller'

@Module({
  imports: [HttpModule, AwsModule, VercelModule],
  controllers: [DomainsController, WebsitesController],
  providers: [DomainsService, WebsitesService],
})
export class WebsitesModule {}
