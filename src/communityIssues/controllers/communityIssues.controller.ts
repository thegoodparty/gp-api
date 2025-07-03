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
import { CommunityIssueStatusLogService } from '../services/communityIssueStatusLog.service'
import { Campaign, IssueStatus } from '@prisma/client'
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
    private readonly statusLogService: CommunityIssueStatusLogService,
  ) {}

  @Post()
  @UseCampaign()
  async createCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() body: CreateCommunityIssueSchema,
  ) {
    const issue = await this.communityIssuesService.create(campaignId, body)

    await this.statusLogService.logInitialStatus(
      issue.id,
      body.status ?? IssueStatus.newIssue,
    )

    return issue
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

  @Get(':id/status-history')
  @UseCampaign()
  async getCommunityIssueStatusHistory(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // First verify the issue exists and belongs to the campaign
    await this.communityIssuesService.findUniqueOrThrow({
      where: { id, campaignId },
    })
    return this.statusLogService.getStatusHistory(id)
  }

  @Put(':id')
  @UseCampaign()
  async updateCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCommunityIssueSchema,
  ) {
    const currentIssue = await this.communityIssuesService.findUniqueOrThrow({
      where: { id, campaignId },
    })

    const updatedIssue = await this.communityIssuesService.update({
      where: { id, campaignId },
      data: body,
    })

    if (body.status) {
      await this.statusLogService.logStatusChangeIfNeeded(
        id,
        currentIssue.status,
        body.status,
      )
    }

    return updatedIssue
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
