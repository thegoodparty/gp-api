import { Body, Controller, Get, Post } from '@nestjs/common'
import { TextCampaignService } from './services/textCampaign.service'
import { CreateProjectSchema } from './schemas/createProject.schema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { UseGuards } from '@nestjs/common'
import { ValidCampaignGuard } from 'src/campaigns/guards/validCampaign.guard'

@Controller('text-campaign')
export class TextCampaignController {
  constructor(private readonly textCampaignService: TextCampaignService) {}

  @Post('project')
  @UseCampaign()
  @UseGuards(ValidCampaignGuard)
  createProject(
    @ReqCampaign() campaign: Campaign,
    @Body() createProjectDto: CreateProjectSchema,
  ) {
    return this.textCampaignService.createProject(campaign.id, createProjectDto)
  }

  @Get('text-campaigns')
  @UseCampaign()
  findAll(@ReqCampaign() campaign: Campaign) {
    return this.textCampaignService.findByCampaignId(campaign.id)
  }
}
