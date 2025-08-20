import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UsePipes,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '../campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '../campaigns/decorators/UseCampaign.decorator'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PhoneListState } from './peerly.types'
import {
  CheckPhoneListStatusSuccessResponseDto,
  CheckPhoneListStatusFailureResponseDto,
} from './schemas/p2pPhoneListStatus.schema'
import { P2pPhoneListRequestSchema } from './schemas/p2pPhoneListRequest.schema'
import { P2pPhoneListResponseSchema } from './schemas/p2pPhoneListResponse.schema'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'

@Controller('p2p')
@UsePipes(ZodValidationPipe)
export class P2pController {
  private readonly logger = new Logger(P2pController.name)

  constructor(
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly p2pPhoneListUploadService: P2pPhoneListUploadService,
  ) {}

  @Get('phone-list/:token/status')
  @UseCampaign()
  async checkPhoneListStatus(
    @ReqCampaign() campaign: Campaign,
    @Param('token') token: string,
  ): Promise<
    | CheckPhoneListStatusSuccessResponseDto
    | CheckPhoneListStatusFailureResponseDto
  > {
    try {
      const statusResponse =
        await this.peerlyPhoneListService.checkPhoneListStatus(token)

      if (statusResponse.Data.list_state !== PhoneListState.ACTIVE) {
        return {
          success: false,
          message: `Phone list is not ready. Current status: ${statusResponse.Data.list_state || 'unknown'}`,
        }
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
        success: true,
        phoneListId: listId,
        leadsLoaded: detailsResponse.leads_loaded,
      }
    } catch (error) {
      this.logger.error('Failed to check phone list status', error)
      throw new BadGatewayException(
        'Failed to check phone list status due to request failure.',
      )
    }
  }

  @Post('phone-list')
  @UseCampaign()
  async uploadPhoneList(
    @ReqCampaign() campaign: Campaign,
    @Body() request: P2pPhoneListRequestSchema,
  ): Promise<P2pPhoneListResponseSchema> {
    try {
      const { token, listName } =
        await this.p2pPhoneListUploadService.uploadPhoneList(campaign, request)

      return {
        success: true,
        token,
        listName,
        message: 'Phone list uploaded successfully',
      }
    } catch (error) {
      this.logger.error('Failed to upload phone list', error)

      return {
        success: false,
        token: '',
        listName: request.listName,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to upload phone list',
      }
    }
  }
}
