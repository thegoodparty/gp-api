import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { CampaignsModule } from '../../campaigns/campaigns.module'
import { EcanvasserIntegrationController } from './ecanvasserIntegration.controller'
import { EcanvasserService } from './services/ecanvasser.service'
import { EcanvasserIntegrationService } from './services/ecanvasserIntegration.service'
import { SurveyService } from './services/survey.service'

@Module({
  imports: [forwardRef(() => CampaignsModule), HttpModule, SlackModule],
  controllers: [EcanvasserIntegrationController],
  providers: [EcanvasserIntegrationService, SurveyService, EcanvasserService],
  exports: [EcanvasserIntegrationService, SurveyService],
})
export class EcanvasserIntegrationModule {}
