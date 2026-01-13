import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import { Campaign, IssueStatus } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CreateCommunityIssueSchema } from '../schemas/CreateCommunityIssue.schema'
import { UpdateCommunityIssueSchema } from '../schemas/UpdateCommunityIssue.schema'
import { CommunityIssueStatusLogService } from '../services/communityIssueStatusLog.service'
import { CommunityIssuesService } from '../services/communityIssues.service'

@Controller('community-issues')
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
    @Body(ZodValidationPipe) body: CreateCommunityIssueSchema,
  ) {
    const issue = await this.communityIssuesService.create(campaignId, body)

    await this.statusLogService.logInitialStatus(
      issue.uuid,
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

  @Get(':uuid')
  @UseCampaign()
  getCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('uuid') uuid: string,
  ) {
    return this.communityIssuesService.findByUuid(uuid, campaignId)
  }

  @Get(':uuid/status-history')
  @UseCampaign()
  async getCommunityIssueStatusHistory(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('uuid') uuid: string,
  ) {
    const issue = await this.communityIssuesService.findByUuid(uuid, campaignId)
    return this.statusLogService.getStatusHistory(issue.uuid)
  }

  @Put(':uuid')
  @UseCampaign()
  async updateCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('uuid') uuid: string,
    @Body(ZodValidationPipe) body: UpdateCommunityIssueSchema,
  ) {
    const currentIssue = await this.communityIssuesService.findByUuid(
      uuid,
      campaignId,
    )

    const updatedIssue = await this.communityIssuesService.update({
      where: {
        uuid,
        campaignId,
      },
      data: body,
    })

    if (body.status && currentIssue.status !== body.status) {
      await this.statusLogService.createStatusLog(
        currentIssue.uuid,
        currentIssue.status,
        body.status,
      )
    }

    return updatedIssue
  }

  @Delete(':uuid')
  @UseCampaign()
  deleteCommunityIssue(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Param('uuid') uuid: string,
  ) {
    return this.communityIssuesService.delete({
      where: {
        uuid,
        campaignId,
      },
    })
  }
}
