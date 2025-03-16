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
import { EcanvasserService } from './ecanvasser.service'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { CampaignOwnerOrAdminGuard } from 'src/campaigns/guards/CampaignOwnerOrAdmin.guard'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CreateSurveyDto } from './dto/create-survey.dto'
import { CreateSurveyQuestionDto } from './dto/create-survey-question.dto'
import { UpdateSurveyQuestionDto } from './dto/update-survey-question.dto'
import { UpdateSurveyDto } from './dto/update-survey.dto'

@Controller('ecanvasser')
export class EcanvasserController {
  constructor(private readonly ecanvasserService: EcanvasserService) {}

  @Post()
  @Roles('admin')
  create(@Body() createEcanvasserDto: CreateEcanvasserDto) {
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

  @Get(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  findOne(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.findByCampaignId(campaignId)
  }

  @Patch(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  update(
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() updateEcanvasserDto: UpdateEcanvasserDto,
  ) {
    return this.ecanvasserService.update(campaignId, updateEcanvasserDto)
  }

  @Delete(':campaignId')
  @Roles('admin')
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

  @Get('list')
  @Roles('admin')
  findAll() {
    return this.ecanvasserService.findAll()
  }

  @Get('sync-all')
  @PublicAccess()
  syncAll() {
    return this.ecanvasserService.syncAll()
  }

  @Post('survey')
  @UseCampaign()
  createSurvey(
    @ReqCampaign() campaign: Campaign,
    @Body() createSurveyDto: CreateSurveyDto,
  ) {
    return this.ecanvasserService.createSurvey(campaign.id, createSurveyDto)
  }

  @Get('surveys')
  @UseCampaign()
  findSurveys(@ReqCampaign() campaign: Campaign) {
    return this.ecanvasserService.findSurveys(campaign.id)
  }

  @Get('survey/:surveyId')
  @UseCampaign()
  findSurvey(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
  ) {
    return this.ecanvasserService.findSurvey(campaign.id, surveyId)
  }

  @Put('survey/:surveyId')
  @UseCampaign()
  updateSurvey(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() updateSurveyDto: UpdateSurveyDto,
  ) {
    return this.ecanvasserService.updateSurvey(
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
    return this.ecanvasserService.deleteSurvey(campaign.id, surveyId)
  }

  @Post('survey/:surveyId/question')
  @UseCampaign()
  createSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() createQuestionDto: CreateSurveyQuestionDto,
  ) {
    return this.ecanvasserService.createSurveyQuestion(
      campaign.id,
      surveyId,
      createQuestionDto,
    )
  }

  @Get('teams')
  @UseCampaign()
  findTeams(@ReqCampaign() campaign: Campaign) {
    return this.ecanvasserService.findTeams(campaign.id)
  }

  @Delete('survey/question/:questionId')
  @UseCampaign()
  deleteSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
  ) {
    return this.ecanvasserService.deleteSurveyQuestion(campaign.id, questionId)
  }

  @Get('survey/question/:questionId')
  @UseCampaign()
  findSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
  ) {
    return this.ecanvasserService.findSurveyQuestion(campaign.id, questionId)
  }

  @Put('survey/question/:questionId')
  @UseCampaign()
  updateSurveyQuestion(
    @ReqCampaign() campaign: Campaign,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() updateQuestionDto: UpdateSurveyQuestionDto,
  ) {
    return this.ecanvasserService.updateSurveyQuestion(
      campaign.id,
      questionId,
      updateQuestionDto,
    )
  }
}
