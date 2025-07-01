import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UsePipes,
  Logger,
} from '@nestjs/common'
import { CommunityIssuesService } from '../services/communityIssues.service'
import { Campaign } from '@prisma/client'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ZodValidationPipe } from 'nestjs-zod'
import { CreateCommunityIssueSchema } from '../schemas/CreateCommunityIssue.schema'
import { UpdateCommunityIssueSchema } from '../schemas/UpdateCommunityIssue.schema'

@Controller('community-issues')
@UsePipes(ZodValidationPipe)
export class CommunityIssuesController {
  private readonly logger = new Logger(CommunityIssuesController.name)

  constructor(
    private readonly communityIssuesService: CommunityIssuesService,
  ) {}

  @Post()
  @UseCampaign()
  createCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() body: CreateCommunityIssueSchema,
  ) {
    return this.communityIssuesService.create(campaignId, body)
  }

  @Get()
  @UseCampaign()
  getCommunityIssues(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.communityIssuesService.findMany({
      where: { campaignId },
    })
  }

  @Get(':id')
  @UseCampaign()
  getCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.communityIssuesService.findUniqueOrThrow({
      where: { id, campaignId },
    })
  }

  @Put(':id')
  @UseCampaign()
  updateCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCommunityIssueSchema,
  ) {
    return this.communityIssuesService.update({
      where: { id, campaignId },
      data: body,
    })
  }

  @Delete(':id')
  @UseCampaign()
  deleteCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.communityIssuesService.delete({
      where: { id, campaignId },
    })
  }
}
