import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { CommunityEventsPersister } from './services/communityEvents.persister'
import { CommunityEventsService } from './services/communityEvents.service'
import { ElectionApiService } from './services/electionApi.service'
import { StrategicLandscapePersister } from './services/strategicLandscape.persister'
import { StrategicLandscapeService } from './services/strategicLandscape.service'

@Module({
  imports: [ClerkModule, HttpModule],
  controllers: [CampaignStrategyController],
  providers: [
    CampaignStrategyService,
    StrategicLandscapeService,
    StrategicLandscapePersister,
    CommunityEventsService,
    CommunityEventsPersister,
    ElectionApiService,
  ],
})
export class CampaignStrategyModule {}
