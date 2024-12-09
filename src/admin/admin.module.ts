import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'

@Module({
  imports: [],
  controllers: [AdminCampaignsController],
  providers: [AdminCampaignsService],
})
export class AdminModule {}
