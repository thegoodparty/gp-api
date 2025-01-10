import { forwardRef, Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './services/campaigns.service'
import { CampaignsAiModule } from './ai/campaignsAi.module'
import { MappingController } from './mapping/mapping.controller'
import { MappingService } from './mapping/mapping.service'
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
    MappingController,
  ],
  providers: [
    CampaignsService,
    CampaignPlanVersionsService,
    CampaignPositionsService,
    MappingService,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
