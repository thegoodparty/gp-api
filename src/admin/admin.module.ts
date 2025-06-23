import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { EmailModule } from 'src/email/email.module'
import { AdminP2VService } from './services/adminP2V.service'
import { AdminUsersController } from './users/adminUsers.controller'
import { AuthenticationModule } from 'src/authentication/authentication.module'
import { AnalyticsModule } from 'src/analytics/analytics.module'

@Module({
  imports: [EmailModule, AuthenticationModule, AnalyticsModule],
  controllers: [AdminCampaignsController, AdminUsersController],
  providers: [AdminCampaignsService, AdminP2VService],
})
export class AdminModule {}
