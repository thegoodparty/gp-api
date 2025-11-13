import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  UnauthorizedException,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { OutreachService } from './services/outreach.service'
import { CreateOutreachSchema } from './schemas/createOutreachSchema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign, OutreachStatus, OutreachType, User } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqFile } from '../files/decorators/ReqFiles.decorator'
import { FileUpload } from '../files/files.types'
import { FilesService } from 'src/files/files.service'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { MimeTypes } from 'http-constants-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { PeerlyP2pJobService } from '../vendors/peerly/services/peerlyP2pJob.service'
import { Readable } from 'stream'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { CampaignTcrComplianceService } from '../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { SlackService } from '../vendors/slack/services/slack.service'
import { SlackChannel } from '../vendors/slack/slackService.types'
import { IS_PROD } from '../shared/util/appEnvironment.util'
import { CrmCampaignsService } from '../campaigns/services/crmCampaigns.service'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { buildSlackBlocks } from '../voters/util/voterOutreach.util'
import { OutreachWithVoterFileFilter } from './types/outreach.types'

@Controller('outreach')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly outreachService: OutreachService,
    private readonly filesService: FilesService,
    private readonly peerlyP2pJobService: PeerlyP2pJobService,
    private readonly slackService: SlackService,
    private readonly crmCampaignsService: CrmCampaignsService,
  ) {}

  @Post()
  @UseCampaign()
  @UseInterceptors(
    FilesInterceptor('file', {
      mode: 'buffer',
      mimeTypes: [
        MimeTypes.IMAGE_JPEG,
        MimeTypes.IMAGE_GIF,
        MimeTypes.IMAGE_PNG,
      ],
    }),
  )
  async create(
    @ReqCampaign() campaign: Campaign,
    @ReqUser() user: User,
    @Body() createOutreachDto: CreateOutreachSchema,
    @ReqFile() image?: FileUpload,
  ) {
    if (campaign.id !== createOutreachDto.campaignId) {
      throw new UnauthorizedException('Campaign ID mismatch')
    }

    const { outreachType, date } = createOutreachDto

    if (outreachType === OutreachType.text && !image) {
      throw new BadRequestException(
        'image is required for text outreach campaigns',
      )
    }

    if (outreachType === OutreachType.p2p && !image) {
      throw new BadRequestException(
        'image is required for P2P outreach campaigns',
      )
    }

    const imageUrl =
      image &&
      (await this.filesService.uploadFile(
        image,
        `scheduled-campaign/${campaign.slug}/${outreachType}/${date}`,
      ))

    if (outreachType === OutreachType.p2p) {
      if (!imageUrl) {
        throw new BadRequestException('Failed to upload image for P2P outreach')
      }
      const outreach = await this.createP2pOutreach(
        campaign,
        user,
        createOutreachDto,
        image,
        imageUrl,
      )

      return outreach
    }

    return this.outreachService.create(createOutreachDto, imageUrl)
  }

  private async createP2pOutreach(
    campaign: Campaign,
    user: User,
    createOutreachDto: CreateOutreachSchema,
    image: FileUpload,
    imageUrl: string,
  ) {
    try {
      if (!image.filename) {
        throw new BadRequestException(
          'Image filename is required for P2P outreach',
        )
      }
      if (!image.mimetype) {
        throw new BadRequestException(
          'Image MIME type is required for P2P outreach',
        )
      }

      let imageStream: Readable | Buffer
      if (image.data instanceof Buffer) {
        imageStream = image.data
      } else {
        imageStream = image.data as Readable
      }

      const { peerlyIdentityId } =
        await this.tcrComplianceService.findFirstOrThrow({
          where: {
            campaignId: campaign.id,
          },
        })

      if (!peerlyIdentityId) {
        throw new BadRequestException(
          'TCR Compliance Peerly identity ID is required for P2P outreach',
        )
      }

      const name = `${campaign.slug}${
        createOutreachDto.date
          ? ` - ${formatDate(createOutreachDto.date, DateFormats.usIsoSlashes)}`
          : ''
      }`

      const jobId = await this.peerlyP2pJobService.createPeerlyP2pJob({
        campaignId: campaign.id,
        listId: createOutreachDto.phoneListId!,
        imageInfo: {
          fileStream: imageStream,
          fileName: image.filename,
          mimeType: image.mimetype,
          title: createOutreachDto.title,
        },
        scriptText: createOutreachDto.script!,
        identityId: peerlyIdentityId!,
        name,
        didState: createOutreachDto.didState,
      })

      const peerlyJob = await this.peerlyP2pJobService.getJob(jobId)
      if (!peerlyJob?.account_id) {
        throw new BadRequestException(
          'Failed to retrieve Peerly job account information',
        )
      }

      const peerlyJobUrl: string = this.peerlyP2pJobService.getPeerlyJobUrl(
        jobId,
        peerlyJob.account_id,
      )

      const outreach = await this.outreachService.create(
        {
          ...createOutreachDto,
          projectId: jobId,
          status: OutreachStatus.in_progress,
        },
        imageUrl,
      )

      // Send Slack notification
      void this.sendP2pSlackNotification({
        user,
        campaign,
        outreach,
        peerlyJobUrl,
        imageUrl,
      })

      return outreach
    } catch (error) {
      this.logger.error('Failed to create P2P outreach', error)
      throw new BadRequestException(
        'Failed to create P2P outreach. Please check your parameters and try again.',
      )
    }
  }

  @Get()
  @UseCampaign()
  async findAll(@ReqCampaign() campaign: Campaign) {
    const outreaches = await this.outreachService.findByCampaignId(campaign.id)
    const tcrCompliance = await this.tcrComplianceService.findFirst({
      where: {
        campaignId: campaign.id,
      },
    })
    const peerlyIdentityId = tcrCompliance?.peerlyIdentityId
    const p2pJobs = peerlyIdentityId
      ? await this.peerlyP2pJobService.getJobsByIdentityId(peerlyIdentityId)
      : []
    return outreaches.map((outreach) => {
      const p2pJob = p2pJobs.find((p2pJob) => p2pJob.id === outreach.projectId)
      return {
        ...outreach,
        ...(p2pJob
          ? {
              p2pJob,
            }
          : {}),
      }
    })
  }

  private async sendP2pSlackNotification({
    user,
    campaign,
    outreach,
    peerlyJobUrl,
    imageUrl,
  }: {
    user: User
    campaign: Campaign
    outreach: OutreachWithVoterFileFilter
    peerlyJobUrl: string
    imageUrl: string
  }) {
    const hubspotId = campaign.data?.hubspotId as string | undefined
    const assignedPa = hubspotId
      ? await this.crmCampaignsService.getCrmCompanyOwnerName(hubspotId)
      : ''

    const blocks = buildSlackBlocks({
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      phone: user.phone || undefined,
      assignedPa,
      crmCompanyId: hubspotId,
      voterFileUrl: undefined, // P2P doesn't use voter files
      type: outreach.outreachType,
      date: outreach.date ? new Date(outreach.date) : undefined,
      script: outreach.script || undefined,
      imageUrl,
      message: outreach.message || '',
      formattedAudience: [], // P2P doesn't use audience filters
      audienceRequest: outreach.audienceRequest || '',
      peerlyJobUrl,
    })

    await this.slackService.message(
      blocks,
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }
}
