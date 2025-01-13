import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignMapController } from './mapping/campaignMap.controller'
import { CampaignMapService } from './mapping/campaignMap.service'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { UsersModule } from 'src/users/users.module'

@Module({
  imports: [EmailModule, UsersModule, forwardRef(() => CampaignsAiModule)],
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
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
