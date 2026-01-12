import { ReqFile } from '@/files/decorators/ReqFiles.decorator'
import { FileUpload } from '@/files/files.types'
import { PeerlyP2pJobService } from '@/vendors/peerly/services/peerlyP2pJob.service'
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
import { Campaign, OutreachStatus, OutreachType } from '@prisma/client'
import { MimeTypes } from 'http-constants-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { FilesService } from 'src/files/files.service'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { Readable } from 'stream'
import { CampaignTcrComplianceService } from '../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { CreateOutreachSchema } from './schemas/createOutreachSchema'
import { OutreachService } from './services/outreach.service'
import { resolveScriptContent } from './util/resolveScriptContent.util'

@Controller('outreach')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly outreachService: OutreachService,
    private readonly filesService: FilesService,
    private readonly peerlyP2pJobService: PeerlyP2pJobService,
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

      const { aiContent = {} } = campaign
      const resolvedScriptText = resolveScriptContent(
        createOutreachDto.script!,
        aiContent,
      )

      const jobId = await this.peerlyP2pJobService.createPeerlyP2pJob({
        campaignId: campaign.id,
        crmCompanyId: campaign.data?.hubspotId,
        listId: createOutreachDto.phoneListId!,
        imageInfo: {
          fileStream: imageStream,
          fileName: image.filename,
          mimeType: image.mimetype,
          title: createOutreachDto.title,
        },
        scriptText: resolvedScriptText,
        identityId: peerlyIdentityId!,
        name,
        didState: createOutreachDto.didState,
      })

      return await this.outreachService.create(
        {
          ...createOutreachDto,
          script: resolvedScriptText,
          projectId: jobId,
          status: OutreachStatus.in_progress,
        },
        imageUrl,
      )
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
}
