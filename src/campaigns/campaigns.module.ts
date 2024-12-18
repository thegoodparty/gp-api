import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'

@Module({
  imports: [forwardRef(() => CampaignsAiModule)],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignPlanVersionsService],
  exports: [CampaignsService, CampaignPlanVersionsService],
})
export class CampaignsModule {}
