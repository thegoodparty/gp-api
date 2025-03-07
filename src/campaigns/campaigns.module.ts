import { Global, Module, forwardRef } from '@nestjs/common'
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
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { PathToVictoryModule } from '../pathToVictory/pathToVictory.module'
import { EcanvasserModule } from '../ecanvasser/ecanvasser.module'

@Global()
@Module({
  imports: [
    EmailModule,
    CampaignsAiModule,
    CrmModule,
    FullStoryModule,
    ElectionsModule,
    PathToVictoryModule,
    forwardRef(() => EcanvasserModule),
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
    CrmCampaignsService,
  ],
  exports: [
    CampaignsService,
    CampaignUpdateHistoryService,
    CrmCampaignsService,
  ],
})
export class CampaignsModule {}
