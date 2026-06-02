import { Module } from '@nestjs/common'
import { AuthenticationModule } from 'src/authentication/authentication.module'
import { EmailModule } from 'src/email/email.module'
import { OrganizationsModule } from 'src/organizations/organizations.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { AgentExperimentsModule } from 'src/agentExperiments/agentExperiments.module'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { AdminUsersController } from './users/adminUsers.controller'
import { AdminAgentRunsController } from './agentRuns/adminAgentRuns.controller'
import { AdminAgentRunsService } from './agentRuns/services/adminAgentRuns.service'

@Module({
  imports: [
    EmailModule,
    AuthenticationModule,
    OrganizationsModule,
    SlackModule,
    AwsModule,
    AgentExperimentsModule,
  ],
  controllers: [
    AdminCampaignsController,
    AdminUsersController,
    AdminAgentRunsController,
  ],
  providers: [AdminCampaignsService, AdminAgentRunsService],
})
export class AdminModule {}
