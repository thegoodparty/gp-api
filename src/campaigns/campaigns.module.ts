import { Global, Module } from '@nestjs/common'
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
import { PathToVictoryService } from './services/pathToVictory.service'
import { CrmModule } from '../crm/crmModule'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { ElectionsModule } from 'src/elections/elections.module'

@Global()
@Module({
  imports: [
    EmailModule,
    CampaignsAiModule,
    CrmModule,
    FullStoryModule,
    ElectionsModule,
  ],
  controllers: [
    CampaignsController,
    CampaignPositionsController,
    CampaignMapController,
    CampaignUpdateHistoryController,
  ],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignMapService,
    GeocodingService,
    CampaignUpdateHistoryService,
    PathToVictoryService,
    CrmCampaignsService,
  ],
  exports: [
    CampaignsService,
    PathToVictoryService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
  ],
})
export class CampaignsModule {}
