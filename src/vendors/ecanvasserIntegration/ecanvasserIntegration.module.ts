import { forwardRef, Module } from '@nestjs/common'
import { EcanvasserIntegrationService } from './services/ecanvasserIntegration.service'
import { EcanvasserIntegrationController } from './ecanvasserIntegration.controller'
import { CampaignsModule } from '../../campaigns/campaigns.module'
import { HttpModule } from '@nestjs/axios'
import { SurveyService } from './services/survey.service'
import { EcanvasserService } from './services/ecanvasser.service'

@Module({
  imports: [forwardRef(() => CampaignsModule), HttpModule],
  controllers: [EcanvasserIntegrationController],
  providers: [EcanvasserIntegrationService, SurveyService, EcanvasserService],
  exports: [EcanvasserIntegrationService, SurveyService],
})
export class EcanvasserIntegrationModule {}
