import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common'
import { ElectedOffice, Poll, PollIssue, User } from '@prisma/client'
import { v7 as uuidv7 } from 'uuid'
import { orderBy } from 'lodash'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ReqElectedOffice } from 'src/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from 'src/electedOffice/decorators/UseElectedOffice.decorator'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { ASSET_DOMAIN } from 'src/shared/util/appEnvironment.util'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import z from 'zod'
import { APIPoll, APIPollIssue, derivePollStatus } from './polls.types'
import { AnalyzePollBiasDto } from './schemas/analyzePollBias.schema'
import { CreatePollDto } from './schemas/poll.schema'
import { PollBiasAnalysisService } from './services/pollBiasAnalysis.service'
import { PollIssuesService } from './services/pollIssues.service'
import { PollsService } from './services/polls.service'
import { BiasAnalysisResponse } from './types/pollBias.types'
import { PollResponsesDownloadService } from './services/pollResponsesDownload.service'
import { ContactsService } from '@/contacts/services/contacts.service'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { CampaignWithPathToVictory } from '@/campaigns/campaigns.types'
import { PinoLogger } from 'nestjs-pino'

class ListPollsQueryDTO extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
) {}

class PollParamsDto extends createZodDto(
  z.object({
    pollId: z.string().uuid(),
  }),
) {}

class PollImageUploadUrlDto extends createZodDto(
  z.object({
    fileName: z.string(),
    contentType: z.string().optional(),
  }),
) {}

const toAPIPoll = (poll: Poll): APIPoll => ({
  id: poll.id,
  name: poll.name,
  status: derivePollStatus(poll),
  messageContent: poll.messageContent,
  imageUrl: poll.imageUrl ?? undefined,
  scheduledDate: poll.scheduledDate.toISOString(),
  estimatedCompletionDate: poll.estimatedCompletionDate.toISOString(),
  completedDate: poll.completedDate?.toISOString(),
  audienceSize: poll.targetAudienceSize,
  responseCount: poll.responseCount ?? undefined,
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
    private readonly pollBiasAnalysisService: PollBiasAnalysisService,
    private readonly campaignService: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly s3Service: S3Service,
    private readonly contactService: ContactsService,
    private readonly pollResponsesDownloadService: PollResponsesDownloadService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name)
  }

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

  @Get('has-polls')
  @UseElectedOffice()
  async hasPolls(@ReqElectedOffice() electedOffice: ElectedOffice) {
    const userHasPolls: boolean = await this.pollsService.hasPolls(
      electedOffice.id,
    )
    return { hasPolls: userHasPolls }
  }

  @Post('initial-poll')
  @UseCampaign()
  async createInitialPoll(
    @ReqUser() user: User,
    @Body()
    { message, imageUrl, swornInDate, scheduledDate }: CreatePollDto,
    @ReqCampaign() campaign: CampaignWithPathToVictory,
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
        isActive: true,
        userId: user.id,
        campaignId: campaign.id,
        swornInDate,
        electedDate: null,
      })
      // END OF TEMPORARY FIX
    } else {
      electedOffice = await this.electedOfficeService.update({
        where: { id: electedOffice.id },
        data: {
          swornInDate,
        },
      })
    }

    const [userHasPolls, districtStats] = await Promise.all([
      this.pollsService.hasPolls(electedOffice.id),
      this.contactService.getDistrictStats(campaign),
    ])
    if (userHasPolls) {
      throw new ConflictException(
        'You already have a poll. You cannot create an initial poll.',
      )
    }

    if (districtStats.totalConstituentsWithCellPhone < 500) {
      throw new BadRequestException(
        'You need at least 500 constituents with cell phones to create a poll.',
      )
    }

    const poll = await this.pollsService.create({
      id: uuidv7(),
      name: 'Top Community Issues',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      messageContent: message,
      imageUrl,
      electedOfficeId: electedOffice.id,
      targetAudienceSize: 500,
    })

    return toAPIPoll(poll)
  }

  @Get('/:pollId/download-responses')
  @UseElectedOffice()
  async downloadPollResponses(
    @Param() { pollId }: PollParamsDto,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const poll = await this.ensurePollAccess(pollId, electedOffice)
    const sanitizedName =
      poll.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'poll-responses'

    return this.pollResponsesDownloadService.streamPollResponses(
      pollId,
      poll.name,
      sanitizedName,
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

  @Post('image-upload-url')
  @UseElectedOffice()
  async getPollImageUploadUrl(
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body() dto: PollImageUploadUrlDto,
  ) {
    const campaign = await this.campaignService.findUnique({
      where: { id: electedOffice.campaignId },
    })

    if (!campaign || campaign.userId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to upload images for this poll',
      )
    }

    const folderPath = `poll-text-images/${campaign.id}-${campaign.slug}`
    const key = this.s3Service.buildKey(folderPath, dto.fileName)
    const signedUrl = await this.s3Service.getSignedUrlForUpload(
      ASSET_DOMAIN,
      key,
      {
        contentType: dto.contentType,
      },
    )

    const publicUrl = this.s3Service.getFileUrl(ASSET_DOMAIN, key, {
      baseUrl: `https://${ASSET_DOMAIN}`,
    })

    return { signedUrl, publicUrl }
  }

  @Post('analyze-bias')
  async analyzePollBias(
    @ReqUser() user: User,
    @Body() dto: AnalyzePollBiasDto,
  ): Promise<BiasAnalysisResponse> {
    return this.pollBiasAnalysisService.analyzePollText(
      dto.pollText,
      user.id.toString(),
    )
  }
}
