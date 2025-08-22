import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '../campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '../campaigns/decorators/UseCampaign.decorator'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PhoneListState } from './peerly.types'
import { CheckPhoneListStatusResponseDto } from './schemas/p2pPhoneListStatus.schema'
import { P2pPhoneListRequestSchema } from './schemas/p2pPhoneListRequest.schema'
import { P2pPhoneListResponseSchema } from './schemas/p2pPhoneListResponse.schema'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { PeerlyP2pJobService } from './services/peerlyP2pJob.service'
import {
  CreateP2pJobRequestDto,
  CreateP2pJobResponseDto,
} from './schemas/createP2pJob.schema'
import { FilesInterceptor } from '../files/interceptors/files.interceptor'
import { ReqFile } from '../files/decorators/ReqFiles.decorator'
import { FileUpload } from '../files/files.types'
import { MimeTypes } from 'http-constants-ts'
import { Readable } from 'stream'

@Controller('p2p')
@UsePipes(ZodValidationPipe)
export class P2pController {
  private readonly logger = new Logger(P2pController.name)

  constructor(
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly p2pPhoneListUploadService: P2pPhoneListUploadService,
    private readonly peerlyP2pJobService: PeerlyP2pJobService,
  ) {}

  @Get('phone-list/:token/status')
  @UseCampaign()
  async checkPhoneListStatus(
    @ReqCampaign() campaign: Campaign,
    @Param('token') token: string,
  ): Promise<CheckPhoneListStatusResponseDto> {
    try {
      const statusResponse =
        await this.peerlyPhoneListService.checkPhoneListStatus(token)

      if (statusResponse.Data.list_state !== PhoneListState.ACTIVE) {
        throw new BadGatewayException(
          `Phone list is not ready. Current status: ${statusResponse.Data.list_state || 'unknown'}`,
        )
      }

      const listId = statusResponse.Data.list_id
      if (!listId) {
        throw new BadGatewayException(
          'Phone list is active but no list_id was returned',
        )
      }

      const detailsResponse =
        await this.peerlyPhoneListService.getPhoneListDetails(listId)

      return {
        phoneListId: listId,
        leadsLoaded: detailsResponse.leads_loaded,
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error
      }

      this.logger.error('Failed to check phone list status', error)
      throw new BadGatewayException('Failed to check phone list status.')
    }
  }

  @Post('phone-list')
  @UseCampaign()
  async uploadPhoneList(
    @ReqCampaign() campaign: Campaign,
    @Body() request: P2pPhoneListRequestSchema,
  ): Promise<P2pPhoneListResponseSchema> {
    try {
      const { token } = await this.p2pPhoneListUploadService.uploadPhoneList(
        campaign,
        request,
      )

      return { token }
    } catch (error) {
      this.logger.error('Failed to upload phone list', error)
      throw new BadGatewayException('Failed to upload phone list.')
    }
  }

  @Post('create-job')
  @UseCampaign()
  @UseInterceptors(
    FilesInterceptor('image', {
      mode: 'buffer',
      mimeTypes: [
        MimeTypes.IMAGE_JPEG,
        MimeTypes.IMAGE_GIF,
        MimeTypes.IMAGE_PNG,
      ],
    }),
  )
  async createJob(
    @ReqCampaign() campaign: Campaign,
    @Body() request: CreateP2pJobRequestDto,
    @ReqFile() image: FileUpload,
  ): Promise<CreateP2pJobResponseDto> {
    try {
      let imageStream: Readable
      if (image.data instanceof Buffer) {
        imageStream = Readable.from(image.data)
      } else {
        imageStream = image.data as Readable
      }

      await this.peerlyP2pJobService.createP2pJob({
        campaignId: campaign.id,
        listId: request.listId,
        imageInfo: {
          fileStream: imageStream,
          fileName: image.filename,
          mimeType: image.mimetype,
          title: request.title,
        },
        scriptText: request.scriptText,
        identityId: request.identityId,
        name: request.name,
        didState: request.didState,
      })

      return { success: true, message: 'P2P job created successfully' }
    } catch (error) {
      this.logger.error('Failed to create P2P job', error)
      return { success: false, message: 'Failed to create P2P job' }
    }
  }
}
