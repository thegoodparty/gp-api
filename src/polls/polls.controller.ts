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
  Post,
} from '@nestjs/common'
import { PollsService } from './services/polls.service'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { exampleIssues, queryTopIssues } from './dynamo-helpers'
import z from 'zod'
import { ElectedOffice, Poll } from '@prisma/client'
import { APIPoll } from './polls.types'
import { orderBy } from 'lodash'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'
import { PollInitialDto } from './schemas/poll.schema'
import { UseElectedOffice } from 'src/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqElectedOffice } from 'src/electedOffice/decorators/ReqElectedOffice.decorator'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'

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

const IS_LOCAL = process.env.NODE_ENV !== 'production'

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
@UseElectedOffice()
@UsePipes(ZodValidationPipe)
export class PollsController {
  constructor(
    private readonly pollsService: PollsService,
    private readonly analytics: AnalyticsService,
  ) {}
  private readonly logger = new Logger(this.constructor.name)

  @Get('/')
  async listPolls(
    @Query() query: ListPollsQueryDTO,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const polls = await this.pollsService.findMany({
      cursor: query.cursor ? { id: query.cursor } : undefined,
      where: { electedOfficeId: electedOffice.id },
      // Ordering is essential! Don't forget that without this, Postgres will
      // return results in a non-deterministic order.
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    })
    const nextCursor = polls.at(query.limit)?.id
    const results = polls.slice(0, query.limit).map(toAPIPoll)
    return { results, pagination: { nextCursor } }
  }

  @Post('initial-poll')
  createInitialPoll(
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body() { message, csvFileUrl, imageUrl, createPoll }: PollInitialDto,
  ) {
    const userInfo = {
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      phone: user.phone || undefined,
    }

    return this.pollsService.createInitialPoll(
      message,
      userInfo,
      electedOffice,
      createPoll,
      imageUrl || undefined,
      csvFileUrl || undefined,
    )
  }

  @Get('/:pollId')
  async getPoll(
    @Param('pollId') pollId: string,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const poll = await this.ensurePollAccess(pollId, electedOffice)
    return toAPIPoll(poll)
  }

  @Get('/:pollId/top-issues')
  async getTopIssues(
    @Param('pollId') pollId: string,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    await this.ensurePollAccess(pollId, electedOffice)

    if (IS_LOCAL) {
      return { results: exampleIssues(pollId) }
    }

    const issues = await queryTopIssues(this.logger, pollId)

    const byMentionCount = orderBy(issues, (i) => i.mentionCount, 'desc')

    return { results: byMentionCount }
  }

  @Put('/:pollId/internal/complete')
  async markPollComplete(
    @Param('pollId') pollId: string,
    @Body() data: MarkPollCompleteDTO,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const existing = await this.ensurePollAccess(pollId, electedOffice)

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

    const campaign = await this.pollsService.client.campaign.findUnique({
      where: { id: electedOffice.campaignId },
      select: {
        id: true,
        userId: true,
        pathToVictory: { select: { data: true } },
      },
    })
    if (campaign) {
      await this.analytics.track(
        campaign.userId,
        EVENTS.Polls.ResultsSynthesisCompleted,
        {
          pollId: poll.id,
          path: `/dashboard/polls/${poll.id}`,
          constituencyName: campaign.pathToVictory?.data.electionLocation,
        },
      )
    }

    return toAPIPoll(poll)
  }

  private async ensurePollAccess(pollId: string, electedOffice: ElectedOffice) {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
    })

    if (!poll) {
      throw new NotFoundException('Poll not found')
    }

    if (poll.electedOfficeId !== electedOffice.id) {
      throw new ForbiddenException(
        'You do not have permission to access this poll',
      )
    }

    return poll
  }
}
