import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { EmailModule } from 'src/email/email.module'

@Module({
  imports: [EmailModule],
  controllers: [AdminCampaignsController],
  providers: [AdminCampaignsService],
})
export class AdminModule {}
