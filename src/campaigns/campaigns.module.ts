import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignMapController } from './map/campaignMap.controller'
import { CampaignMapService } from './map/campaignMap.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { UsersModule } from 'src/users/users.module'
import { GeocodingService } from './services/geocoding.service'
import { RacesModule } from 'src/races/races.module'
import { CampaignUpdateHistoryController } from './updateHistory/campaignUpdateHistory.controller'
import { CampaignUpdateHistoryService } from './updateHistory/campaignUpdateHistory.service'
import { PathToVictoryService } from './services/pathToVictory.service'
import { CrmModule } from '../crm/crmModule'
import { CrmCampaignsService } from './services/crmCampaigns.service'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CampaignsAiModule } from './ai/campaignsAi.module'

@Module({
  imports: [
    EmailModule,
    forwardRef(() => UsersModule),
    RacesModule,
    CampaignsAiModule,
    forwardRef(() => CrmModule),
    forwardRef(() => FullStoryModule),
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
