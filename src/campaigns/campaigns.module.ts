import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'
import { CampaignPositionsController } from './positions/campaignPositions.controller'
import { CampaignPositionsService } from './positions/campaignPositions.service'
import { UsersModule } from 'src/users/users.module'

@Module({
  imports: [EmailModule, UsersModule, forwardRef(() => CampaignsAiModule)],
  controllers: [CampaignsController, CampaignPositionsController],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
