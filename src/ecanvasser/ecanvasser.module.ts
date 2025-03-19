import { Module, forwardRef } from '@nestjs/common'
import { EcanvasserService } from './services/ecanvasser.service'
import { EcanvasserController } from './ecanvasser.controller'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { HttpModule } from '@nestjs/axios'
import { SurveyService } from './services/survey.service'
import { EcanvasserApiService } from './services/ecanvasserAPI.service'

@Module({
  imports: [forwardRef(() => CampaignsModule), HttpModule],
  controllers: [EcanvasserController],
  providers: [EcanvasserService, SurveyService, EcanvasserApiService],
  exports: [EcanvasserService, SurveyService],
})
export class EcanvasserModule {}
