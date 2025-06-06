import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { DomainsController } from './controllers/domains.controller'
import { DomainsService } from './services/domains.service'
import { WebsiteService } from './services/website.service'
import { AwsModule } from 'src/aws/aws.module'
import { VercelModule } from 'src/vercel/vercel.module'

@Module({
  imports: [HttpModule, AwsModule, VercelModule],
  controllers: [DomainsController],
  providers: [DomainsService, WebsiteService],
})
export class WebsiteModule {}
