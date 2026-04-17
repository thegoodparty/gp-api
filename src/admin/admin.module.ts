import { Module } from '@nestjs/common'
import { AuthenticationModule } from 'src/authentication/authentication.module'
import { EmailModule } from 'src/email/email.module'
import { OrganizationsModule } from 'src/organizations/organizations.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { AdminUsersController } from './users/adminUsers.controller'

@Module({
  imports: [
    EmailModule,
    AuthenticationModule,
    OrganizationsModule,
    SlackModule,
  ],
  controllers: [AdminCampaignsController, AdminUsersController],
  providers: [AdminCampaignsService],
})
export class AdminModule {}
