import {
  Controller,
  Get,
  Logger,
  UsePipes,
  Param,
  NotFoundException,
  ForbiddenException,
  Body,
  Query,
  Post,
} from '@nestjs/common'
import { PollsService } from './services/polls.service'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import z from 'zod'
import { ElectedOffice, Poll, PollIssue } from '@prisma/client'
import { APIPoll, APIPollIssue } from './polls.types'
import { orderBy } from 'lodash'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'
import { PollInitialDto } from './schemas/poll.schema'
import { UseElectedOffice } from 'src/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqElectedOffice } from 'src/electedOffice/decorators/ReqElectedOffice.decorator'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PollIssuesService } from './services/pollIssues.service'

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

const toAPIIssue = (issue: PollIssue): APIPollIssue => ({
  pollId: issue.pollId,
  title: issue.title,
  summary: issue.summary,
  details: issue.details,
  mentionCount: issue.mentionCount,
  representativeComments: issue.representativeComments.map((quote) => ({
    comment: quote.quote,
  })),
})

@Controller('polls')
@UsePipes(ZodValidationPipe)
export class PollsController {
  constructor(
    private readonly pollsService: PollsService,
    private readonly pollIssuesService: PollIssuesService,
    private readonly analytics: AnalyticsService,
    private readonly electedOfficeService: ElectedOfficeService,
  ) {}
  private readonly logger = new Logger(this.constructor.name)

  @Get('/')
  @UseElectedOffice()
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
  async createInitialPoll(
    @ReqUser() user: User,
    @Body() { message, csvFileUrl, imageUrl, createPoll }: PollInitialDto,
  ) {
    // TEMPORARY FIX START
    // WARNING!: This is a temporary fix to allow users to create a poll without an active elected office.
    //     This will be removed once we lock it down. If this is still here after 12/1/25, please remove it.
    //     If you don't have an active elected office, temporary let's create
    let electedOffice = await this.electedOfficeService.getCurrentElectedOffice(
      user.id,
    )
    if (!electedOffice) {
      const campaign =
        await this.electedOfficeService.client.campaign.findFirst({
          where: { userId: user.id },
          select: { id: true },
        })
      if (!campaign) {
        throw new ForbiddenException(
          'Not allowed to create poll. No campaign found.',
        )
      }
      electedOffice = await this.electedOfficeService.create({
        data: {
          isActive: true,
          user: { connect: { id: user.id } },
          campaign: { connect: { id: campaign.id } },
        },
      })
    }
    // END OF TEMPORARY FIX

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
  @UseElectedOffice()
  async getPoll(
    @Param('pollId') pollId: string,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const poll = await this.ensurePollAccess(pollId, electedOffice)
    return toAPIPoll(poll)
  }

  @Get('/:pollId/top-issues')
  @UseElectedOffice()
  async getTopIssues(
    @Param('pollId') pollId: string,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    await this.ensurePollAccess(pollId, electedOffice)

    const issues = await this.pollIssuesService.findMany({
      where: { pollId },
    })

    const byMentionCount = orderBy(issues, (i) => i.mentionCount, 'desc')

    return { results: byMentionCount.map(toAPIIssue) }
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
