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
  BadRequestException,
  Query,
} from '@nestjs/common'
import { PollsService } from './services/polls.service'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignWithPathToVictory } from 'src/contacts/contacts.types'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { queryTopIssues } from './dynamo-helpers'
import z from 'zod'
import { Poll } from '@prisma/client'
import { APIPoll } from './polls.types'
import { orderBy } from 'lodash'

class MarkPollCompleteDTO extends createZodDto(
  z.object({
    confidence: z.enum(['low', 'high']),
  }),
) {}

class ListPollsQueryDTO extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
) {}

const toAPIPoll = (poll: Poll): APIPoll => ({
  id: poll.id,
  name: poll.name,
  status: poll.status === 'COMPLETED' ? 'completed' : 'in_progress',
  messageContent: poll.messageContent,
  imageUrl: poll.imageUrl ?? undefined,
  scheduledDate: poll.scheduledDate.toISOString(),
  estimatedCompletionDate: poll.estimatedCompletionDate.toISOString(),
  completedDate: poll.completedDate?.toISOString(),
  audienceSize: poll.targetAudienceSize,
  lowConfidence: poll.confidence === 'LOW',
})

@Controller('polls')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}
  private readonly logger = new Logger(this.constructor.name)

  @Get('/')
  async listPolls(
    @Query() query: ListPollsQueryDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    const polls = await this.pollsService.findMany({
      cursor: query.cursor ? { id: query.cursor } : undefined,
      where: { campaignId: campaign.id },
      // Ordering is essential! Don't forget that without this, Postgres will
      // return results in a non-deterministic order.
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    })
    const nextCursor = polls.at(query.limit)?.id
    const results = polls.slice(0, query.limit).map(toAPIPoll)
    return { results, pagination: { nextCursor } }
  }

  @Get('/:pollId')
  async getPoll(
    @Param('pollId') pollId: string,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    const poll = await this.ensurePollAccess(pollId, campaign)
    return toAPIPoll(poll)
  }

  @Get('/:pollId/top-issues')
  async getTopIssues(
    @Param('pollId') pollId: string,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    await this.ensurePollAccess(pollId, campaign)

    const issues = await queryTopIssues(this.logger, pollId)

    const byMentionCount = orderBy(issues, (i) => i.mentionCount, 'desc')

    return { results: byMentionCount }
  }

  @Put('/:pollId/internal/complete')
  async markPollComplete(
    @Param('pollId') pollId: string,
    @Body() data: MarkPollCompleteDTO,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ) {
    const existing = await this.ensurePollAccess(pollId, campaign)

    if (existing.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Poll is not currently in-progress')
    }

    const poll = await this.pollsService.update({
      where: { id: existing.id },
      data: {
        status: 'COMPLETED',
        confidence: data.confidence === 'low' ? 'LOW' : 'HIGH',
        completedDate: new Date(),
      },
    })
    return toAPIPoll(poll)
  }

  private async ensurePollAccess(
    pollId: string,
    campaign: CampaignWithPathToVictory,
  ) {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
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
