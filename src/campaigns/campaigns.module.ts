import { forwardRef, Global, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
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
import { ElectionsService } from 'src/elections/services/elections.service'

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
  ],
  controllers: [
    CampaignsController,
    CampaignPositionsController,
    CampaignMapController,
    CampaignUpdateHistoryController,
    CampaignTasksController,
  ],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignMapService,
    GeocodingService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
    CampaignTasksService,
  ],
  exports: [
    CampaignsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
  ],
})
export class CampaignsModule {}
