import { forwardRef, Global, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { PublicCampaignsController } from './controllers/public-campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { PublicCampaignsService } from './services/public-campaigns.service'
import { CampaignMapController } from './map/campaignMap.controller'
import { CampaignMapService } from './map/campaignMap.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { GeocodingService } from './services/geocoding.service'
import { CampaignUpdateHistoryController } from './updateHistory/campaignUpdateHistory.controller'
import { CampaignUpdateHistoryService } from './updateHistory/campaignUpdateHistory.service'
import { CrmModule } from '../crm/crmModule'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { PathToVictoryModule } from '../pathToVictory/pathToVictory.module'
import { EcanvasserIntegrationModule } from '../ecanvasserIntegration/ecanvasserIntegration.module'
import { CampaignTasksController } from './tasks/campaignTasksController'
import { CampaignTasksService } from './tasks/campaignTasksService'
import { ScheduledMessagingModule } from '../scheduled-messaging/scheduled-messaging.module'
import { StripeModule } from '../stripe/stripe.module'
import { CampaignTcrComplianceController } from './tcrCompliance/campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './tcrCompliance/services/campaignTcrCompliance.service'
import { PeerlyModule } from '../peerly/peerly.module'
import { GoogleModule } from '../vendors/google/google.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { UsersModule } from 'src/users/users.module'

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
