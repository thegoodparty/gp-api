import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { EmailModule } from 'src/email/email.module'

@Module({
  imports: [EmailModule, forwardRef(() => CampaignsAiModule)],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignPlanVersionsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
