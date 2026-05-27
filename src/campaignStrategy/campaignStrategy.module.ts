import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { ElectionApiMockService } from './services/electionApiMock.service'
import { StrategicLandscapePersister } from './services/strategicLandscape.persister'
import { StrategicLandscapeService } from './services/strategicLandscape.service'

@Module({
  imports: [ClerkModule],
  controllers: [CampaignStrategyController],
  providers: [
    CampaignStrategyService,
    StrategicLandscapeService,
    StrategicLandscapePersister,
    ElectionApiMockService,
  ],
})
export class CampaignStrategyModule {}
