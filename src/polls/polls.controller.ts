import {
  Controller,
  Get,
  Put,
  Logger,
  UsePipes,
  Param,
  NotFoundException,
  ForbiddenException,
  Body,
} from '@nestjs/common'
import { PollsService } from './services/polls.service'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignWithPathToVictory } from 'src/contacts/contacts.types'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import {
  PollResponseInsight,
  queryTopIssues,
  uploadPollResultData,
} from './dynamo-helpers'

class SubmitPollResultDataDTO extends createZodDto(PollResponseInsight) {}

@Controller('polls')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}
  private readonly logger = new Logger(this.constructor.name)

  @Get('/')
  async listPolls() {
    return {}
  }

  @Get('/:pollId')
  async getPoll(
    @Param('pollId') pollId: string,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    const poll = await this.ensurePollAccess(pollId, campaign)
    return poll
  }

  @Get('/:pollId/top-issues')
  async getTopIssues(
    @Param('pollId') pollId: string,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    await this.ensurePollAccess(pollId, campaign)

    const issues = await queryTopIssues(this.logger, pollId)

    return {
      results: issues,
    }
  }

  @Put('/:pollId/internal/result')
  async submitPollResultData(
    @Param('pollId') pollId: string,
    @Body() data: SubmitPollResultDataDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    await this.ensurePollAccess(pollId, campaign)
    await uploadPollResultData(data)
    return {}
  }

  @Put('/:pollId/internal/complete')
  async markPollComplete(@Param('pollId') pollId: string) {
    return {}
  }

  private async ensurePollAccess(
    pollId: string,
    campaign: CampaignWithPathToVictory,
  ) {
    const poll = await this.pollsService.findUnique({
      where: { id: Number(pollId) },
    })

    if (!poll) {
      throw new NotFoundException('Poll not found')
    }

    if (poll.campaignId !== campaign.id) {
      throw new ForbiddenException(
        'You do not have permission to access this poll',
      )
    }

    return poll
  }
}
