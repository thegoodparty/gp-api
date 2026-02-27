import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { EcanvasserIntegrationService } from './services/ecanvasserIntegration.service'
import { SurveyService } from './services/survey.service'
import { CreateEcanvasserSchema } from './schemas/createEcanvasser.schema'
import { UpdateEcanvasserSchema } from './schemas/updateEcanvasser.schema'
import { CampaignOwnerOrAdminGuard } from 'src/campaigns/guards/CampaignOwnerOrAdmin.guard'
import { AdminOrM2MGuard } from 'src/authentication/guards/AdminOrM2M.guard'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CreateSurveySchema } from './schemas/createSurvey.schema'
import { CreateSurveyQuestionSchema } from './schemas/createSurveyQuestion.schema'
import { UpdateSurveyQuestionSchema } from './schemas/updateSurveyQuestion.schema'
import { UpdateSurveySchema } from './schemas/updateSurvey.schema'

@Controller('ecanvasser')
export class EcanvasserIntegrationController {
  constructor(
    private readonly ecanvasserService: EcanvasserIntegrationService,
    private readonly surveyService: SurveyService,
  ) {}

  @Post()
  @UseGuards(AdminOrM2MGuard)
  create(@Body() createEcanvasserDto: CreateEcanvasserSchema) {
    return this.ecanvasserService.create(createEcanvasserDto)
  }

  @Get('mine')
  @UseCampaign()
  async findMine(@ReqCampaign() campaign: Campaign) {
    return this.ecanvasserService.mine(campaign.id)
  }

  @Get('mine/summary')
  @UseCampaign()
  async findMineSummary(@ReqCampaign() campaign: Campaign) {
    return this.ecanvasserService.summary(campaign.id)
  }

  @Get('list')
  @UseGuards(AdminOrM2MGuard)
  findAll() {
    return this.ecanvasserService.findAll()
  }

  @Get('sync-all')
  @UseGuards(AdminOrM2MGuard)
  syncAll() {
    return this.ecanvasserService.syncAll()
  }

  @Get(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  findOne(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.findByCampaignId(campaignId)
  }

  @Patch(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  update(
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() updateEcanvasserDto: UpdateEcanvasserSchema,
  ) {
    return this.ecanvasserService.update(campaignId, updateEcanvasserDto)
  }

  @Delete(':campaignId')
  @UseGuards(AdminOrM2MGuard)
  remove(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.remove(campaignId)
  }

  @Post(':id/sync')
  @UseGuards(CampaignOwnerOrAdminGuard)
  sync(
    @Param('id', ParseIntPipe) campaignId: number,
    @Body() body: { force?: boolean },
  ) {
    const force = body.force === true
    return this.ecanvasserService.sync(campaignId, force)
  }

  @Post('survey')
  @UseCampaign()
  createSurvey(
    @ReqCampaign() campaign: Campaign,
    @Body() createSurveyDto: CreateSurveySchema,
  ) {
    return this.surveyService.createSurvey(campaign.id, createSurveyDto)
  }

  @Get('surveys')
  @UseCampaign()
  findSurveys(@ReqCampaign() campaign: Campaign) {
    return this.surveyService.findSurveys(campaign.id)
  }

  @Get('survey/:surveyId')
  @UseCampaign()
  findSurvey(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
  ) {
    return this.surveyService.findSurvey(campaign.id, surveyId)
  }

  @Put('survey/:surveyId')
  @UseCampaign()
  updateSurvey(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() updateSurveyDto: UpdateSurveySchema,
  ) {
    return this.surveyService.updateSurvey(
      campaign.id,
      surveyId,
      updateSurveyDto,
    )
  }

  @Delete('survey/:surveyId')
  @UseCampaign()
  deleteSurvey(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
  ) {
    return this.surveyService.deleteSurvey(campaign.id, surveyId)
  }

  @Post('survey/:surveyId/question')
  @UseCampaign()
  createSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() createQuestionDto: CreateSurveyQuestionSchema,
  ) {
    return this.surveyService.createSurveyQuestion(
      campaign.id,
      surveyId,
      createQuestionDto,
    )
  }

  @Get('teams')
  @UseCampaign()
  findTeams(@ReqCampaign() campaign: Campaign) {
    return this.surveyService.findTeams(campaign.id)
  }

  @Delete('survey/question/:questionId')
  @UseCampaign()
  deleteSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
  ) {
    return this.surveyService.deleteSurveyQuestion(campaign.id, questionId)
  }

  @Get('survey/question/:questionId')
  @UseCampaign()
  findSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
  ) {
    return this.surveyService.findSurveyQuestion(campaign.id, questionId)
  }

  @Put('survey/question/:questionId')
  @UseCampaign()
  updateSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() updateQuestionDto: UpdateSurveyQuestionSchema,
  ) {
    return this.surveyService.updateSurveyQuestion(
      campaign.id,
      questionId,
      updateQuestionDto,
    )
  }
}
