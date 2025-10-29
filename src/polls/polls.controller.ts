import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common'
import { PollsService } from './services/polls.service'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import z from 'zod'
import {
  ElectedOffice,
  Poll,
  PollIssue,
  PollStatus,
  UserRole,
} from '@prisma/client'
import { orderBy } from 'lodash'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'
import { PollInitialDto } from './schemas/poll.schema'
import { UseElectedOffice } from 'src/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqElectedOffice } from 'src/electedOffice/decorators/ReqElectedOffice.decorator'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import z from 'zod'
import { APIPoll, APIPollIssue } from './polls.types'
import { PollIssuesService } from './services/pollIssues.service'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { BACKFILL_POLLS } from './utils/polls.utils'
import { UsersService } from 'src/users/services/users.service'
import { sub } from 'date-fns'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'

class ListPollsQueryDTO extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
) {}

const API_STATUS_MAP: Record<PollStatus, APIPoll['status']> = {
  [PollStatus.COMPLETED]: 'completed',
  [PollStatus.IN_PROGRESS]: 'in_progress',
  [PollStatus.EXPANDING]: 'expanding',
  // As of Oct 22 2025, we don't support scheduled polls, so we just map them to in_progress
  [PollStatus.SCHEDULED]: 'in_progress',
}

const toAPIPoll = (poll: Poll): APIPoll => ({
  id: poll.id,
  name: poll.name,
  status: API_STATUS_MAP[poll.status],
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
    private readonly users: UsersService,
    private readonly campaignService: CampaignsService,
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
    @Body()
    { message, csvFileUrl, imageUrl, createPoll, swornInDate }: PollInitialDto,
  ) {
    let electedOffice = await this.getElectedOffice(user.id)

    electedOffice = await this.electedOfficeService.update({
      where: { id: electedOffice.id },
      data: {
        swornInDate,
      },
    })

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

  @Post('/backfill-polls')
  @Roles(UserRole.admin)
  async backfillPolls() {
    const now = new Date()
    const polls: { userEmail: string; poll: Poll }[] = []
    for (const { userEmail, imageUrl } of BACKFILL_POLLS) {
      const user = await this.users.findUserByEmail(userEmail)
      if (!user) {
        this.logger.warn(`User ${userEmail} not found, skipping backfill`)
        continue
      }
      const electedOffice = await this.getElectedOffice(user.id)

      const campaign = await this.campaignService.findUnique({
        where: { id: electedOffice.campaignId },
      })
      if (!campaign) {
        this.logger.warn(
          `Campaign not found for user email ${userEmail}, skipping backfill`,
        )
        continue
      }

      const existing = await this.pollsService.findMany({
        where: {
          electedOfficeId: electedOffice.id,
        },
      })

      if (existing.length) {
        this.logger.warn(
          `Existing polls found for user email ${userEmail}, skipping backfill`,
        )
        polls.push({ userEmail, poll: existing[0] })
        continue
      }

      const poll = await this.pollsService.create({
        data: {
          name: 'Top Community Issues',
          status: 'IN_PROGRESS',
          messageContent: `Hello {{firstname}}! I'm your ${campaign.details.otherOffice || campaign.details.office} ${user.firstName} ${user.lastName}, and I'm listening to residents about what matters most in our community. What issues do you think should be our top priority? Reply to share your input or text STOP to opt out.`,
          targetAudienceSize: 500,
          scheduledDate: sub(now, { days: 1 }),
          estimatedCompletionDate: now,
          imageUrl: imageUrl,
          electedOfficeId: electedOffice.id,
        },
      })
      this.logger.log(`Created poll ${poll.id} for user ${userEmail}`)
      polls.push({ userEmail, poll })
    }

    return { polls }
  }

  private async getElectedOffice(userId: number) {
    // TEMPORARY FIX START
    // WARNING!: This is a temporary fix to allow users to create a poll without an active elected office.
    //     This will be removed once we lock it down. If this is still here after 12/1/25, please remove it.
    //     If you don't have an active elected office, temporary let's create
    let electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(userId)
    if (!electedOffice) {
      const campaign =
        await this.electedOfficeService.client.campaign.findFirst({
          where: { userId },
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
          user: { connect: { id: userId } },
          campaign: { connect: { id: campaign.id } },
        },
      })
    }
    return electedOffice
    // END OF TEMPORARY FIX
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
