import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { EmailModule } from 'src/email/email.module'
import { UsersModule } from 'src/users/users.module'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { AdminP2VService } from './services/adminP2V.service'
import { AdminUsersController } from './users/adminUsers.controller'
import { AuthenticationModule } from 'src/authentication/authentication.module'

@Module({
  imports: [EmailModule, UsersModule, CampaignsModule, AuthenticationModule],
  controllers: [AdminCampaignsController, AdminUsersController],
  providers: [AdminCampaignsService, AdminP2VService],
})
export class AdminModule {}
