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
import { Campaign, OutreachType } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqFile } from '../files/decorators/ReqFiles.decorator'
import { FileUpload } from '../files/files.types'
import { FilesService } from 'src/files/files.service'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { MimeTypes } from 'http-constants-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { PeerlyP2pJobService } from '../peerly/services/peerlyP2pJob.service'
import { OutreachStatus } from '@prisma/client'
import { Readable } from 'stream'

@Controller('outreach')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
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
      if (!image) {
        throw new BadRequestException('Image is required for P2P outreach')
      }
      if (!imageUrl) {
        throw new BadRequestException('Failed to upload image for P2P outreach')
      }
      return this.createP2pOutreach(
        campaign,
        createOutreachDto,
        image,
        imageUrl,
      )
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
      let imageStream: Readable
      if (image.data instanceof Buffer) {
        imageStream = Readable.from(image.data)
      } else {
        imageStream = image.data as Readable
      }

      const jobId = await this.peerlyP2pJobService.createPeerlyP2pJob({
        campaignId: campaign.id,
        listId: createOutreachDto.phoneListId!,
        imageInfo: {
          fileStream: imageStream,
          fileName: image.filename!,
          mimeType: image.mimetype!,
          title: createOutreachDto.title,
        },
        scriptText: createOutreachDto.script!,
        identityId: createOutreachDto.identityId!,
        name: createOutreachDto.name,
        didState: createOutreachDto.didState,
      })

      return this.outreachService.create(
        {
          ...createOutreachDto,
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
  findAll(@ReqCampaign() campaign: Campaign) {
    return this.outreachService.findByCampaignId(campaign.id)
  }
}
