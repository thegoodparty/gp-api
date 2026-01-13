import { forwardRef, Global, Module } from '@nestjs/common'
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
import { PublicCampaignsController } from './controllers/public-campaigns.controller'
import { CampaignMapController } from './map/campaignMap.controller'
import { CampaignMapService } from './map/campaignMap.service'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { GeocodingService } from './services/geocoding.service'
import { PublicCampaignsService } from './services/public-campaigns.service'
import { CampaignTasksController } from './tasks/campaignTasksController'
import { CampaignTasksService } from './tasks/campaignTasksService'
import { CampaignTcrComplianceController } from './tcrCompliance/campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './tcrCompliance/services/campaignTcrCompliance.service'
import { CampaignUpdateHistoryController } from './updateHistory/campaignUpdateHistory.controller'
import { CampaignUpdateHistoryService } from './updateHistory/campaignUpdateHistory.service'

@Global()
@Module({
  imports: [
    EmailModule,
    CampaignsAiModule,
    CrmModule,
    ElectionsModule,
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
    PublicCampaignsController,
    CampaignPositionsController,
    CampaignMapController,
    CampaignUpdateHistoryController,
    CampaignTasksController,
    CampaignTcrComplianceController,
  ],
  providers: [
    CampaignsService,
    PublicCampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignMapService,
    GeocodingService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTasksService,
    CampaignTcrComplianceService,
  ],
  exports: [
    CampaignsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTcrComplianceService,
  ],
})
export class CampaignsModule {}
