import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignMapController } from './map/campaignMap.controller'
import { CampaignMapService } from './map/campaignMap.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { UsersModule } from 'src/users/users.module'
import { GeocodingService } from './services/geocoding.service'
import { RacesModule } from 'src/races/races.module'
import { RacesService } from 'src/races/races.service'
import { GraphqlModule } from 'src/graphql/graphql.module'
import { GraphqlService } from 'src/graphql/graphql.service'

@Module({
  imports: [EmailModule, UsersModule, RacesModule, forwardRef(() => CampaignsAiModule)],
  //imports: [EmailModule, UsersModule, forwardRef(() => CampaignsAiModule)],
  controllers: [
    CampaignsController,
    CampaignPositionsController,
    CampaignMapController,
  ],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    CampaignMapService,
    GeocodingService,
    RacesService,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
