import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { CampaignPlanController } from './campaignPlan.controller'
import { CampaignPlanService } from './services/campaignPlan.service'
import { ElectionApiMockService } from './services/electionApiMock.service'
import { StrategicLandscapePersister } from './services/strategicLandscape.persister'
import { StrategicLandscapeService } from './services/strategicLandscape.service'

@Module({
  imports: [ClerkModule],
  controllers: [CampaignPlanController],
  providers: [
    CampaignPlanService,
    StrategicLandscapeService,
    StrategicLandscapePersister,
    ElectionApiMockService,
  ],
})
export class CampaignPlanModule {}
