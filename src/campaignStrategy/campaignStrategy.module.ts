import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { ElectionsModule } from '@/elections/elections.module'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { ElectionApiService } from './services/electionApi.service'
import { StrategicLandscapeParamsService } from './services/strategicLandscapeParams.service'
import { StrategicLandscapePersister } from './services/strategicLandscape.persister'
import { StrategicLandscapeService } from './services/strategicLandscape.service'

@Module({
  imports: [ClerkModule, HttpModule, ElectionsModule],
  controllers: [CampaignStrategyController],
  providers: [
    CampaignStrategyService,
    StrategicLandscapeService,
    StrategicLandscapePersister,
    ElectionApiService,
    StrategicLandscapeParamsService,
  ],
})
export class CampaignStrategyModule {}
