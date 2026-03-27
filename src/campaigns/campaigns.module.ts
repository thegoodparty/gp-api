import { ClerkClientProvider } from '@/authentication/providers/clerk-client.provider'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { ElectionsModule } from 'src/elections/elections.module'
import { EmailModule } from 'src/email/email.module'
import { UsersModule } from 'src/users/users.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { CrmModule } from '../crm/crmModule'
import { PathToVictoryModule } from '../pathToVictory/pathToVictory.module'
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
import { FeaturesService } from 'src/features/services/features.service'
import {
  CampaignsService,
  FEATURE_FLAG_CHECKER,
} from './services/campaigns.service'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { CampaignTasksController } from './tasks/campaignTasksController'
import { LegacyCampaignTasksController } from './tasks/legacy/legacyCampaignTasks.controller'
import { LegacyCampaignTasksService } from './tasks/legacy/services/legacyCampaignTasks.service'
import { CampaignTasksService } from './tasks/services/campaignTasks.service'
import { AiCampaignManagerService } from './tasks/services/aiCampaignManager.service'
import { AiCampaignManagerIntegrationService } from './tasks/services/aiCampaignManagerIntegration.service'
import { CampaignTcrComplianceController } from './tcrCompliance/campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './tcrCompliance/services/campaignTcrCompliance.service'
import { CampaignUpdateHistoryController } from './updateHistory/campaignUpdateHistory.controller'
import { CampaignUpdateHistoryService } from './updateHistory/campaignUpdateHistory.service'

@Global()
@Module({
  imports: [
    HttpModule,
    EmailModule,
    CampaignsAiModule,
    CrmModule,
    ElectionsModule,
    OrganizationsModule,
    PathToVictoryModule,
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
    {
      provide: FEATURE_FLAG_CHECKER,
      useExisting: FeaturesService,
    },
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTasksService,
    LegacyCampaignTasksService,
    AiCampaignManagerService,
    AiCampaignManagerIntegrationService,
    CampaignTcrComplianceService,
    ClerkClientProvider,
  ],
  exports: [
    CampaignsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTcrComplianceService,
    CampaignTasksService,
  ],
})
export class CampaignsModule {}
