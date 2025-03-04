import { Module } from '@nestjs/common'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EcanvasserController } from './ecanvasser.controller'
import { EcanvasserService } from './ecanvasser.service'
import { HttpModule } from '@nestjs/axios'

@Module({
  imports: [CampaignsModule, HttpModule],
  controllers: [EcanvasserController],
  providers: [EcanvasserService],
  exports: [EcanvasserService],
})
export class EcanvasserModule {}
