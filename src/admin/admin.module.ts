import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { EmailModule } from 'src/email/email.module'
import { UsersModule } from 'src/users/users.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { AdminP2VService } from './services/adminP2V.service'

@Module({
  imports: [EmailModule, UsersModule, CampaignsModule],
  controllers: [AdminCampaignsController],
  providers: [AdminCampaignsService, AdminP2VService],
})
export class AdminModule {}
