import { Module } from '@nestjs/common'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EcanvasserController } from './ecanvasser.controller'
import { EcanvasserService } from './ecanvasser.service'

@Module({
  imports: [CampaignsModule],
  controllers: [EcanvasserController],
  providers: [EcanvasserService],
  exports: [EcanvasserService],
})
export class EcanvasserModule {}
