import { OrganizationsModule } from '@/organizations/organizations.module'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { EmailModule } from 'src/email/email.module'
import { UsersModule } from 'src/users/users.module'
import { ContactsModule } from 'src/contacts/contacts.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { CrmModule } from '../crm/crmModule'
import { QueueProducerModule } from '../queue/producer/queueProducer.module'
import { ScheduledMessagingModule } from '../scheduled-messaging/scheduled-messaging.module'
import { EcanvasserIntegrationModule } from '../vendors/ecanvasserIntegration/ecanvasserIntegration.module'
import { GoogleModule } from '../vendors/google/google.module'
import { PeerlyModule } from '../vendors/peerly/peerly.module'
import { StripeModule } from '../vendors/stripe/stripe.module'
import { WebsitesModule } from '../websites/websites.module'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignsController } from './campaigns.controller'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { CampaignTasksController } from './tasks/campaignTasks.controller'
import { LegacyCampaignTasksController } from './tasks/legacy/legacyCampaignTasks.controller'
import { LegacyCampaignTasksService } from './tasks/legacy/services/legacyCampaignTasks.service'
import { CampaignTasksService } from './tasks/services/campaignTasks.service'
import { AiGenerationService } from './tasks/services/aiGeneration.service'
import { CampaignTcrComplianceController } from './tcrCompliance/campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './tcrCompliance/services/campaignTcrCompliance.service'
import { CampaignUpdateHistoryController } from './updateHistory/campaignUpdateHistory.controller'
import { CampaignUpdateHistoryService } from './updateHistory/campaignUpdateHistory.service'

@Global()
@Module({
  imports: [
    AwsModule,
    EmailModule,
    CampaignsAiModule,
    ClerkModule,
    CrmModule,
    ElectionsModule,
    OrganizationsModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => EcanvasserIntegrationModule),
    ScheduledMessagingModule,
    StripeModule,
    PeerlyModule,
    GoogleModule,
    AnalyticsModule,
    UsersModule,
    WebsitesModule,
    QueueProducerModule,
    SlackModule,
  ],
  controllers: [
    CampaignsController,
    CampaignPositionsController,
    CampaignUpdateHistoryController,
    CampaignTasksController,
    LegacyCampaignTasksController,
    CampaignTcrComplianceController,
  ],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTasksService,
    LegacyCampaignTasksService,
    AiGenerationService,
    CampaignTcrComplianceService,
  ],
  exports: [
    CampaignsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTcrComplianceService,
    CampaignTasksService,
    AiGenerationService,
  ],
})
export class CampaignsModule {}
