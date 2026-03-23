import { ReqFile } from '@/files/decorators/ReqFiles.decorator'
import { FileUpload } from '@/files/files.types'
import { PeerlyP2pJobService } from '@/vendors/peerly/services/peerlyP2pJob.service'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Campaign, OutreachType } from '@prisma/client'
import { MimeTypes } from 'http-constants-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { FilesService } from 'src/files/files.service'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { CampaignTcrComplianceService } from '../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { CreateOutreachSchema } from './schemas/createOutreachSchema'
import {
  OutreachService,
  type P2pOutreachImageInput,
} from './services/outreach.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('outreach')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  constructor(
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly outreachService: OutreachService,
    private readonly filesService: FilesService,
    private readonly peerlyP2pJobService: PeerlyP2pJobService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutreachController.name)
  }

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

    const requiresImage =
      outreachType === OutreachType.text || outreachType === OutreachType.p2p
    if (requiresImage) {
      if (!image) {
        throw new BadRequestException(
          `Image is required for ${outreachType} outreach campaigns`,
        )
      }
      if (
        outreachType === OutreachType.p2p &&
        (!image.filename || !image.mimetype)
      ) {
        throw new BadRequestException(
          'Image filename and MIME type are required for P2P outreach',
        )
      }
    }

    const imageUrl =
      image &&
      (await this.filesService.uploadFile(
        image,
        `scheduled-campaign/${campaign.slug}/${outreachType}/${date}`,
      ))

    if (outreachType === OutreachType.p2p && !imageUrl) {
      throw new BadRequestException('Failed to upload image for P2P outreach')
    }

    const p2pImage: P2pOutreachImageInput | undefined =
      outreachType === OutreachType.p2p && image?.filename && image?.mimetype
        ? {
            stream: image.data,
            filename: image.filename,
            mimetype: image.mimetype,
          }
        : undefined

    return this.outreachService.create(
      campaign,
      createOutreachDto,
      imageUrl,
      p2pImage,
    )
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
